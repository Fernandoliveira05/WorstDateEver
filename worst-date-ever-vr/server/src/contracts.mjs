import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const ajv = new Ajv2020();
const contracts = new Map();
export function contract(name) {
  if (!contracts.has(name)) {
    const path = new URL('../../specs/002-vr-first-date/contracts/' + name + '.schema.json', import.meta.url);
    contracts.set(name, ajv.compile(JSON.parse(readFileSync(path))));
  }
  return contracts.get(name);
}
