import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetMechanisms, assetsForScene } from '../asset-registry.mjs';
import { fitSourced } from './sourced.js';
import skyPalette from '../../content/shared/sky.json' with { type: 'json' };

export async function loadPicnicSpread() {
  const loader = new GLTFLoader();
  return Promise.all(assetsForScene('picnic').map(async ([id, asset]) => {
    const { scene: model } = await loader.loadAsync(asset.modelUrl);
    model.name = id;
    model.position.fromArray(asset.position);
    model.traverse(object => {
      if (object.isMesh) object.castShadow = object.receiveShadow = true;
    });
    return { ...asset, id, model, ...assetMechanisms(model, asset) };
  }));
}

export function buildPicnicPark(THREE, { box, cylinder, sphere, mat, architecture, upholstery, wood, models }) {
  const day = skyPalette.day;
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(day.zenith) },
      horizon: { value: new THREE.Color(day.horizon) }
    },
    vertexShader: `varying vec3 vWorld;
      void main(){ vWorld=(modelMatrix*vec4(position,1.)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; varying vec3 vWorld;
      void main(){ vec3 d=normalize(vWorld-cameraPosition);
        float v=smoothstep(-.12,.72,d.y);
        vec3 col=mix(horizon,zenith,v);
        gl_FragColor=vec4(col,1.); }`
  });
  sphere([32, 32, 32], [0, 0, 0], skyMaterial);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(day.sun), fog: false }));
  sun.position.set(5.6, 6.6, -26);
  sun.scale.setScalar(1.35);
  architecture.add(sun);
  const cloudMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(day.cloud), fog: false });
  for (const cloud of skyPalette.clouds) {
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), cloudMaterial);
      puff.position.set(cloud.position[0] + (i - 1) * cloud.size[0] * .42,
        cloud.position[1] + (i % 2) * cloud.size[1] * .4, cloud.position[2]);
      puff.scale.set(cloud.size[0] * (i === 1 ? .58 : .44), cloud.size[1] * (i === 1 ? .9 : .62),
        cloud.size[2] * (i === 1 ? .6 : .48));
      architecture.add(puff);
    }
  }
  const path = mat(0xd6ba94);
  box([19, .035, 1.45], [0, .006, -3.36], path);
  box([1.40, .031, 5.8], [4.20, .005, -5.12], path);
  const trunk = mat(0x76513f);
  const leaves = [mat(0x63864a), mat(0x77984e), mat(0x93a956)];
  const blossoms = [mat(0xc9859d), mat(0xdc9db0), mat(0xaa6e88)];
  const tree = (x, z, scale, pink) => {
    const source = models?.[pink ? 'pink-flowering-tree' : 'green-canopy-tree'];
    const fitted = fitSourced(THREE, source, [3.9 * scale, 4.45 * scale, 3.05 * scale],
      [x, 2.22 * scale, z]);
    if (fitted) {
      if (pink) {
        fitted.traverse(object => {
          if (!object.isMesh) return;
          object.material = Array.isArray(object.material)
            ? object.material.map(material => material.clone()) : object.material.clone();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (/leaf|foliage|canopy/i.test(material.name ?? '')) material.color.setHex(0xe98fa8);
          }
        });
      }
      architecture.add(fitted);
      return;
    }
    const palette = pink ? blossoms : leaves;
    cylinder([.16 * scale, 2.18 * scale, .16 * scale], [x, 1.09 * scale, z], trunk);
    for (const [i, [dx, dy, dz]] of [[0, 2.75, 0], [-.58, 2.4, -.15], [.56, 2.52, .12],
      [.09, 2.57, -.57], [-.20, 2.26, .48]].entries()) {
      sphere([1.06 * scale, .76 * scale, .92 * scale], [x + dx * scale, dy * scale, z + dz * scale], palette[i % 3]);
    }
  };
  [[-2.80,-.95,1.17,false],[3.25,-2,1.25,true],[-4.7,-5.1,1.15,true],[.2,-6.9,.96,false],
    [-2.65,-7.4,.9,false],[2.35,-7.45,.9,true],[5.8,-5.2,1.15,false],[-5,1.1,1.0,false],
    [4.8,5.1,.86,true],[-4.9,5.4,.82,false],[.4,7.2,.78,false],[8,4.4,.72,false]]
    .forEach(args => tree(...args));
  const grass = mat(0x6a8c52);
  for (let i = 0; i < 23; i++) {
    const x = -8 + (i * 2.17) % 16, z = -5.3 - (i % 7) * .61;
    sphere([.38, .22, .32], [x, .12, z], leaves[i % leaves.length]);
  }
  for (const x of [-2.25, 1.93, 3.56]) {
    for (let i = 0; i < 8; i++) {
      const px = x + (i % 4) * .15, pz = -.37 - Math.floor(i / 4) * .21;
      cylinder([.009,.116,.009], [px,.06,pz], grass);
      sphere([.033,.022,.033], [px,.128,pz], blossoms[i % 3]);
    }
  }
  const cushion = (x, z) => sphere([.34, .080, .28], [x, .081, z], upholstery, architecture);
  cushion(0, .72);
  cushion(0, -1.27);
  for (const x of [-3.0, 2.6]) {
    const bench = fitSourced(THREE, models?.['park-bench'], [1.65, 1.0, .72], [x, .42, -4.75]);
    if (bench) {
      architecture.add(bench);
      continue;
    }
    box([1.15,.075,.34], [x,.43,-4.75], wood);
    box([1.15,.31,.057], [x,.66,-4.90], wood);
    for (const dx of [-.46,.46]) box([.072,.40,.25], [x+dx,.2,-4.75], trunk);
  }
  const extras = [
    ['trash-bin', [1.55, .45, -4.35], [.48, .9, .48]],
    ['bike-rack', [-2.35, .52, -4.55], [1.7, 1.0, .8]],
    ['park-sign', [-4.55, .8, -4.10], [.9, 1.55, .12]],
    ['tree-planter', [.2, .35, 3.75], [1.1, .7, 1.1]],
    ['hedge', [2.6, .5, 3.9], [2.2, 1.0, .65]],
    ['bush', [-2.7, .58, 4.2], [1.5, 1.15, 1.25]],
    ['park-bench', [1.0, .42, 5.1], [1.65, 1.0, .72]],
    ['park-bench', [-3.6, .42, 5.6], [1.65, 1.0, .72]]
  ];
  for (const [id, at, size] of extras) {
    const object = fitSourced(THREE, models?.[id], size, at);
    if (object) architecture.add(object);
  }
  for (let i = 0; i < 7; i++)
    if (models?.['grass-clump']) {
      const tuft = fitSourced(THREE, models['grass-clump'], [.55, .28, .42],
        [-4.2 + i * 1.35, .15, 4.3 + (i % 2) * .55]);
      if (tuft) architecture.add(tuft);
    }
  const lamp = fitSourced(THREE, models?.['street-lamp'], [.5, 2.9, .5], [-1.35, 1.45, -3.2]);
  if (lamp) architecture.add(lamp);
  else {
    cylinder([.075, 2.25, .075], [-1.35, 1.125, -3.2], trunk);
    sphere([.15, .18, .15], [-1.35, 2.4, -3.2], mat(0xffe3b4));
  }
  for (const [x, z, scale] of [[2.9, -2.9, 1.05], [-2.6, -3.05, .9], [4.8, -4.2, 1.1],
    [-4.6, -4.0, 1.0]]) {
    const flower = fitSourced(THREE, models?.['flower-patch'], [1.1 * scale, .62 * scale, 1.1 * scale],
      [x, .3 * scale, z]);
    if (flower) architecture.add(flower);
    const mushroom = fitSourced(THREE, models?.['mushrooms'], [.5, .26, .5], [x + .75, .13, z + .55]);
    if (mushroom) architecture.add(mushroom);
  }
  const stand = fitSourced(THREE, models?.['market-stand'], [2.8, 2.2, 1.6], [4.75, 1.1, -6.55], [0, Math.PI, 0]);
  if (stand) {
    architecture.add(stand);
    box([2.35, .92, .42], [4.75, .46, -5.80], wood, architecture);
    box([2.45, .09, .5], [4.75, .96, -5.80], mat(0xe6c99b), architecture);
    for (let i = 0; i < 3; i++) {
      const bottle = fitSourced(THREE, models?.['bar-bottle'], [.07, .26, .07],
        [4.0 + i * .75, 1.14, -5.80]);
      if (bottle) architecture.add(bottle);
    }
  } else {
    box([1.45,1.35,.83], [4.75,.67,-6.55], mat(0xc48c61));
    box([1.56,.13,.9], [4.75,1.38,-6.54], mat(0xe0bb8a));
    for (let i = 0; i < 8; i++)
      box([.20,.065,.55], [4.06+i*.197,1.48,-6.22], mat(i % 2 ? 0xf4d7aa : 0xaf6e79));
  }
  box([1.55,1.9,1.15], [-5.30,.95,-6.13], mat(0x9ea58b));
  box([1.67,.12,1.27], [-5.30,1.96,-6.13], mat(0x63524a));
}
