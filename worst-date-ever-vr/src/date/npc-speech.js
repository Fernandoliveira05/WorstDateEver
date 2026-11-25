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
        utterance.rate = .96;
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

  return { say, stop };
}
