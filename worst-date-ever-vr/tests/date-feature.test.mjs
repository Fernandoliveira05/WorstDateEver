import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDateSession, validateSceneHandoff, advanceDatePhase, applyApprovedDelta, venueForMatch} from '../src/date/session-core.mjs';
import {chooseEligibleEvent, resolveEvent, seededRandom} from '../src/date/event-core.mjs';
import {evaluateAssetReport} from '../tools/asset-quality-gate.mjs';
import {judgeModelVisualQuality} from '../server/src/asset-eval/visual-judge.mjs';

const exit = {schemaVersion:1,phase:'exit',avatarGender:'female',preference:'men',matchId:'rafa',substance:'none'};
const checks = {provenance:'pass',meshHealth:'pass',scale:'pass',colliderAndGrip:'pass',rigIfRequired:'not_applicable',exportCompatibility:'pass',questWeb:'pass',questUnity:'pass'};
const asset = () => ({schemaVersion:1,assetId:'new_cup',assetHash:'a'.repeat(64),assetRole:'common_prop',baselineVersion:'approved-v1',baselineComplete:true,rubricVersion:'v1',
  views:['front','back','left','right','top','three_quarter','in_scene'],visualJudge:{modelId:'configured-vision-model',modelVersion:'v1',confidence:0.95,scores:{baselineFidelity:5,vrReadability:4.6,materialCoherence:4.8,semanticFit:4.7,defectFree:4.9},observations:[]},
  staticChecks:{...checks},humanReview:{approved:false}});

test('date handoff preserves player identity but maps matches to venue',()=>{
  assert.equal(validateSceneHandoff(exit),true);
  assert.equal(createDateSession(exit,'session001').venueId,'sushi');
  assert.equal(venueForMatch('bia'),'bistro');
  assert.equal(venueForMatch('luiza'),'bar');
  assert.equal(venueForMatch('caio'),'cafe');
});
test('DMT and other invalid entry do not start a date',()=>{
  assert.equal(validateSceneHandoff({...exit,substance:'dmt'}),false);
  assert.throws(()=>createDateSession({...exit,phase:'aftermath'},'s'));
});
test('date can only talk after arrival + sit',()=>{
  let s=createDateSession(exit,'s');
  assert.equal(advanceDatePhase(s,'DATE_SEATED'),s);
  for (const action of ['DATE_ENTERS','DATE_REACHES_TABLE','DATE_STARTS_SITTING','DATE_SEATED']) s=advanceDatePhase(s,action);
  assert.equal(s.phase,'dialogue'); assert.equal(s.arrivalState,'seated');
});
test('bounded relationship changes',()=>{
  let s=createDateSession(exit,'s');
  assert.equal(applyApprovedDelta(s,{interest:10}).relationship.interest,52);
  assert.throws(()=>applyApprovedDelta(s,{interest:999}));
});
test('seeded event selection is replayable and inactive before date arrives',()=>{
  const pool=[{id:'x',venueIds:['sushi'],weight:1},{id:'y',venueIds:['sushi'],weight:3}];
  assert.equal(chooseEligibleEvent({catalog:pool,venueId:'sushi',phase:'waiting',rand:seededRandom(1)}),null);
  const a=chooseEligibleEvent({catalog:pool,venueId:'sushi',rand:seededRandom(10)});
  const b=chooseEligibleEvent({catalog:pool,venueId:'sushi',rand:seededRandom(10)});
  assert.equal(a.id,b.id);
});
test('event resolution only accepts authored choices',()=>{
  let s=createDateSession(exit,'s');
  for (const a of ['DATE_ENTERS','DATE_REACHES_TABLE','DATE_STARTS_SITTING','DATE_SEATED']) s=advanceDatePhase(s,a);
  const e={id:'water_spill',venueIds:['sushi'],choices:[{id:'help',contextSummary:'ajudou',relationshipDelta:{interest:2}}],summaryTemplate:'The player {choice}'};
  assert.throws(()=>resolveEvent(s,e,'attack'));
  const result=resolveEvent(s,e,'help');
  assert.equal(result.session.relationship.interest,44);
  assert.equal(result.contextSummary,'The player ajudou');
  assert.throws(()=>resolveEvent(result.session,e,'help'));
});
test('quality gate respects existing style and only accepts complete evidence',()=>{
  assert.equal(evaluateAssetReport(asset()).status,'approved');
  const missing=asset();missing.baselineComplete=false;
  assert.equal(evaluateAssetReport(missing).status,'human_review');
  const mismatch=asset();mismatch.visualJudge.scores.baselineFidelity=2;
  assert.equal(evaluateAssetReport(mismatch).status,'needs_revision');
  const noLicense=asset();noLicense.staticChecks.provenance='fail';
  assert.equal(evaluateAssetReport(noLicense).status,'rejected');
  const noCollider=asset();noCollider.staticChecks.colliderAndGrip='fail';
  assert.equal(evaluateAssetReport(noCollider).status,'needs_revision');
  const noQuest=asset();noQuest.staticChecks.questWeb='pending';
  assert.equal(evaluateAssetReport(noQuest).status,'pending_device_validation');
  const critical=asset();critical.assetRole='npc';
  assert.equal(evaluateAssetReport(critical).status,'human_review');
  critical.humanReview.approved=true;
  assert.equal(evaluateAssetReport(critical).status,'approved');
});
test('visual judge model requires approved exemplars and multi-view captures',async()=>{
  const fake=async ({systemPrompt,baselineImages,candidateImages})=>{
    assert.match(systemPrompt,/CURRENT project/);assert.equal(baselineImages.length,3);assert.equal(candidateImages.length,7);
    return {scores:{baselineFidelity:4},observations:[]};
  };
  await assert.rejects(judgeModelVisualQuality({invokeModel:fake,baselineImages:[],candidateImages:[]}));
  const response=await judgeModelVisualQuality({invokeModel:fake,baselineImages:[1,2,3],candidateImages:[1,2,3,4,5,6,7]});
  assert.equal(response.scores.baselineFidelity,4);
});
