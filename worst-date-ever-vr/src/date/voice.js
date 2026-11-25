import workletURL from './pcm-worklet.js?url';

const messages = {
  silence: 'A gravação chegou sem fala clara. Fale mais perto do microfone.',
  provider: 'O serviço de voz falhou. Tente outra vez ou escolha uma frase.',
  reply: 'O personagem não conseguiu responder. Tente outra vez.',
  permission: 'Permita o microfone nas permissões deste site e tente outra vez.',
  device: 'Nenhum microfone encontrado. Confira a entrada de áudio do navegador.',
  network: 'A conexão com o serviço de voz caiu. Tente outra vez.'
};

export function createDateVoice({ handoff, director, observe }) {
  let active, ticket, consented = false, message = '', recording = false, level = 0;
  const base = new URL(import.meta.env.VITE_DATE_VOICE_URL || '/', location.href);
  const ready = window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode);

  function closeCapture(turn) {
    clearTimeout(turn.recordTimer);
    turn.stream?.getTracks().forEach(track => track.stop());
    turn.processor?.disconnect();
    if (turn.context && turn.context.state !== 'closed') void turn.context.close().catch(() => {});
    recording = false;
    level = 0;
  }

  function endTurn(status = '', keepTicket = false) {
    const turn = active;
    active = null;
    if (turn) {
      if (!keepTicket) ticket = null;
      clearTimeout(turn.timeout);
      clearTimeout(turn.replyTimer);
      closeCapture(turn);
      turn.abort.abort();
      if (turn.ws?.readyState === WebSocket.OPEN && turn.started && !turn.sentEnd)
        turn.ws.send(JSON.stringify({ type: 'audio.cancel', sessionId: turn.sessionId, turnId: turn.wire }));
      if (turn.ws && turn.ws.readyState < WebSocket.CLOSING) turn.ws.close();
    }
    message = status;
  }

  function cancel() { consented = false; endTurn(); }

  function packet(turn, type, fields = {}) {
    turn.ws.send(JSON.stringify({ type, sessionId: turn.sessionId, turnId: turn.wire, ...fields }));
  }

  function flush(turn) {
    if (!turn.started || active !== turn) return;
    if (turn.ws.readyState !== WebSocket.OPEN || turn.ws.bufferedAmount > 384 * 1024) {
      endTurn(messages.network);
      return;
    }
    for (const frame of turn.frames) turn.ws.send(frame);
    turn.frames.length = 0;
    if (turn.ended && !turn.sentEnd) {
      turn.sentEnd = true;
      packet(turn, 'audio.end');
      turn.replyTimer = setTimeout(() => endTurn(messages.network), 16000);
    }
  }

  function stop() {
    const turn = active;
    if (!turn || turn.ended) return;
    if (!recording) { endTurn('Microfone desligado.'); return; }
    turn.ended = true;
    closeCapture(turn);
    if (turn.samples < 3200) { endTurn('Fale por um instante antes de enviar.'); return; }
    message = 'Transcrevendo…';
    flush(turn);
  }

  async function connect(turn) {
    if (!ticket) {
      const response = await fetch(new URL('v1/date/session', base), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(handoff), signal: turn.abort.signal
      });
      if (!response.ok) throw new Error('Voice service unavailable');
      const credentials = await response.json();
      if (active !== turn) return;
      ticket = { ...credentials, next: 1 };
    }
    turn.sessionId = ticket.sessionId;
    turn.wire = ticket.next;
    const wsUrl = new URL(ticket.socketPath, base);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.searchParams.set('token', ticket.token);
    const ws = new WebSocket(wsUrl);
    turn.ws = ws;
    ws.onclose = () => { if (active === turn) endTurn(messages.network); };
    ws.onmessage = event => {
      if (active !== turn) return;
      try {
        const reply = JSON.parse(event.data);
        if (reply.sessionId !== turn.sessionId || reply.turnId !== turn.wire) return;
        if (reply.type === 'voice.error') { endTurn(messages[reply.reason] ?? messages.provider); return; }
        if (reply.type === 'transcript.final') { message = 'Você: ' + reply.text.slice(0,145); return; }
        if (reply.type === 'npc.reply' && reply.reply?.sessionId === turn.sessionId &&
          reply.reply?.personaId === handoff.matchId && reply.reply.turnId === turn.wire &&
          director.remote(turn.sequence, reply.reply)) {
          ticket.next++;
          endTurn(message, true);
        } else endTurn(messages.reply);
      } catch { endTurn(messages.reply); }
    };
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('close', reject, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    if (active !== turn) return;
    packet(turn, 'date.context', { actions: turn.actions, ...(turn.world ? { world: turn.world } : {}) });
    packet(turn, 'audio.start', { format: { encoding: 'pcm_s16le', sampleRateHz: 16000, channels: 1 } });
    turn.started = true;
    clearTimeout(turn.timeout);
    flush(turn);
  }

  async function begin() {
    if (!ready || active || !director.view().canSpeak) return;
    if (!consented) {
      consented = true;
      message = 'O áudio vai à transcrição. Pressione A, V ou Falar para gravar.';
      return;
    }
    const view = director.view();
    const turn = { sequence: view.session.turnSequence, actions: view.actions, world: observe?.(), abort: new AbortController(),
      frames: [], samples: 0 };
    active = turn;
    message = 'Abrindo o microfone…';
    turn.timeout = setTimeout(() => {
      if (active === turn && !turn.started)
        endTurn(recording || turn.ended ? messages.network : messages.device);
    }, 20000);
    try {
      turn.context = new AudioContext();
      const resume = turn.context.resume().catch(() => {});
      // Ask for the device while this is still the user action.
      const getStream = navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1, echoCancellation: true, noiseSuppression: true,
        autoGainControl: true
      } });
      const stream = await getStream;
      if (active !== turn) { stream.getTracks().forEach(track => track.stop()); return; }
      turn.stream = stream;
      await resume;
      await turn.context.audioWorklet.addModule(workletURL);
      if (active !== turn) return;
      stream.getTracks().forEach(track => track.addEventListener('ended', () => {
        if (active === turn && recording && !turn.ended) endTurn(messages.device);
      }));
      turn.processor = new AudioWorkletNode(turn.context, 'date-pcm', { channelCount: 1 });
      turn.processor.port.onmessage = ({ data }) => {
        if (active !== turn || turn.ended) return;
        const frame = new Int16Array(data);
        let power = 0;
        for (const sample of frame) power += (sample / 32768) ** 2;
        const rms = Math.sqrt(power / frame.length);
        level = Math.max(level * .94, Math.min(5, Math.ceil(Math.max(0, Math.log10(rms + .00001) + 3) * 1.75)));
        turn.samples += frame.length;
        turn.frames.push(data);
        flush(turn);
      };
      const mute = turn.context.createGain();
      mute.gain.value = 0;
      turn.context.createMediaStreamSource(stream).connect(turn.processor).connect(mute).connect(turn.context.destination);
      turn.recordTimer = setTimeout(stop, 10000);
      recording = true;
      message = 'Gravando · A, V ou Parar para enviar';
      void connect(turn).catch(() => { if (active === turn) endTurn(messages.network); });
    } catch (error) {
      if (active === turn) endTurn(error.name === 'NotAllowedError' ? messages.permission : messages.device);
    }
  }

  return {
    state: () => ({ ready, recording, consented, message, level: Math.ceil(level), busy: Boolean(active) }),
    toggle: () => active ? stop() : void begin(),
    begin, stop, cancel,
    choose(id) {
      if (director.choose(id)) endTurn();
    }
  };
}
