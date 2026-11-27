import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { benchmark } from './benchmark.mjs';

const root = fileURLToPath(new URL('../../assets/hand-qa/', import.meta.url));
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const sha = file => createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
const optionalJson = path => existsSync(resolve(root, path)) ? json(path) : null;
const ajv = new Ajv2020({ allErrors: true });
const reviewSchema = ajv.compile(json('contracts/vision_review.schema.json'));
const gripSchema = ajv.compile(json('contracts/grip_profile.schema.json'));
const references = ['bedroom-day.png', 'picnic-seat.png', 'overview-four-venues.png'].map(name => ({
  file: 'references/' + name, sha256: sha('references/' + name), role: 'supplied concept direction'
}));
const assets = {};

for (const [id, entry] of Object.entries(benchmark)) {
  const dir = 'evidence/' + id;
  const configuredRevision = process.env.WDE_QA_CAPTURE_REVISION;
  if (configuredRevision && !/^webxr-[a-z0-9-]+$/.test(configuredRevision))
    throw new Error('Invalid capture revision');
  const completedPackets = readdirSync(resolve(root, dir))
    .filter(name => /^review-webxr-[a-z0-9-]+$/.test(name) && existsSync(resolve(root, dir, name, 'index.json')))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  const packet = completedPackets[0]?.slice('review-'.length);
  const shotRevision = configuredRevision ?? packet ?? 'webxr-scripted';
  const shotsDir = dir + '/' + shotRevision;
  const exportedPhone = shotsDir + '/phone.glb';
  const candidate = entry.runtime && existsSync(resolve(root, exportedPhone)) ? exportedPhone : 'candidates/' + id + '.glb';
  const candidate_hash = sha(candidate);
  const sourceFile = entry.source && 'sources/' + id + '/' + entry.file;
  const slug = entry.source?.split('/').at(-1);
  const isolatedDirs = readdirSync(resolve(root, dir))
    .filter(name => /^candidates(?:-rework-\d+)?$/.test(name))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  const isolatedRevision = isolatedDirs.find(name =>
    optionalJson(dir + '/' + name + '/captures.json')?.[0]?.asset_sha256 === candidate_hash);
  const isolatedDir = dir + '/' + (isolatedRevision ?? 'candidates');
  const modelViews = optionalJson(isolatedDir + '/captures.json') ?? [];
  const audit = optionalJson(dir + '/mesh-audit.json');
  const revisedReport = optionalJson(shotsDir + '/qa_report.json');
  const reports = revisedReport ?? optionalJson(dir + '/qa_report.json');
  if (reports && !reviewSchema(reports)) throw new Error(id + ': ' + ajv.errorsText(reviewSchema.errors));
  const reportRevisionMatches = revisedReport || shotRevision === 'webxr-scripted';
  const verifiedReview = reportRevisionMatches && reports?.candidate_hash === candidate_hash && reports;
  const captures = existsSync(resolve(root, shotsDir))
    ? readdirSync(resolve(root, shotsDir)).filter(name => name.endsWith('.json') && name !== 'qa_report.json')
      .map(name => json(shotsDir + '/' + name))
    : [];
  const fresh = captures.filter(shot => shot.asset_sha256 === candidate_hash &&
    sha(shotsDir + '/' + shot.filename) === shot.image_sha256);
  const turned = modelViews.filter(shot => shot.asset_sha256 === candidate_hash &&
    sha(isolatedDir + '/' + shot.filename) === shot.image_sha256);
  const grip = {
    asset_id: id, mesh_hash: candidate_hash, calibration_status: 'CALIBRATED',
    grip_zones: entry.grip_zones, interaction_states: entry.states, supports_regrip: true,
    input_modes: ['left_controller', 'right_controller', 'left_tracked_hand', 'right_tracked_hand']
  };
  if (!gripSchema(grip)) throw new Error(id + ': ' + ajv.errorsText(gripSchema.errors));
  writeFileSync(resolve(root, dir, 'grip_profile.json'), JSON.stringify(grip, null, 2) + '\n');
  assets[id] = {
    name: entry.name, candidate, candidate_hash,
    source: sourceFile ? {
      publisher: 'Grab3D', origin: 'Publisher procedural model with AI-assisted scripting',
      page: 'https://grab3d.com/models/' + entry.source + '/',
      download: 'https://grab3d.com/dl/' + slug + '/' + entry.file, file: sourceFile,
      sha256: sha(sourceFile), license: 'CC0-1.0', license_text: 'sources/' + id + '/LICENSE.txt',
      publisher_manifest: optionalJson('sources/' + id + '/publisher-manifest.json') &&
        'sources/' + id + '/publisher-manifest.json'
    } : { publisher: 'Worst Date Ever project', origin: 'Exported current runtime shell and screen artwork', runtime_id: entry.runtime },
    evidence: {
      isolated_views: turned.length, scripted_views: fresh.length,
      capture_revision: shotRevision,
      isolated_directory: turned.length ? isolatedDir : null,
      scripted_grip_approaches: fresh.filter(shot => /__grip\.png$/.test(shot.filename)).length,
      expected_scripted_grip_approaches: 48,
      mesh_audit: audit?.asset_sha256 === candidate_hash ? dir + '/mesh-audit.json' : null,
      independent_review: verifiedReview ? (revisedReport ? shotsDir : dir) + '/qa_report.json' : null
    },
    release: {
      vision: verifiedReview?.decision ?? 'MISSING_EVIDENCE',
      device: verifiedReview?.quest_runtime_test ?? 'NOT_TESTED',
      human_reviewer: verifiedReview?.human_reviewer ?? null,
      production_approved: false,
      integration: id === 'PROP-013' ? 'current production artifact under benchmark review' : 'Caio picnic WebXR playtest'
    }
  };
}
writeFileSync(resolve(root, 'manifest.json'), JSON.stringify({ references, assets }, null, 2) + '\n');
console.log(Object.entries(assets).map(([id, asset]) =>
  [id, asset.evidence.isolated_views, asset.evidence.scripted_views, asset.release.vision].join('\t')).join('\n'));
