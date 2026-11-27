import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetMechanisms, assetsForScene } from '../asset-registry.mjs';

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

export function buildPicnicPark(THREE, { box, cylinder, sphere, mat, architecture, upholstery, wood }) {
  const sky = new THREE.MeshBasicMaterial({ color: 0xb8d8e3, side: THREE.BackSide, fog: false });
  sphere([32, 32, 32], [0, 0, 0], sky);
  const path = mat(0xd6ba94);
  box([19, .035, 1.45], [0, .006, -3.36], path);
  box([1.40, .031, 5.8], [4.20, .005, -5.12], path);
  const trunk = mat(0x76513f);
  const leaves = [mat(0x63864a), mat(0x77984e), mat(0x93a956)];
  const blossoms = [mat(0xc9859d), mat(0xdc9db0), mat(0xaa6e88)];
  const tree = (x, z, scale, pink) => {
    const palette = pink ? blossoms : leaves;
    cylinder([.16 * scale, 2.18 * scale, .16 * scale], [x, 1.09 * scale, z], trunk);
    for (const [i, [dx, dy, dz]] of [[0, 2.75, 0], [-.58, 2.4, -.15], [.56, 2.52, .12],
      [.09, 2.57, -.57], [-.20, 2.26, .48]].entries()) {
      sphere([1.06 * scale, .76 * scale, .92 * scale], [x + dx * scale, dy * scale, z + dz * scale], palette[i % 3]);
    }
  };
  [[-2.80,-.95,1.17,false],[3.25,-2,1.25,true],[-4.7,-5.1,1.15,true],[.2,-6.9,.96,false],
    [-2.65,-7.4,.9,false],[2.35,-7.45,.9,true],[5.8,-5.2,1.15,false],[-5,1.1,1.0,false]]
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
  cushion(0, -1.10);
  for (const x of [-3.0, 2.6]) {
    box([1.15,.075,.34], [x,.43,-4.75], wood);
    box([1.15,.31,.057], [x,.66,-4.90], wood);
    for (const dx of [-.46,.46]) box([.072,.40,.25], [x+dx,.2,-4.75], trunk);
  }
  box([1.45,1.35,.83], [4.75,.67,-6.55], mat(0xc48c61));
  box([1.56,.13,.9], [4.75,1.38,-6.54], mat(0xe0bb8a));
  for (let i = 0; i < 8; i++)
    box([.20,.065,.55], [4.06+i*.197,1.48,-6.22], mat(i % 2 ? 0xf4d7aa : 0xaf6e79));
  box([1.55,1.9,1.15], [-5.30,.95,-6.13], mat(0x9ea58b));
  box([1.67,.12,1.27], [-5.30,1.96,-6.13], mat(0x63524a));
}
