import { assetRegistry } from '../../src/asset-registry.mjs';
import { qaAssets } from './qa-assets.mjs';

export const benchmark = { ...assetRegistry, ...qaAssets };
