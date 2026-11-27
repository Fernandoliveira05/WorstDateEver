export function createNpcSpeech(persona) {
  const audio = new Audio();
  audio.volume = .84;
  const base = new URL(import.meta.env.VITE_DATE_VOICE_URL || '/', location.href);
  let source;

  function stop() {
    if (!source) return;
    source = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    globalThis.speechSynthesis?.cancel();
  }

  function say(view, repeat = false) {
    if (!view || !view.caption || (!view.speechRef && (view.gesture === 'none' ||
      view.caption === view.beat?.presentation.line))) return;
    const ref = /^\/v1\/date\/speech\/clip\/[a-z0-9-]+$/.test(view.speechRef ?? '') ? view.speechRef : null;
    if (!ref) {
      const url = 'browser-speech:' + persona + ':' + view.caption;
      if (!repeat && source === url) return;
      stop();
      source = url;
      if (globalThis.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
        const utterance = new SpeechSynthesisUtterance(view.caption);
        utterance.lang = 'pt-BR';
        const portuguese = globalThis.speechSynthesis.getVoices().find(voice =>
          voice.lang?.toLowerCase() === 'pt-br');
        if (portuguese) utterance.voice = portuguese;
        utterance.rate = { caio: .92, rafa: 1.04, bia: 1.02, luiza: .98 }[persona] ?? .96;
        utterance.pitch = { caio: .94, rafa: .96, bia: 1.07, luiza: 1.02 }[persona] ?? 1;
        globalThis.speechSynthesis.speak(utterance);
      }
      return;
    }
    const url = new URL(ref, base).href;
    if (!repeat && source === url) return;
    stop();
    source = url;
    audio.src = url;
    void audio.play().catch(() => {});
  }

  return { say, stop, playing: () => Boolean(source &&
    (source.startsWith('browser-speech:') ? globalThis.speechSynthesis?.speaking : !audio.paused && !audio.ended)) };
}
