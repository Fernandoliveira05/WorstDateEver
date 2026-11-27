import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const base = `${import.meta.env?.BASE_URL ?? '/'}assets/sourced/`;
const loader = new GLTFLoader();
const cache = new Map();

export function sourcedUrl(id) { return base + id + '.glb'; }

export function loadSourced(id) {
  if (!cache.has(id)) {
    cache.set(id, loader.loadAsync(sourcedUrl(id)).then(gltf => {
      gltf.scene.name = id;
      return gltf.scene;
    }));
  }
  return cache.get(id);
}

export async function loadSourcedSet(ids) {
  const entries = await Promise.all(ids.map(async id => [id, await loadSourced(id).catch(error => {
    console.warn('Sourced model failed: ' + id, error);
    return null;
  })]));
  return Object.fromEntries(entries.filter(([, model]) => model));
}

/** Clone and fit a sourced GLB inside a metre-sized box, centred at position. */
export function fitSourced(THREE, source, size, position, rotation = [0, 0, 0]) {
  if (!source) return null;
  const model = source.clone(true);
  model.rotation.set(...rotation);
  model.updateMatrixWorld(true);
  const first = new THREE.Box3().setFromObject(model);
  const extent = first.getSize(new THREE.Vector3());
  model.scale.multiply(new THREE.Vector3(
    size[0] / Math.max(.0001, extent.x),
    size[1] / Math.max(.0001, extent.y),
    size[2] / Math.max(.0001, extent.z)));
  model.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(model);
  const centre = fitted.getCenter(new THREE.Vector3());
  model.position.add(new THREE.Vector3(position[0] - centre.x, position[1] - centre.y,
    position[2] - centre.z));
  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return model;
}

export const VENUE_MODELS = {
  table: { sushi: 'dining-table', bistro: 'bistro-table', bar: 'round-table', cafe: 'round-table' },
  chair: { sushi: 'dining-chair', bistro: 'upholstered-chair', bar: 'bar-stool', cafe: 'upholstered-chair' },
  food: {
    sushi: ['sushi-platter', 'sake-flask', 'shoyu-dish'],
    bistro: ['cake-slice', 'coffee-cup'],
    bar: ['beer-mug', 'petiscos-bowl', 'hot-sauce'],
    cafe: ['cake-slice', 'coffee-cup']
  }
};

export const PARK_MODELS = ['green-canopy-tree', 'pink-flowering-tree', 'park-bench', 'market-stand',
  'street-lamp', 'flower-patch', 'mushrooms', 'trash-bin', 'bike-rack', 'park-sign',
  'tree-planter', 'hedge', 'bush', 'grass-clump'];
