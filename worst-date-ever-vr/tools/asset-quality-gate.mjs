import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RUBRIC_WEIGHTS = Object.freeze({
  baselineFidelity:0.40, vrReadability:0.20, materialCoherence:0.15,
  semanticFit:0.15, defectFree:0.10
});
const REQUIRED_VIEWS = ['front','back','left','right','top','three_quarter','in_scene'];
const REQUIRED_CHECKS = ['provenance','meshHealth','scale','colliderAndGrip','rigIfRequired','exportCompatibility','questWeb','questUnity'];

// A policy gate only. The independent visual model must be invoked through the
// VisualJudge adapter, and statically measured facts must come from mesh/Quest tools.
export function evaluateAssetReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return {status:'rejected',visualScore:0,errors:['Missing report']};
  if (!report.baselineComplete || !report.baselineVersion || report.baselineVersion.startsWith('PENDING'))
    errors.push('Current project style baseline not approved');
  for (const view of REQUIRED_VIEWS) if (!report.views?.includes(view)) errors.push(`Missing view: ${view}`);
  if (errors.length) return {status:'human_review',visualScore:null,errors};

  const checks = report.staticChecks ?? {};
  for (const check of REQUIRED_CHECKS) if (!['pass','fail','pending','not_applicable'].includes(checks[check]))
    return {status:'human_review',visualScore:null,errors:[`Missing/invalid technical check: ${check}`]};
  if (checks.provenance !== 'pass')
    return {status:checks.provenance === 'fail' ? 'rejected':'human_review',visualScore:null,errors:['Provenance/license gate not passed']};
  const failed = REQUIRED_CHECKS.filter(k => checks[k] === 'fail');
  if (failed.length) return {status:'needs_revision',visualScore:null,errors:failed.map(k=>`Technical hard failure: ${k}`)};
  const pendingNonDevice = REQUIRED_CHECKS.filter(k => !['questWeb','questUnity'].includes(k) && checks[k] === 'pending');
  if (pendingNonDevice.length) return {status:'human_review',visualScore:null,errors:pendingNonDevice.map(k=>`Pending audit: ${k}`)};

  const judge = report.visualJudge;
  const scores = judge?.scores;
  if (!scores || Object.keys(RUBRIC_WEIGHTS).some(k => typeof scores[k] !== 'number' || !Number.isFinite(scores[k]) || scores[k] < 0 || scores[k] > 5))
    return {status:'human_review',visualScore:null,errors:['Invalid vision judge scores']};
  const visualScore = Object.entries(RUBRIC_WEIGHTS).reduce((sum,[key,w])=>sum+scores[key]*w,0);
  if (judge.observations?.some(o=>o.severity === 'blocking'))
    return {status:'needs_revision',visualScore,errors:['Vision judge observed blocking defect']};
  if (scores.baselineFidelity < 4 || Object.values(scores).some(v=>v<3) || visualScore < 4)
    return {status:'needs_revision',visualScore,errors:['Visual style/quality threshold not met']};
  if (!Number.isFinite(judge.confidence) || judge.confidence < 0.8)
    return {status:'human_review',visualScore,errors:['Low vision judge confidence']};
  if (['hero_prop','npc','environment'].includes(report.assetRole) && !report.humanReview?.approved)
    return {status:'human_review',visualScore,errors:['Hero/character/environment requires human art lead sign-off']};
  if (checks.questWeb !== 'pass' || checks.questUnity !== 'pass')
    return {status:'pending_device_validation',visualScore,errors:['Awaiting both Quest WebXR and Unity on-device acceptance']};
  return {status:'approved',visualScore,errors:[]};
}

const directRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (directRun) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node tools/asset-quality-gate.mjs <asset-evaluation.json>');process.exitCode=2; }
  else {
    try {
      const result = evaluateAssetReport(JSON.parse(readFileSync(file,'utf8')));
      console.log(JSON.stringify(result,null,2));
      process.exitCode = result.status === 'approved' ? 0 : 1;
    } catch (e) {console.error(e.message);process.exitCode=2;}
  }
}
