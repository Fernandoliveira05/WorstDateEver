import { candyById } from './candies.mjs';
import { PHASES, STORAGE_KEY, initialState, transition, validateSave } from './game-machine.mjs';
import { eligibleProfiles, profiles } from './profiles.mjs';

const WIDTH = 420;
const HEIGHT = 800;
const dark = '#271836';
const pearl = '#f7efdf';
const rose = '#c77c93';
const teal = '#476f73';
const amber = '#a97f43';

export function stylePhoneCase(THREE, model, data) {
  model.traverse(object => { if (object.isMesh) object.visible = false; });
  const [width, height] = data.size;
  const face = data.screen[2];
  const caseMaterial = new THREE.MeshStandardMaterial({ color: rose, roughness: .36 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x1a111d, roughness: .42 });

  function shell(w, h, radius, depth, bevel, z, material) {
    const x = w / 2, y = h / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-x + radius, -y);
    shape.lineTo(x - radius, -y);
    shape.quadraticCurveTo(x, -y, x, -y + radius);
    shape.lineTo(x, y - radius);
    shape.quadraticCurveTo(x, y, x - radius, y);
    shape.lineTo(-x + radius, y);
    shape.quadraticCurveTo(-x, y, -x, y - radius);
    shape.lineTo(-x, -y + radius);
    shape.quadraticCurveTo(-x, -y, -x + radius, -y);
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
      depth, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 7
    }), material);
    mesh.position.z = z;
    mesh.castShadow = mesh.receiveShadow = true;
    model.add(mesh);
  }

  shell(width + .008, height + .011, .017, .019, .002, face + .004, caseMaterial);
  shell(width + .003, height + .004, .014, .005, .0008, face - .0004, rimMaterial);
  const button = new THREE.Mesh(new THREE.BoxGeometry(.003, .024, .006), rimMaterial);
  button.position.set(-(width + .01) / 2, .043, face + .013);
  model.add(button);

  const camera = new THREE.Mesh(new THREE.CylinderGeometry(.007, .007, .002, 20), rimMaterial);
  camera.rotation.x = Math.PI / 2;
  camera.position.set(-.033, .077, face + .024);
  model.add(camera);
}

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

export function createPhone(THREE, model, data, asset, notify, artwork) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(...data.size), new THREE.MeshBasicMaterial({
    map: texture, toneMapped: false, alphaTest: .5
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
      return true;
    }
    return false;
  }

  function toggleEffects() {
    state.reducedIntensity = !state.reducedIntensity;
    save();
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

  function eatCandy(id) { return dispatch('EAT_CANDY', id); }

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
    if (source?.width) ctx.drawImage(source, x, y, w, h);
  }

  function button(label, fn, x, y, w, h, color = teal, ink = pearl, size = 23) {
    box(x, y, w, h, color);
    text(label, x + w / 2, y + h / 2, size, ink, 700, 'center');
    hits.push({ x, y, w, h, fn });
  }

  function backdrop() {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, dark);
    gradient.addColorStop(1, '#4b233e');
    box(0, 0, WIDTH, HEIGHT, gradient, 0);
    function wave(color, y, dip) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(77, y - 92, 116, y + dip, 205, y + dip * .7);
      ctx.bezierCurveTo(297, y + dip * .3, 350, y - 76, WIDTH, y - 32);
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.lineTo(0, HEIGHT);
      ctx.closePath();
      ctx.fill();
    }
    wave('#693951', 485, 63);
    wave('#85475f', 552, 68);
  }

  function statusBar() {
    text(['16:41', '14:04', '20:34'][windowTime()], 29, 35, 21, pearl, 720);
    box(176, 16, 68, 15, '#18101f', 9);
    box(197, 22, 19, 2, teal, 1);
    const bars = [5, 8, 12, 16];
    bars.forEach((height, i) => box(314 + i * 5, 42 - height, 3, height, pearl, 1));
    ctx.strokeStyle = pearl;
    ctx.lineWidth = 2.5;
    for (const radius of [7, 11]) {
      ctx.beginPath();
      ctx.arc(348, 43, radius, Math.PI * 1.16, Math.PI * 1.84);
      ctx.stroke();
    }
    box(347, 41, 2.5, 2.5, pearl, 1);
    box(365, 29, 25, 14, pearl, 4);
    box(367, 31, 21, 10, dark, 2);
    box(369, 33, 16, 6, pearl, 1);
    box(391, 33, 2, 6, pearl, 1);
  }

  function heartMark(cx, y, size) {
    image('heart', cx - size / 2, y, size, size * .92);
    ctx.strokeStyle = amber;
    ctx.lineCap = 'round';
    ctx.lineWidth = size * .052;
    for (const [x1, y1, x2, y2] of [[.46, .18, .56, .10], [.51, .32, .65, .29], [.50, .45, .62, .50]]) {
      ctx.beginPath();
      ctx.moveTo(cx + size * x1, y + size * y1);
      ctx.lineTo(cx + size * x2, y + size * y2);
      ctx.stroke();
    }
  }

  function title(label, x, y, size) {
    ctx.fillStyle = pearl;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `950 ${size}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
    ctx.fillText(label, x, y, WIDTH - 42);
  }

  function launcher() {
    const open = () => { home = false; draw(); };
    box(109, 138, 202, 191, '#39243e', 40);
    heartMark(203, 158, 143);
    title('Deu Ruim', 210, 379, 54);
    hits.push({ x: 83, y: 124, w: 254, h: 291, fn: open });
    button('Abrir', open, 44, 446, 332, 62, rose, dark, 27);
    button('Janela · ' + ['Entardecer', 'Dia', 'Noite'][windowTime()], cycleWindow, 44, 578, 332, 58);
    button(state.reducedIntensity ? 'Efeitos · Suaves' : 'Efeitos · Padrão', toggleEffects,
      44, 650, 332, 58, dark);
  }

  function datingAction(kind, fn, cx, cy, label = '') {
    const like = kind === 'like';
    box(cx - 43, cy - 43, 86, 86, like ? rose : pearl, 43);
    if (like) {
      ctx.fillStyle = pearl;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 22);
      ctx.bezierCurveTo(cx - 51, cy - 14, cx - 15, cy - 36, cx, cy - 17);
      ctx.bezierCurveTo(cx + 15, cy - 36, cx + 51, cy - 14, cx, cy + 22);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#8f4c64';
      ctx.lineCap = 'round';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy - 14);
      ctx.lineTo(cx + 14, cy + 14);
      ctx.moveTo(cx + 14, cy - 14);
      ctx.lineTo(cx - 14, cy + 14);
      ctx.stroke();
    }
    if (label) text(label, cx, cy + 63, 18, pearl, 720, 'center');
    hits.push({ x: cx - 51, y: cy - 47, w: 102, h: label ? 125 : 94, fn });
  }

  function browse() {
    const person = eligibleProfiles(state.preference)[state.profileIndex];
    if (!person) return;
    ctx.save();
    const drag = gesture?.phase === PHASES.BROWSE && gesture.swipe ? gesture.delta : 0;
    ctx.translate(WIDTH * .5 + drag * .63, 346);
    ctx.rotate(drag * .0006);
    ctx.translate(-WIDTH * .5, -346);
    box(23, 129, 374, 465, pearl, 15);
    box(37, 143, 346, 316, person.color, 0);
    image(person.id, 37, 143, 346, 316);
    text(`${person.name}, ${person.age}`, 44, 487, 35, dark, 780);
    copy(person.bio, 44, 525, 320, 24);
    if (Math.abs(drag) > 34) {
      box(drag > 0 ? 53 : 231, 169, 133, 45, drag > 0 ? teal : rose);
      text(drag > 0 ? 'CURTIR' : 'PASSAR', drag > 0 ? 119 : 298, 192, 24, drag > 0 ? pearl : dark, 800, 'center');
    }
    ctx.restore();
    datingAction('pass', () => dispatch('SKIP_PROFILE'), 130, 659, 'Passar');
    datingAction('like', () => dispatch('LIKE_PROFILE'), 290, 659, 'Curtir');
  }

  function app() {
    const goHome = () => { cancelSpeech(); home = true; draw(); };
    if (state.phase !== PHASES.INTRO) {
      button('‹', goHome, 22, 62, 55, 50, '#422641', pearl, 35);
      title('Deu Ruim', 214, 87, 36);
      heartMark(358, 66, 42);
    }
    switch (state.phase) {
      case PHASES.INTRO:
        heartMark(199, 156, 151);
        title('Deu Ruim', 210, 343, 65);
        text('O que poderia dar errado?', 210, 425, 26, pearl, 550, 'center');
        datingAction('pass', goHome, 129, 627, 'Voltar');
        datingAction('like', () => dispatch('START'), 291, 627, 'Começar');
        break;
      case PHASES.IDENTITY:
        text('Quem é você?', 210, 216, 36, pearl, 790, 'center');
        button('HOMEM', () => dispatch('CHOOSE_AVATAR', 'male'), 23, 356, 374, 72);
        button('MULHER', () => dispatch('CHOOSE_AVATAR', 'female'), 23, 454, 374, 72);
        break;
      case PHASES.PREFERENCE:
        text('Quem você quer ver?', 210, 216, 31, pearl, 790, 'center');
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
        text(`Match com ${person.name}!`, 210, 142, 30, pearl, 790, 'center');
        image(person.id, 127, 169, 166, 151);
        box(25, 341, 370, 126, pearl);
        copy(reply || replies[person.id], 41, 375, 337, 22);
        button(speech ? 'CANCELAR FALA' : 'FALAR', talk, 24, 481, 372, 52);
        button('ONDE?', () => answer('onde'), 24, 548, 179, 51, rose, dark, 19);
        button('QUE HORAS?', () => answer('que horas'), 217, 548, 179, 51, pearl, dark, 19);
        button('MAIS TARDE', () => dispatch('ADVANCE_TIME'), 24, 621, 372, 58);
        break;
      }
      case PHASES.WAIT:
        text('Já anoiteceu.', 210, 208, 35, pearl, 790, 'center');
        copy('Faltam minutos para sair. Ainda dá tempo de fazer uma má escolha.', 30, 295, 360, 26, pearl);
        button('ME PREPARAR', () => dispatch('FEEL_ANXIOUS'), 23, 622, 374, 66);
        break;
      case PHASES.PREP:
        text('Hora de sair', 210, 180, 34, pearl, 790, 'center');
        copy('Leve algo até a bandeja ou siga com a escolha atual.', 30, 242, 355, 24, pearl);
        text(items[state.prep || 0][1], 210, 387, 29, pearl, 700, 'center');
        button('TROCAR ROUPA', appearance, 23, 516, 374, 62, rose, dark);
        button('PRONTO', depart, 23, 616, 374, 64);
        break;
      case PHASES.EXIT:
        text('O encontro espera.', 210, 247, 32, pearl, 790, 'center');
        const candy = candyById(state.candy);
        text(candy ? candy.name : 'Sem doce · máquina no corredor', 210, 310, 21, pearl, 650, 'center');
        button('PARTIR', depart, 23, 531, 374, 65);
        button('RECOMEÇAR', reset, 23, 620, 374, 65);
        break;
      default:
        text(state.phase === PHASES.EXIT ? 'O encontro espera.' : 'A noite saiu do plano.',
          210, 247, 32, pearl, 790, 'center');
        button('RECOMEÇAR', reset, 23, 620, 374, 65);
    }
  }

  function draw() {
    hits.length = 0;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, WIDTH, HEIGHT, 42);
    ctx.clip();
    backdrop();
    if (home) launcher();
    else app();
    statusBar();
    box(132, 762, 156, 6, pearl, 3);
    ctx.restore();
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

  function touch(id, at) {
    if (!press(id, at)) return false;
    if (gesture.swipe) return true;
    release(id, at);
    return false;
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
      } else if (at.inside && Math.hypot(at.x - previous.at.x, at.y - previous.at.y) < (id === 'mouse' ? 35 : 94)) {
        const start = previous.at;
        hits.find(hit => start.x >= hit.x && start.y >= hit.y &&
          start.x <= hit.x + hit.w && start.y <= hit.y + hit.h)?.fn();
      }
    }
    draw();
  }

  artwork.then(({ heart }) => { images.heart = heart; draw(); }).catch(console.warn);
  for (const [id, name] of Object.entries(portrait)) load(id, `Characters/${name}-Portrait.png`);
  draw();
  return { screen, position, press, touch, drag, release, getState: () => state, windowTime, cycleWindow, toggleEffects, selectItem,
    appearance, depart, eatCandy, reset, cancelSpeech, draw };
}
