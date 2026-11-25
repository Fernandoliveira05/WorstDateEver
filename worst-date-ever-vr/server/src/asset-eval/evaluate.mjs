import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { contract } from '../contracts.mjs';
import { evaluateAssetReport } from '../../../tools/asset-quality-gate.mjs';
import { judgeModelVisualQuality } from './visual-judge.mjs';

const schemaPath = new URL('../../../specs/002-vr-first-date/contracts/asset-evaluation.schema.json', import.meta.url);
const judgeSchema = JSON.parse(readFileSync(schemaPath)).properties.visualJudge;
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function invokePinnedVision({ systemPrompt, baselineImages, candidateImages, metadata, outputSchema }) {
  const version = process.env.DATE_VISION_MODEL;
  const key = process.env.OPENAI_API_KEY;
  if (!key || !version || !/-\d{4}-\d{2}-\d{2}$/.test(version))
    throw new Error('Configure the approved dated DATE_VISION_MODEL snapshot and server API key.');
  const attach = (file, label) => {
    const type = mime[extname(file).toLowerCase()];
    const bytes = readFileSync(file);
    if (!type || !bytes.length || bytes.length > 5_000_000) throw new Error('Invalid evaluator image');
    return [{ type: 'input_text', text: label }, {
      type: 'input_image', image_url: 'data:' + type + ';base64,' + bytes.toString('base64'), detail: 'high'
    }];
  };
  const evidence = [
    ...baselineImages.flatMap((file, i) => attach(file, 'Approved exemplar ' + (i + 1) + ' ' + file)),
    ...candidateImages.flatMap(({ view, path }) => attach(path, 'Candidate view ' + view))
  ];
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(90_000),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: version, store: false, instructions: systemPrompt,
      input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(metadata) }, ...evidence] }],
      text: { format: { type: 'json_schema', name: 'visual_judge', strict: true, schema: outputSchema } }
    })
  });
  if (!response.ok) throw new Error('Vision provider returned ' + response.status);
  const result = await response.json();
  const value = result.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text');
  if (!value) throw new Error('Vision provider returned no structured judgement.');
  return { ...JSON.parse(value.text), modelId: result.model, modelVersion: version };
}

async function main() {
  const [manifestPath, output] = process.argv.slice(2);
  if (!manifestPath || !output) throw new Error('Usage: node server/src/asset-eval/evaluate.mjs <manifest.json> <reports-dir>');
  const manifest = JSON.parse(readFileSync(manifestPath));
  const baseline = JSON.parse(readFileSync(manifest.baseline));
  const audit = JSON.parse(readFileSync(manifest.audit));
  const digest = createHash('sha256').update(readFileSync(manifest.assetPath)).digest('hex');
  if (digest !== audit.assetHash) throw new Error('Audit hash and candidate differ.');
  if (baseline.status !== 'approved') throw new Error('The existing art evidence needs art-owner approval first.');
  const candidateImages = Object.entries(manifest.views).map(([view, path]) => ({ view, path }));
  const expected = ['front','back','left','right','top','three_quarter','in_scene'];
  if (candidateImages.length !== expected.length || expected.some(view => !Object.hasOwn(manifest.views, view)))
    throw new Error('Missing required visual comparisons.');
  const metadata = { assetId: manifest.assetId, assetRole: manifest.assetRole, baselineVersion: baseline.version,
    baselineAssetIds: baseline.approvedAssetRefs, modelId: process.env.DATE_VISION_MODEL };
  const report = {
    schemaVersion: 1, assetId: manifest.assetId, assetRole: manifest.assetRole,
    assetHash: digest, baselineVersion: baseline.version, baselineComplete: true, rubricVersion: '1',
    views: expected, staticChecks: audit.staticChecks,
    humanReview: manifest.humanReview ?? { approved: false },
    visualJudge: await judgeModelVisualQuality({ invokeModel: invokePinnedVision,
      baselineImages: baseline.approvedSceneImageRefs, candidateImages, metadata, outputSchema: judgeSchema })
  };
  const validate = contract('asset-evaluation');
  if (!validate(report)) throw new Error('Evaluation violates contract: ' + JSON.stringify(validate.errors));
  const verdict = evaluateAssetReport(report);
  mkdirSync(output, { recursive: true });
  const reviewKey = createHash('sha256').update([digest, baseline.version, report.rubricVersion, report.visualJudge.modelVersion].join('|')).digest('hex');
  writeFileSync(resolve(output, reviewKey + '.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(verdict, null, 2));
  process.exitCode = verdict.status === 'approved' ? 0 : 1;
}

try { await main(); }
catch (error) { console.error(error.message); process.exitCode = 2; }
