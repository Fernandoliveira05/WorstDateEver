import { candyAtmosphere } from './candies.mjs';
import { Reflector } from 'three/addons/objects/Reflector.js';
import skyPalette from '../content/shared/sky.json' with { type: 'json' };

function meshOf(object) {
  if (object?.isMesh) return object;
  return object?.children.find(child => child.isMesh);
}

export function createScenery(THREE, root, data, node, loadModel) {
  const rgb = hex => { const c = new THREE.Color(hex);
    return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`; };
  const afternoon = new THREE.Color('#d9bcac');
  const daylight = new THREE.Color('#dfebf1');
  const moonlight = new THREE.Color('#9facd2');
  const lightByName = new Map();
  let time = 0;
  let clock = 0;
  let frame = 0;
  let effectsReduced = false;
  let candy;
  const amberTint = new THREE.Color('#ffc388');
  const roseTint = new THREE.Color('#f1aac9');
  const clearTint = new THREE.Color('#d9ebfb');

  const ambient = new THREE.HemisphereLight(0xffe5c8, 0x766778, 1.3);
  root.add(ambient);
  ambient.layers.enable(27);
  const lights = data.lights.map(def => {
    const color = new THREE.Color().setRGB(...def.color, THREE.SRGBColorSpace);
    const light = def.type === 'Directional' ? new THREE.DirectionalLight(color, def.intensity)
      : def.type === 'Spot' ? new THREE.SpotLight(color, def.intensity * (def.night ? 6.0 : 4.8), def.range,
        THREE.MathUtils.degToRad(def.angle / 2), .58, 2)
      : new THREE.PointLight(color, def.intensity * 2.3, def.range, 2);
    light.position.fromArray(def.position);
    if (light.target) {
      light.target.position.fromArray(def.direction).multiplyScalar(3).add(light.position);
      root.add(light.target);
    }
    if (def.shadow && light.shadow) {
      light.castShadow = true;
      const size = def.night ? 384 : 1024;
      light.shadow.mapSize.set(size, size);
      light.shadow.normalBias = .018;
      light.shadow.bias = -.00017;
      light.shadow.radius = 2;
    }
    root.add(light);
    light.layers.enable(27);
    lightByName.set(def.name, light);
    return { def, light };
  });

  function shader(source, options = {}) {
    return new THREE.ShaderMaterial({
      vertexShader: options.vertexShader || `
        varying vec3 wpos; varying vec3 wnorm; varying vec2 st;
        void main() {
          wpos=(modelMatrix*vec4(position,1.)).xyz;
          wnorm=normalize(mat3(modelMatrix)*normal);
          st=uv;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader: `uniform float hour; uniform float strength;
        varying vec3 wpos; varying vec3 wnorm; varying vec2 st; ${source}`,
      uniforms: { hour: { value: 0 }, strength: { value: 1 }, ...options.uniforms },
      side: options.side ?? THREE.FrontSide,
      transparent: Boolean(options.transparent), depthWrite: !options.transparent,
      blending: options.blending ?? THREE.NormalBlending
    });
  }

  const sky = shader(`
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      vec3 direction=normalize(wpos-cameraPosition);
      float az=atan(-direction.x,direction.z);
      float el=asin(clamp(direction.y,-1.,1.));
      vec2 p=vec2(az,el)*19.+vec2(0.,1.45);
      float v=smoothstep(1.4,8.8,p.y);
      vec3 col=mix(${rgb(skyPalette.golden.horizon)},${rgb(skyPalette.golden.zenith)},v);
      if(hour>1.5){
        col=mix(${rgb(skyPalette.night.horizon)},${rgb(skyPalette.night.zenith)},v);
        vec2 star=p*3.9;
        col+=.62*(1.-smoothstep(.027,.09,length(fract(star)-.5)))*step(.80,hash(floor(star)));
        vec2 moon=p-vec2(-4.63,6.32);
        float crescent=(1.-smoothstep(.29,.32,length(moon)))*smoothstep(.27,.31,length(moon-vec2(.14,.09)));
        col=mix(col,${rgb(skyPalette.day.star)},crescent);
      } else if(hour>.5) col=mix(${rgb(skyPalette.day.horizon)},${rgb(skyPalette.day.zenith)},v);
      else {
        float sun=length((p-vec2(-6.05,4.15))*vec2(1.,1.07));
        col=mix(col,${rgb(skyPalette.golden.sun)},(1.-smoothstep(.3,2.8,sun))*.52);
        col=mix(col,${rgb(skyPalette.day.sun)},1.-smoothstep(.41,.44,sun));
      }
      gl_FragColor=vec4(col,1.);
    }`, { side: THREE.BackSide });
  const atmosphere = [];
  for (const [id, effect] of Object.entries(data.specials)) {
    const meshes = [];
    node(id)?.traverse(object => { if (object.isMesh) meshes.push(object); });
    for (const object of meshes) {
      object.castShadow = false;
      object.receiveShadow = false;
      if (effect === 'GoldenSky') {
        object.material = sky;
        object.renderOrder = -100;
        sky.depthWrite = false;
        atmosphere.push(sky);
      } else if (effect === 'MountainHaze') {
        const name = object.material.name;
        const meadow = name.includes('Meadow');
        const tint = new THREE.Color('#' + name.split('-').at(-1));
        object.material = shader(`
          uniform vec3 tint;
          void main(){
            vec3 norm=normalize(wnorm)*(gl_FrontFacing ? 1. : -1.);
            float shade=dot(norm,vec3(.48,.78,-.39))*.25+.76;
            float depth=clamp((distance(wpos,cameraPosition)-20.)*.016,0.,1.);
            float haze=clamp(.16+depth*.4+.32*(1.-smoothstep(-.7,5.7,wpos.y)),0.,1.);
            vec3 air=hour>1.5 ? vec3(.14,.19,.31) : hour>.5 ? vec3(.54,.65,.73) : vec3(.62,.64,.68);
            vec3 rock=hour>1.5 ? vec3(.065,.083,.15) : tint;
            gl_FragColor=vec4(mix(rock*shade,air,haze),1.);
          }`, { side: THREE.DoubleSide, uniforms: {
          tint: { value: new THREE.Vector3(...(meadow ? [.40, .49, .36] : [tint.r, tint.g, tint.b].map(c => c ** .48))) }
        } });
        atmosphere.push(object.material);
      } else if (effect === 'ShopGlass') {
        object.material = shader(`
          void main(){
            vec3 eye=normalize(cameraPosition-wpos);
            vec3 normal=normalize(wnorm);
            float edge=pow(1.-clamp(abs(dot(eye,normal)),0.,1.),3.);
            float horizon=smoothstep(.025,.12,reflect(-eye,normal).y);
            float streak=clamp(1.-abs(wpos.y-wpos.x*.15-1.67)*10.,0.,1.)*.10;
            vec3 tint=mix(vec3(.11,.21,.23),vec3(.46,.61,.70),horizon)+streak;
            gl_FragColor=vec4(tint,.09+edge*.32+streak);
          }`, { transparent: true });
      } else if (effect === 'StreetLampHalo') {
        object.material = shader(`
          float glow(vec2 p,float f){return exp2(-dot(p,p)*f);}
          void main(){
            vec2 p=st*2.-1.;
            float fringe=(glow(p+vec2(.058,.025),37.)-glow(p-vec2(.058,.025),37.))*strength;
            vec3 rgb=vec3(1.,.64,.29)*(glow(p,95.)*.68+glow(p,9.)*.14);
            rgb+=vec3(max(fringe,0.),.03*abs(fringe),max(-fringe,0.)*.61)*.25;
            gl_FragColor=vec4(rgb*(1.-smoothstep(.65,1.,length(p))),1.);
          }`, { transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            vertexShader: `varying vec2 st; varying vec3 wpos; varying vec3 wnorm;
              void main(){
                st=uv; wpos=(modelMatrix*vec4(0.,0.,0.,1.)).xyz; wnorm=vec3(0.,0.,1.);
                vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
                center.xy+=position.xy*length(modelMatrix[0].xyz);
                gl_Position=projectionMatrix*center;
              }`
          });
        atmosphere.push(object.material);
        object.renderOrder = 12;
      } else if (effect === 'StreetLightPool') {
        object.material = new THREE.ShaderMaterial({
          vertexShader: `attribute vec4 color; varying vec4 traced;
            void main(){traced=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
          fragmentShader: `varying vec4 traced; void main(){gl_FragColor=vec4(traced.rgb,traced.a*.88);}`,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        object.renderOrder = 1;
        if (!object.geometry.attributes.color) object.visible = false;
      } else if (effect === 'WindowAir') {
        object.material = shader(`
          void main(){
            float edge=smoothstep(0.,.24,st.x)*(1.-smoothstep(.76,1.,st.x));
            float depth=smoothstep(0.,.14,st.y)*(1.-smoothstep(.26,1.,st.y));
            gl_FragColor=vec4(1.,.76,.46,.14*edge*depth*strength);
          }`, { transparent: true, side: THREE.DoubleSide });
        atmosphere.push(object.material);
      }
    }
  }

  // Render the bedroom and avatar in the mirror. The outdoor scene stays on the main camera.
  const outside = new Set([
    ...data.cars.map(car => car.id), ...data.signals.flat(), ...data.window.clouds,
    ...data.window.panes, ...data.window.mountains, ...data.window.birds.map(bird => bird.body),
    data.window.sky, data.window.fixtures, ...Object.keys(data.specials).filter(id => data.specials[id] === 'ShopGlass')
  ].map(node));
  const addReflectionLayer = object => {
    if (outside.has(object) || object.name.startsWith('street_')) return;
    if (object.isMesh) object.layers.enable(27);
    for (const child of object.children) addReflectionLayer(child);
  };
  addReflectionLayer(root);
  const mirror = meshOf(node(data.mirror));
  let reflection, stereoMirror;
  if (mirror) {
    mirror.material = new THREE.MeshBasicMaterial({ visible: false });
    mirror.geometry.computeBoundingBox();
    const { min, max } = mirror.geometry.boundingBox;
    reflection = new Reflector(new THREE.PlaneGeometry(max.x - min.x, max.y - min.y),
      { color: 0xd0d4da, textureWidth: 288, textureHeight: 448, clipBias: .003, multisample: 0 });
    reflection.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, min.z - .001);
    reflection.rotation.y = Math.PI;
    mirror.add(reflection);
    stereoMirror = new THREE.Mesh(reflection.geometry, new THREE.MeshStandardMaterial({
      color: 0x687887, roughness: .32, metalness: .18
    }));
    stereoMirror.position.copy(reflection.position);
    stereoMirror.quaternion.copy(reflection.quaternion);
    stereoMirror.visible = false;
    mirror.add(stereoMirror);
    const renderReflection = reflection.onBeforeRender;
    const cameraFor = reflection._getReflectionCamera;
    reflection._getReflectionCamera = function (camera) {
      const reflected = cameraFor.call(this, camera);
      reflected.layers.set(27);
      reflected.layers.enable(26);
      return reflected;
    };
    let lastFrame = -1, lastCamera;
    reflection.onBeforeRender = function (renderer, sceneGraph, camera) {
      // Reflector changes the active framebuffer and viewport. Keep that
      // nested render outside the headset's stereo render pass.
      if (renderer.xr.isPresenting || (frame === lastFrame && camera === lastCamera)) return;
      lastFrame = frame;
      lastCamera = camera;
      const { autoUpdate, needsUpdate } = renderer.shadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      try { renderReflection.call(this, renderer, sceneGraph, camera); }
      finally {
        renderer.shadowMap.autoUpdate = autoUpdate;
        renderer.shadowMap.needsUpdate = needsUpdate;
      }
    };
  }

  function setImmersive(enabled) {
    if (!reflection) return;
    reflection.visible = !enabled;
    stereoMirror.visible = enabled;
  }

  const paneColors = data.window.panes.map(id => meshOf(node(id))).filter(Boolean);
  const clouds = data.window.clouds.map(id => {
    const object = node(id);
    return { object, origin: object.position.clone(), meshes: colorMeshes(object) };
  });
  function colorMeshes(object) {
    const meshes = [];
    object?.traverse(child => {
      if (!child.isMesh || Array.isArray(child.material)) return;
      child.material = child.material.clone();
      if (child.material.color) meshes.push(child);
    });
    return meshes;
  }
  for (const pane of paneColors) pane.material = pane.material.clone();

  const cars = data.cars.map(car => ({
    ...car, object: node(car.id), path: route(THREE, car.route, true), distance: car.Initial,
    speed: car.TopSpeed, spin: 0, wheels: car.wheels.map(node),
    lamps: { rear: car.rear.flatMap(id => colorMeshes(node(id))), front: car.front.flatMap(id => colorMeshes(node(id))) }
  }));
  const signals = data.signals.map(signal => signal.flatMap(id => colorMeshes(node(id))));
  const street = root.getObjectByName('Neighborhood meshes');
  const exterior = root.getObjectByName('Exterior effects');
  const streetPeople = new THREE.Group();
  streetPeople.name = 'Street pedestrians';
  root.add(streetPeople);
  function setCorridor(active) {
    for (const part of [street, exterior, streetPeople]) if (part) part.visible = !active;
  }
  const walkers = data.walkers.map(def => {
    const object = new THREE.Group();
    object.name = def.name;
    streetPeople.add(object);
    object.visible = false;
    const pedestrian = { ...def, path: route(THREE, def.route, false), object };
    loadModel(`Characters/${def.model}`).then(({ scene: model, animations }) => {
      fitCharacter(THREE, object, model, def.height);
      model.traverse(part => {
        if (!part.isMesh) return;
        part.castShadow = true;
        part.receiveShadow = true;
      });
      if (def.Postal) postalAccessories(THREE, model);
      const walk = animations.find(clip => clip.name.endsWith('|Walk') || clip.name === 'Walk');
      if (walk) {
        pedestrian.mixer = new THREE.AnimationMixer(model);
        pedestrian.mixer.clipAction(walk).play();
      }
    }).catch(console.error);
    return pedestrian;
  });

  const birds = data.window.birds.map(bird => ({
    object: node(bird.body), left: node(bird.left), right: node(bird.right),
    origin: node(bird.body).position.clone()
  }));

  function setTime(next, reduced) {
    time = next;
    effectsReduced = reduced;
    const night = time === 2;
    const day = time === 1;
    node(data.window.fixtures).visible = night;
    node(data.window.beams).visible = time === 0;
    for (const material of atmosphere) {
      material.uniforms.hour.value = time;
      material.uniforms.strength.value = reduced ? .37 : 1;
    }
    const effect = candyAtmosphere(candy, reduced);
    ambient.color.copy(night ? moonlight : day ? daylight : afternoon)
      .lerp(amberTint, effect.amber * .29).lerp(roseTint, effect.rose * .22)
      .lerp(clearTint, effect.clarity * .27);
    ambient.intensity = (night ? .56 : day ? 1.64 : 1.45) + effect.amber * .10;
    for (const { light, def } of lights) {
      if (def.night) light.visible = night;
      if (def.name === 'Sol pela janela') {
        light.color.set(night ? '#b1c4ff' : day ? '#ffefcc' : '#ffd499');
        light.intensity = night ? 2.5 : day ? 12 : 23.8;
      }
      if (def.name === 'Preenchimento do quarto') light.intensity = night ? .28 : .66;
    }
    for (const cloud of clouds) for (const mesh of cloud.meshes)
      mesh.material.color.set(night ? '#343e60' : day ? '#f0eee2' : '#edd0b2');
    for (const pane of paneColors) pane.material.color?.set(night ? '#f5a358' : '#617988');
    for (const bird of birds) bird.object.visible = !night;
  }

  function tick(delta) {
    clock += delta;
    frame++;
    const phase = clock % 29;
    const stage = phase < 18 ? 0 : phase < 20 ? 1 : 2;
    const lampColors = [0xd72413, 0xffaa28, 0x35d06b];
    for (const group of signals) group.forEach((lamp, index) =>
      lamp.material.color.setHex(lampColors[index]).multiplyScalar(index === 2 - stage ? 1 : .19));
    for (const car of cars) {
      const toStop = wrap(car.Stop - car.distance, car.path.length);
      const stopping = stage !== 0 && toStop < 12;
      const desired = stopping ? Math.min(car.TopSpeed, Math.sqrt(5.7 * toStop)) : car.TopSpeed;
      const old = car.speed;
      car.speed += THREE.MathUtils.clamp(desired - old, -5.6 * delta, 2.35 * delta);
      const step = Math.min(car.speed * delta, stopping ? toStop : Infinity);
      if (stopping && step >= toStop) car.speed = 0;
      car.distance = wrap(car.distance + step, car.path.length);
      const here = car.path.at(car.distance);
      const there = car.path.at(car.distance + .55);
      const heading = there.sub(here);
      car.object.position.copy(here);
      car.object.rotation.y = Math.atan2(heading.x, heading.z);
      car.spin = wrap(car.spin + step / car.WheelRadius, Math.PI * 2);
      for (const wheel of car.wheels) wheel.rotation.x = car.spin;
      for (const lamp of car.lamps.rear) lamp.material.color.setHex(
        car.speed < old - .015 || car.speed < .1 || time === 2 ? 0xec3028 : 0x401212);
      for (const lamp of car.lamps.front) lamp.material.color.setHex(time === 2 ? 0xffe5a9 : 0x8a8070);
    }
    for (const walker of walkers) {
      const travel = walker.path.length / walker.Speed;
      const along = (clock + walker.Phase) % (travel + walker.Rest);
      walker.object.visible = along < travel;
      if (!walker.object.visible) continue;
      const point = walker.path.at(walker.Speed * along);
      const distance = walker.Speed * along;
      const before = walker.path.at(Math.max(0, distance - .24));
      const after = walker.path.at(distance + .36);
      const pathForward = after.sub(before);
      walker.object.position.copy(point);
      walker.object.rotation.y = Math.atan2(pathForward.x, pathForward.z);
      walker.mixer?.setTime(along * (walker.Postal ? .92 : 1));
    }
    clouds.forEach(({ object, origin }, i) => {
      object.position.x = origin.x - 12 + wrap(12 + clock * (.24 + i % 3 * .035), 32);
    });
    if (time !== 2) birds.forEach(({ object, left, right, origin }, i) => {
      const age = clock + .47 * i;
      object.position.x = -9 + wrap(age * 1.07 + 4.2, 19);
      object.position.y = origin.y + Math.sin(age * 1.4) * .13;
      const flap = Math.sin(age * 17) * (.44 + .33 * Math.sin(age * 2.1));
      left.rotation.x = flap;
      right.rotation.x = -flap;
    });
  }

  setTime(0, false);
  return {
    tick, setTime, setImmersive, setCorridor, cars, walkers,
    setCandy(next) {
      if (candy === next) return;
      candy = next;
      setTime(time, effectsReduced);
    },
    setAftermath(active) {
      lightByName.get('Luz ambiente fria')?.color.set(active && !effectsReduced ? '#aa5689' : '#b5c6dc');
    },
    get time() { return time; }, get reduced() { return effectsReduced; }
  };
}

function wrap(t, length) { return ((t % length) + length) % length; }

export function route(THREE, points, closed) {
  const vertices = points.map(p => new THREE.Vector3(...p));
  const segments = [];
  let length = 0;
  for (let i = 0; i < vertices.length - (closed ? 0 : 1); i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const segment = a.distanceTo(b);
    segments.push({ a, b, start: length, end: length + segment, segment });
    length += segment;
  }
  return {
    length,
    at(distance) {
      const t = closed ? wrap(distance, length) : Math.min(distance, length);
      const section = segments.find(edge => t <= edge.end) ?? segments.at(-1);
      return section.a.clone().lerp(section.b, (t - section.start) / section.segment);
    }
  };
}

export function fitCharacter(THREE, parent, model, height) {
  // Keep these bounds in model space even if an asynchronous load finished mid-route.
  model.updateWorldMatrix(true, true);
  let bounds = new THREE.Box3().setFromObject(model, true);
  model.scale.multiplyScalar(height / Math.max(bounds.max.y - bounds.min.y, .1));
  model.updateWorldMatrix(true, true);
  bounds = new THREE.Box3().setFromObject(model, true);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  parent.add(model);
  model.updateWorldMatrix(true, true);
}

function postalAccessories(THREE, model) {
  const head = model.getObjectByName('Head');
  const torso = model.getObjectByName('Chest');
  if (!head || !torso) return;
  const scale = head.getWorldScale(new THREE.Vector3()).x;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.113 / scale, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x40566e, roughness: .8 }));
  cap.scale.y = .37;
  cap.position.y = .123 / scale;
  head.add(cap);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(.16 / scale, .21 / scale, .10 / scale),
    new THREE.MeshStandardMaterial({ color: 0x4e5765, roughness: .78 }));
  bag.position.set(.23 / scale, -.24 / scale, .04 / scale);
  torso.add(bag);
}
