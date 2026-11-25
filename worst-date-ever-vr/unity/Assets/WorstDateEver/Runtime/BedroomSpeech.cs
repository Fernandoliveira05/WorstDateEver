using System;
using System.Collections.Concurrent;
using UnityEngine;
#if UNITY_ANDROID && !UNITY_EDITOR
using UnityEngine.Android;
#endif

namespace WorstDateEver
{
    public sealed class BedroomSpeech : MonoBehaviour
    {
        public event Action<string> Heard;
        public event Action<string> Status;
        public bool Listening { get; private set; }
        private readonly ConcurrentQueue<Action> callbacks = new();
        private int turn;
#if UNITY_ANDROID && !UNITY_EDITOR
        private float deadline;
        private AndroidJavaObject recognizer;
        private PermissionCallbacks permissionCallbacks;
#endif

        public void Begin()
        {
            if (Listening) return;
#if UNITY_ANDROID && !UNITY_EDITOR
            var id = ++turn;
            Listening = true;
            deadline = Time.unscaledTime + 30f;
            if (Permission.HasUserAuthorizedPermission(Permission.Microphone)) Run(id);
            else
            {
                Status?.Invoke("Autorize o microfone para falar.");
                permissionCallbacks = new PermissionCallbacks();
                permissionCallbacks.PermissionGranted += _ => callbacks.Enqueue(() => { if (id == turn) Run(id); });
                permissionCallbacks.PermissionDenied += _ => callbacks.Enqueue(() => Finish(id, null, "Microfone não autorizado."));
                Permission.RequestUserPermission(Permission.Microphone, permissionCallbacks);
            }
#else
            Status?.Invoke("Use uma resposta abaixo. O microfone do Quest funciona na versão Android.");
#endif
        }

        private void Update()
        {
            while (callbacks.TryDequeue(out var callback)) callback();
#if UNITY_ANDROID && !UNITY_EDITOR
            if (Listening && Time.unscaledTime >= deadline)
                Finish(turn, null, "Não consegui ouvir. Tente outra vez ou escolha uma resposta.");
#endif
        }

        public void Cancel()
        {
            if (Listening) Finish(turn, null, "Microfone desligado.");
        }

        private void Finish(int id, string text, string status)
        {
            if (!Listening || id != turn) return;
            Listening = false;
            turn++;
#if UNITY_ANDROID && !UNITY_EDITOR
            permissionCallbacks = null;
            OnAndroidThread(() =>
            {
                if (recognizer == null) return;
                recognizer.Call("destroy");
                recognizer.Dispose();
                recognizer = null;
            });
#endif
            Status?.Invoke(status);
            if (!string.IsNullOrWhiteSpace(text)) Heard?.Invoke(text);
        }

        private void OnDisable() => Cancel();

#if UNITY_ANDROID && !UNITY_EDITOR
        private static void OnAndroidThread(Action callback)
        {
            using var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
            using var activity = player.GetStatic<AndroidJavaObject>("currentActivity");
            activity.Call("runOnUiThread", new AndroidJavaRunnable(() => callback()));
        }

        private void Run(int id)
        {
            deadline = Time.unscaledTime + 15f;
            Status?.Invoke("Preparando o microfone…");
            OnAndroidThread(() =>
            {
                try
                {
                    using var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
                    using var activity = player.GetStatic<AndroidJavaObject>("currentActivity");
                    using var api = new AndroidJavaClass("android.speech.SpeechRecognizer");
                    using var system = new AndroidJavaClass("android.os.Build$VERSION");
                    if (system.GetStatic<int>("SDK_INT") < 31 ||
                        !api.CallStatic<bool>("isOnDeviceRecognitionAvailable", activity))
                    {
                        Report(id, null, "Reconhecimento local indisponível. Escolha uma resposta.");
                        return;
                    }
                    using var intent = new AndroidJavaObject("android.content.Intent", "android.speech.action.RECOGNIZE_SPEECH");
                    intent.Call<AndroidJavaObject>("putExtra", "android.speech.extra.LANGUAGE_MODEL", "free_form").Dispose();
                    intent.Call<AndroidJavaObject>("putExtra", "android.speech.extra.LANGUAGE", "pt-BR").Dispose();
                    recognizer = api.CallStatic<AndroidJavaObject>("createOnDeviceSpeechRecognizer", activity);
                    recognizer.Call("setRecognitionListener", new Listener(this, id));
                    recognizer.Call("startListening", intent);
                }
                catch (Exception)
                {
                    Report(id, null, "A fala em português não está disponível neste aparelho.");
                }
            });
        }

        private void Report(int id, string text, string status) =>
            callbacks.Enqueue(() => Finish(id, text, status));

        private sealed class Listener : AndroidJavaProxy
        {
            private readonly BedroomSpeech owner;
            private readonly int id;
            public Listener(BedroomSpeech owner, int id) : base("android.speech.RecognitionListener")
            { this.owner = owner; this.id = id; }
            public void onReadyForSpeech(AndroidJavaObject bundle) => owner.callbacks.Enqueue(() =>
            { if (id == owner.turn) owner.Status?.Invoke("Ouvindo… fale em português."); });
            public void onBeginningOfSpeech() { }
            public void onRmsChanged(float rms) { }
            public void onBufferReceived(byte[] buffer) { }
            public void onEndOfSpeech() => owner.callbacks.Enqueue(() =>
            { if (id == owner.turn) owner.Status?.Invoke("Entendendo a fala…"); });
            public void onPartialResults(AndroidJavaObject bundle) { }
            public void onEvent(int type, AndroidJavaObject bundle) { }
            public void onError(int code) => owner.Report(id, null, "Não consegui reconhecer a fala. Tente uma resposta abaixo.");
            public void onResults(AndroidJavaObject bundle)
            {
                using var list = bundle.Call<AndroidJavaObject>("getStringArrayList", "results_recognition");
                using var first = list != null && list.Call<int>("size") > 0
                    ? list.Call<AndroidJavaObject>("get", 0) : null;
                var result = first?.Call<string>("toString");
                owner.Report(id, result, result == null ? "Nenhuma fala reconhecida." : "");
            }
        }
#endif
    }
}
