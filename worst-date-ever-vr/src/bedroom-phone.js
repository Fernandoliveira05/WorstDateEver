import { PHASES, STORAGE_KEY, initialState, transition, validateSave } from './game-machine.mjs';
import { eligibleProfiles, profiles } from './profiles.mjs';

const WIDTH = 420;
const HEIGHT = 800;
const items = [
  ['none', 'Sem item'], ['weed', 'Maconha'], ['lsd', 'LSD'], ['alcohol', 'Álcool'], ['dmt', 'DMT']
];
const portrait = { caio: 'Caio', rafa: 'Rafa', bia: 'Bia', luiza: 'Luiza' };
const replies = {
  caio: 'Uma coisa antes: você prefere café ou debater o conceito de café?',
  rafa: 'Show. Reservei duas cadeiras. Três, se a minha ex aparecer.',
  bia: 'Fechado. Chega cedo para eu fingir que não fiquei te esperando.',
  luiza: 'Combinado. Se o garçom perguntar, o cavalo ficou lá fora.'
};

export function loadBedroomStory() {
  try {
    const save = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (validateSave(save)) return { ...initialState(), ...save };
  } catch { /* Hosting may disable storage. */ }
  return initialState();
}

export function createPhone(THREE, model, data, asset, notify) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(...data.size), new THREE.MeshBasicMaterial({
    map: texture, toneMapped: false
  }));
  screen.position.fromArray(data.screen);
  screen.position.z -= .0015;
  screen.rotation.y = Math.PI;
  model.add(screen);
  screen.userData.screen = true;

  const images = {};
  const load = (key, path) => {
    const image = new Image();
    image.onload = draw;
    image.src = asset(path);
    images[key] = image;
  };
  const dark = '#271836';
  const plum = '#9a75a2';
  const pearl = '#f7efdf';
  const blush = '#efb3b3';
  const mint = '#b6d9c3';
  const hits = [];
  let state = loadBedroomStory();
  let home = true;
  let reply = '';
  let gesture = null;
  let speech = null;
  let voiceAction = 0;

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Hosting may disable storage. */ }
    notify(state);
    draw();
  }

  function dispatch(type, value) {
    const next = transition(state, { type, value });
    if (next !== state) {
      state = type === 'RESET' ? next : { ...state, ...next };
      cancelSpeech();
      reply = '';
      save();
    }
  }

  function appearance(choice) {
    state.appearance = choice ?? ((state.appearance || 0) + 1) % 3;
    save();
  }

  function selectItem(index) {
    if (state.phase !== PHASES.PREP || !items[index]) return;
    state.prep = index;
    save();
  }

  function reset() { cancelSpeech(); home = true; dispatch('RESET'); }

  function depart() {
    if (state.phase === PHASES.PREP) dispatch('CHOOSE_SUBSTANCE', items[state.prep || 0][0]);
    else if (state.phase === PHASES.EXIT) notify(state, null, true);
  }

  function windowTime() {
    return state.windowTime ?? (['wait', 'prep', 'exit', 'aftermath'].includes(state.phase) ? 2 : 0);
  }

  function cycleWindow() {
    const current = windowTime();
    state.windowTime = (current + 1) % 3;
    save();
  }

  function answer(heard) {
    const text = heard.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const person = profiles.find(item => item.id === state.matchId);
    if (!person) return;
    if (/onde|lugar/.test(text)) reply = person.location + '. Vou estar na mesa com a cadeira desmontando.';
    else if (/hora|quando/.test(text)) reply = 'Daqui a duas horas. Se eu disser que já estou saindo, acrescenta meia hora.';
    else reply = replies[person.id];
    notify(state, reply);
    draw();
  }

  function cancelSpeech() {
    voiceAction++;
    if (!speech) return;
    const recognition = speech;
    speech = null;
    recognition.abort();
  }

  async function talk() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      reply = 'Reconhecimento de fala indisponível. Escolha uma pergunta abaixo.';
      draw();
      return;
    }
    if (speech) {
      cancelSpeech();
      reply = 'Microfone desligado.';
      draw();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    if (!('processLocally' in recognition)) {
      reply = 'Reconhecimento local indisponível. Escolha uma pergunta abaixo.';
      draw();
      return;
    }
    recognition.processLocally = true;
    const request = ++voiceAction;
    const preferences = { langs: ['pt-BR'], processLocally: true };
    if (Recognition.available) {
      try {
        const availability = await Recognition.available(preferences);
        if (request !== voiceAction) return;
        if (availability !== 'available') {
          reply = availability === 'downloadable' || availability === 'downloading'
            ? 'Instalando o reconhecimento em português…' : 'Reconhecimento local indisponível.';
          draw();
          const installed = ['downloadable', 'downloading'].includes(availability) &&
            Boolean(await Recognition.install?.(preferences));
          if (request !== voiceAction) return;
          if (!installed) {
            reply = 'Fala em português indisponível. Escolha uma pergunta abaixo.';
            draw();
            return;
          }
        }
      } catch {
        if (request === voiceAction) {
          reply = 'Não consegui preparar o microfone. Escolha uma pergunta abaixo.';
          draw();
        }
        return;
      }
    }
    recognition.onresult = event => {
      if (speech !== recognition) return;
      speech = null;
      answer(event.results[0][0].transcript);
    };
    recognition.onerror = () => {
      if (speech !== recognition) return;
      speech = null;
      reply = 'Não consegui ouvir. Tente outra vez ou escolha uma pergunta.';
      draw();
    };
    recognition.onend = () => {
      if (speech !== recognition) return;
      speech = null;
      reply = 'Nenhuma fala detectada.';
      draw();
    };
    try {
      speech = recognition;
      recognition.start();
      reply = 'Ouvindo… fale em português.';
    } catch {
      speech = null;
      reply = 'Microfone indisponível. Escolha uma pergunta abaixo.';
    }
    draw();
  }

  function box(x, y, width, height, color, radius = 12) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function text(value, x, y, size, color = dark, weight = 500, align = 'left') {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y, WIDTH - 30);
  }

  function copy(value, x, y, max, size, color = dark, gap = 1.24) {
    ctx.font = `500 ${size}px system-ui, sans-serif`;
    let line = '';
    for (const word of value.split(' ')) {
      const phrase = line ? line + ' ' + word : word;
      if (line && ctx.measureText(phrase).width > max) {
        text(line, x, y, size, color);
        line = word;
        y += size * gap;
      } else line = phrase;
    }
    if (line) text(line, x, y, size, color);
  }

  function image(key, x, y, w, h) {
    const source = images[key];
    if (source?.naturalWidth) ctx.drawImage(source, x, y, w, h);
  }

  function button(label, fn, x, y, w, h, color = dark, ink = pearl, size = 23) {
    box(x, y, w, h, color);
    text(label, x + w / 2, y + h / 2, size, ink, 700, 'center');
    hits.push({ x, y, w, h, fn });
  }

  function launcher() {
    box(0, 0, WIDTH, HEIGHT, dark, 0);
    image('wallpaper', 0, 0, WIDTH, HEIGHT);
    text('iClona', 27, 37, 25, '#fff3eb', 750);
    text(['16:41', '14:04', '20:41'][windowTime()],
      393, 37, 19, '#fff3eb', 600, 'right');
    box(33, 114, 86, 86, '#704052', 21);
    image('icon', 33, 114, 86, 86);
    text('Deu Ruim', 76, 231, 22, '#fff5ed', 650, 'center');
    hits.push({ x: 21, y: 101, w: 111, h: 153, fn: () => { home = false; draw(); } });
    box(22, 540, 376, 175, '#281c3bf0');
    const label = ['Entardecer', 'Dia', 'Noite'][windowTime()];
    button('Janela · ' + label, cycleWindow, 38, 557, 344, 58, '#563c60', '#fff3eb');
    button(state.reducedIntensity ? 'Efeitos · Suaves' : 'Efeitos · Padrão', () => {
      state.reducedIntensity = !state.reducedIntensity;
      save();
    }, 38, 633, 344, 58, '#563c60', '#fff3eb');
  }

  function browse() {
    const person = eligibleProfiles(state.preference)[state.profileIndex];
    if (!person) return;
    ctx.save();
    const drag = gesture?.phase === PHASES.BROWSE && gesture.swipe ? gesture.delta : 0;
    ctx.translate(WIDTH * .5 + drag * .63, 346);
    ctx.rotate(drag * .0006);
    ctx.translate(-WIDTH * .5, -346);
    box(23, 129, 374, 465, '#fffdf8', 15);
    box(37, 143, 346, 316, person.color, 0);
    image(person.id, 37, 143, 346, 316);
    text(`${person.name}, ${person.age}`, 44, 487, 35, dark, 780);
    copy(person.bio, 44, 525, 320, 24);
    if (Math.abs(drag) > 34) {
      box(drag > 0 ? 53 : 231, 169, 133, 45, drag > 0 ? mint : blush);
      text(drag > 0 ? 'CURTIR' : 'PASSAR', drag > 0 ? 119 : 298, 192, 24, dark, 800, 'center');
    }
    ctx.restore();
    button('× PASSAR', () => dispatch('SKIP_PROFILE'), 23, 614, 178, 70, blush, dark);
    button('♥ CURTIR', () => dispatch('LIKE_PROFILE'), 219, 614, 178, 70, mint, dark);
  }

  function app() {
    box(0, 0, WIDTH, HEIGHT, pearl, 0);
    button('‹', () => { cancelSpeech(); home = true; draw(); }, 22, 29, 69, 54, dark, pearl, 34);
    text('Deu Ruim', WIDTH / 2 + 30, 57, 36, dark, 800, 'center');
    box(26, 99, 368, 3, '#ddc3c9', 0);
    switch (state.phase) {
      case PHASES.INTRO:
        image('icon', 158, 174, 104, 104);
        text('Só um encontro.', 210, 332, 33, dark, 790, 'center');
        copy('O que poderia dar errado?', 63, 388, 296, 26);
        button('COMEÇAR', () => dispatch('START'), 23, 630, 374, 64);
        break;
      case PHASES.IDENTITY:
        text('Quem é você?', 210, 216, 36, dark, 790, 'center');
        button('HOMEM', () => dispatch('CHOOSE_AVATAR', 'male'), 23, 356, 374, 72);
        button('MULHER', () => dispatch('CHOOSE_AVATAR', 'female'), 23, 454, 374, 72);
        break;
      case PHASES.PREFERENCE:
        text('Quem você quer ver?', 210, 216, 31, dark, 790, 'center');
        [['HOMENS', 'men'], ['MULHERES', 'women'], ['TODOS', 'all']].forEach(([label, value], i) => {
          button(label, () => dispatch('CHOOSE_PREFERENCE', value), 23, 335 + i * 92, 374, 68);
        });
        break;
      case PHASES.BROWSE:
        browse();
        break;
      case PHASES.MATCH: {
        const person = profiles.find(item => item.id === state.matchId);
        if (!person) break;
        text(`Match com ${person.name}!`, 210, 142, 30, dark, 790, 'center');
        image(person.id, 127, 169, 166, 151);
        box(25, 341, 370, 126, '#e9dbe9');
        copy(reply || replies[person.id], 41, 375, 337, 22);
        button(speech ? 'CANCELAR FALA' : 'FALAR', talk, 24, 481, 372, 52);
        button('ONDE?', () => answer('onde'), 24, 548, 179, 51, blush, dark, 19);
        button('QUE HORAS?', () => answer('que horas'), 217, 548, 179, 51, mint, dark, 19);
        button('MAIS TARDE', () => dispatch('ADVANCE_TIME'), 24, 621, 372, 58);
        break;
      }
      case PHASES.WAIT:
        text('Já anoiteceu.', 210, 208, 35, dark, 790, 'center');
        copy('Faltam minutos para sair. Ainda dá tempo de fazer uma má escolha.', 30, 295, 360, 26);
        button('ME PREPARAR', () => dispatch('FEEL_ANXIOUS'), 23, 622, 374, 66);
        break;
      case PHASES.PREP:
        text('Hora de sair', 210, 180, 34, dark, 790, 'center');
        copy('Leve algo até a bandeja ou siga com a escolha atual.', 30, 242, 355, 24);
        text(items[state.prep || 0][1], 210, 387, 29, dark, 700, 'center');
        button('TROCAR ROUPA', appearance, 23, 516, 374, 62, blush, dark);
        button('PRONTO', depart, 23, 616, 374, 64);
        break;
      case PHASES.EXIT:
        text('O encontro espera.', 210, 247, 32, dark, 790, 'center');
        button('PARTIR', depart, 23, 531, 374, 65);
        button('RECOMEÇAR', reset, 23, 620, 374, 65);
        break;
      default:
        text(state.phase === PHASES.EXIT ? 'O encontro espera.' : 'A noite saiu do plano.',
          210, 247, 32, dark, 790, 'center');
        button('RECOMEÇAR', reset, 23, 620, 374, 65);
    }
  }

  function draw() {
    hits.length = 0;
    if (home) launcher();
    else app();
    box(132, 752, 156, 6, home ? '#f4d9eb' : plum, 3);
    texture.needsUpdate = true;
  }

  function position(world) {
    const local = screen.worldToLocal(world.clone());
    const x = (local.x / data.size[0] + .5) * WIDTH;
    const y = (.5 - local.y / data.size[1]) * HEIGHT;
    return { x, y, z: local.z, inside: x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT };
  }

  function press(id, at) {
    if (!at.inside || gesture) return false;
    const swipe = !home && state.phase === PHASES.BROWSE && at.x > 20 && at.x < 400 && at.y > 125 && at.y < 594;
    gesture = { id, at, swipe, phase: state.phase, delta: 0 };
    return true;
  }

  function drag(id, at) {
    if (gesture?.id !== id || !gesture.swipe) return;
    gesture.delta = Math.max(-300, Math.min(300, at.x - gesture.at.x));
    draw();
  }

  function release(id, at, commit = true) {
    if (gesture?.id !== id) return;
    const previous = gesture;
    gesture = null;
    if (commit) {
      if (previous.swipe && Math.abs(at.x - previous.at.x) >= 72) {
        dispatch(at.x > previous.at.x ? 'LIKE_PROFILE' : 'SKIP_PROFILE');
      } else if (at.inside && Math.hypot(at.x - previous.at.x, at.y - previous.at.y) < 35) {
        hits.find(hit => at.x >= hit.x && at.y >= hit.y && at.x <= hit.x + hit.w && at.y <= hit.y + hit.h)?.fn();
      }
    }
    draw();
  }

  load('wallpaper', 'PhoneWallpaper.png');
  load('icon', 'BadDateIcon.png');
  for (const [id, name] of Object.entries(portrait)) load(id, `Characters/${name}-Portrait.png`);
  draw();
  return { screen, position, press, drag, release, getState: () => state, cycleWindow, selectItem,
    appearance, depart, reset, cancelSpeech, draw };
}
