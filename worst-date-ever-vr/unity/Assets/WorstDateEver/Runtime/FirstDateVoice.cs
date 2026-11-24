using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;
#if UNITY_ANDROID && !UNITY_EDITOR
using UnityEngine.Android;
#endif

namespace WorstDateEver
{
    public sealed class FirstDateVoice : MonoBehaviour
    {
        [Serializable] private sealed class Config { public string url; }
        [Serializable] private sealed class Ticket { public string sessionId, token, socketPath; public int next = 1; }
        [Serializable] private sealed class Format { public string encoding = "pcm_s16le"; public int sampleRateHz, channels = 1; }
        [Serializable] private sealed class Context { public string type = "date.context", sessionId; public int turnId; public FirstDateStory.ActionRecord[] actions; }
        [Serializable] private sealed class Control { public string type, sessionId; public int turnId = 1; }
        [Serializable] private sealed class Open { public string type = "audio.start", sessionId; public int turnId = 1; public Format format; }
        [Serializable] private sealed class Reply { public string sessionId, personaId, text, gesture; public int turnId; }
        [Serializable] private sealed class Packet { public string type, sessionId, text; public int turnId; public Reply reply; }

        private const int SampleRate = 16000, MaxSeconds = 10;
        private FirstDateStory story;
        private Uri endpoint;
        private Ticket savedTicket;
        private AudioClip clip;
        private CancellationTokenSource request;
        private bool pending, processing;
        private float deadline;
        private int sequence;
        public bool Consented { get; private set; }
        public string Message { get; private set; } = "";
        public bool Available => endpoint != null;
        public bool Recording => clip;
        public bool Busy => pending || Recording || processing;
        private const string Fallback = "Microfone indisponível. Continue com as opções na mesa.";

        public void Initialize(FirstDateStory firstDate)
        {
            story = firstDate;
            var config = Resources.Load<TextAsset>("FirstDate/VoiceEndpoint");
            if (config && Uri.TryCreate(JsonUtility.FromJson<Config>(config.text)?.url, UriKind.Absolute, out var parsed) &&
                (parsed.Scheme == "https" || parsed.IsLoopback && parsed.Scheme == "http"))
                endpoint = new Uri(parsed, "/");
        }

        public void Toggle()
        {
            if (Recording || pending) Stop();
            else Begin();
        }

        public void Begin()
        {
            if (!Available || Recording || pending || processing || story.Options().Length == 0 ||
                story.Options()[0].id != "honest") return;
            if (!Consented)
            {
                Consented = true;
                Message = "A fala é enviada ao serviço. Toque em Falar para gravar. Pode desligar a qualquer hora.";
                return;
            }
            pending = true;
            Message = "Preparando o microfone…";
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!Permission.HasUserAuthorizedPermission(Permission.Microphone))
            {
                var callbacks = new PermissionCallbacks();
                callbacks.PermissionGranted += _ => Capture();
                callbacks.PermissionDenied += _ => Denied();
                Permission.RequestUserPermission(Permission.Microphone, callbacks);
                return;
            }
#endif
            Capture();
        }

        private void Denied()
        {
            pending = false;
            Message = Fallback;
        }

        private void Capture()
        {
            if (!pending || !Consented) return;
            pending = false;
            try
            {
                clip = Microphone.Start(null, false, MaxSeconds + 1, SampleRate);
                if (!clip) { Denied(); return; }
                deadline = Time.realtimeSinceStartup + MaxSeconds;
                sequence = story.State.turnSequence;
                Message = "● Gravando · toque para parar";
            }
            catch { Denied(); }
        }

        private void Update()
        {
            if (Recording && Time.realtimeSinceStartup >= deadline) Stop();
        }

        public void Stop()
        {
            if (pending) { pending = false; Message = "Microfone desligado."; return; }
            if (!clip) return;
            var count = Microphone.GetPosition(null);
            var rate = clip.frequency;
            var channels = clip.channels;
            count = Mathf.Clamp(count, 0, Mathf.Min(clip.samples, rate * MaxSeconds));
            var data = new float[count * channels];
            if (count > 0) clip.GetData(data, 0);
            StopCapture();
            if (count < rate / 5) { Message = Fallback; return; }
            var pcm = Resample(data, channels, rate, SampleRate);
            _ = Send(pcm, sequence);
        }

        private void StopCapture()
        {
            if (!clip) return;
            Microphone.End(null);
            Destroy(clip);
            clip = null;
        }

        public void Interrupt()
        {
            pending = false;
            StopCapture();
            if (request != null) savedTicket = null;
            request?.Cancel();
            request = null;
            processing = false;
            Message = "";
        }

        public void Cancel()
        {
            Consented = false;
            Interrupt();
        }

        private static byte[] Resample(float[] data, int channels, int sampleRate, int target)
        {
            var count = data.Length / channels;
            var frames = count * target / sampleRate;
            var bytes = new byte[frames * 2];
            for (int i = 0; i < frames; i++)
            {
                var first = i * sampleRate / target;
                var end = Mathf.Min(count, Mathf.Max(first + 1, (i + 1) * sampleRate / target));
                var value = 0f;
                for (var j = first * channels; j < end * channels; j++) value += data[j];
                value = Mathf.Clamp(value / ((end - first) * channels), -1, 1);
                var sample = (short)(value * (value < 0 ? 32768 : 32767));
                bytes[i * 2] = (byte)sample;
                bytes[i * 2 + 1] = (byte)(sample >> 8);
            }
            return bytes;
        }

        private async Task Send(byte[] bytes, int dateSequence)
        {
            var turn = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            request = turn;
            processing = true;
            Message = "Ouvindo a gravação…";
            var token = turn.Token;
            try
            {
                var ticket = savedTicket ?? await IssueTicket(token);
                savedTicket = ticket;
                var wire = ticket.next;
                var socketEndpoint = new UriBuilder(new Uri(endpoint, ticket.socketPath)) {
                    Scheme = endpoint.Scheme == "https" ? "wss" : "ws", Query = "token=" + Uri.EscapeDataString(ticket.token)
                }.Uri;
                using var socket = new ClientWebSocket();
                await socket.ConnectAsync(socketEndpoint, token);
                await ControlMessage(socket, new Context { sessionId = ticket.sessionId, turnId = wire,
                    actions = story.Actions.ToArray() }, token);
                await ControlMessage(socket, new Open { sessionId = ticket.sessionId, turnId = wire, format = new Format { sampleRateHz = SampleRate } }, token);
                for (int i = 0; i < bytes.Length; i += 4096)
                    await socket.SendAsync(new ArraySegment<byte>(bytes, i, Math.Min(4096, bytes.Length - i)),
                        WebSocketMessageType.Binary, true, token);
                await ControlMessage(socket, new Control { sessionId = ticket.sessionId, turnId = wire, type = "audio.end" }, token);
                var buffer = new byte[8192];
                while (socket.State == WebSocketState.Open)
                {
                    var length = 0;
                    WebSocketReceiveResult result;
                    do
                    {
                        if (length == buffer.Length) throw new InvalidOperationException();
                        result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer, length, buffer.Length - length), token);
                        length += result.Count;
                    } while (!result.EndOfMessage);
                    if (result.MessageType != WebSocketMessageType.Text) throw new InvalidOperationException();
                    var packet = JsonUtility.FromJson<Packet>(Encoding.UTF8.GetString(buffer, 0, length));
                    if (packet is null || packet.sessionId != ticket.sessionId || packet.turnId != wire)
                        throw new InvalidOperationException();
                    token.ThrowIfCancellationRequested();
                    if (packet.type == "transcript.final" && packet.text != null)
                    {
                        Message = "Você: " + packet.text.Substring(0, Mathf.Min(145, packet.text.Length));
                        continue;
                    }
                    if (packet.type == "npc.reply" && packet.reply != null && packet.reply.sessionId == ticket.sessionId &&
                        packet.reply.personaId == story.Person.id && packet.reply.turnId == wire &&
                        story.Remote(dateSequence, packet.reply.text, packet.reply.gesture))
                    {
                        ticket.next++;
                        return;
                    }
                    throw new InvalidOperationException();
                }
            }
            catch
            {
                if (request == turn) { Message = Fallback; savedTicket = null; }
            }
            finally
            {
                if (request == turn) { request = null; processing = false; }
                turn.Dispose();
            }
        }

        private async Task<Ticket> IssueTicket(CancellationToken token)
        {
            using var http = new UnityWebRequest(new Uri(endpoint, "v1/date/session"), "POST");
            http.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonUtility.ToJson(story.Entry)));
            http.downloadHandler = new DownloadHandlerBuffer();
            http.SetRequestHeader("Content-Type", "application/json");
            http.timeout = 5;
            var operation = http.SendWebRequest();
            while (!operation.isDone)
            {
                if (token.IsCancellationRequested) { http.Abort(); token.ThrowIfCancellationRequested(); }
                await Task.Yield();
            }
            if (http.result != UnityWebRequest.Result.Success) throw new InvalidOperationException();
            var ticket = JsonUtility.FromJson<Ticket>(http.downloadHandler.text);
            ticket.next = 1;
            return ticket;
        }

        private static Task ControlMessage<T>(ClientWebSocket socket, T packet, CancellationToken token) =>
            socket.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(JsonUtility.ToJson(packet))), WebSocketMessageType.Text, true, token);

        private void OnDestroy() => Cancel();
    }
}
