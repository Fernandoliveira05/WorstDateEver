import * as THREE from 'three';
import { assetMechanisms, assetRegistry, blanketPull } from '../../src/asset-registry.mjs';
import { qaAssets } from './qa-assets.mjs';

const specs = { ...assetRegistry, ...qaAssets };

export async function prepareBenchmark(loader, root, data, assetId) {
  const spec = specs[assetId];
  if (!spec) throw new Error('Unknown QA benchmark ' + assetId);
  if (spec.runtime) return { assetId, id: spec.runtime, states: spec.states };
  const id = 'wde_qa_' + assetId;
  const { scene: model } = await loader.loadAsync(spec.modelUrl);
  model.name = id;
  model.position.set(-.05, assetId === 'picnic_blanket' ? .36 : 1.12, 1.28);
  model.traverse(object => {
    if (object.isMesh) {
      object.castShadow = object.receiveShadow = true;
      object.layers.enable(27);
    }
  });
  root.add(model);
  data.props.push({ id, name: spec.name, mass: spec.mass, shapes: spec.shapes,
    gripZones: spec.grip_zones, isKinematic: true });
  const { lids, cloth, setOpen, setPull, displaceGrip } = assetMechanisms(model, spec);
  let open = 0;
  let pull = 0;
  let pinnedState = false;
  let grip;

  function openTo(fraction) {
    open = fraction;
    setOpen(fraction);
  }

  for (const lid of lids) {
    if (lid) lid.userData.roomAction = () => openTo(open > .1 ? 0 : 1);
  }

  return {
    assetId, id, states: spec.states, captureAimZone: spec.captureAimZone, captureAimType: spec.captureAimType,
    previewPull(grip, amount) {
      pinnedState = true;
      setPull(grip.zone, amount, 1, grip.anchor);
      return displaceGrip(grip);
    },
    captureState(state) {
      pinnedState = state.startsWith('pull_');
      if (state === 'rest') {
        openTo(0);
        setPull('Front', 0);
      }
      if (state.startsWith('open_')) openTo(Number(state.slice(5)) / 100);
      if (pinnedState) setPull('Front', Number(state.slice(5)) / 100);
    },
    tick(physics, delta) {
      if (!cloth || pinnedState) return;
      const prop = physics.props.get(id);
      const hold = prop.held && physics.hand.get(prop.held);
      if (hold?.grip.zone) grip = hold.grip;
      const target = hold ? blanketPull(THREE, prop.body, hold.grip, hold.point.clone().sub(hold.start)) : 0;
      pull += (target - pull) * Math.min(1, delta * 10);
      setPull(grip?.zone, pull, 1, grip?.anchor);
    }
  };
}
