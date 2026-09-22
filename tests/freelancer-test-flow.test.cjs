const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
function load(file) {
  const compiled = ts.transpileModule(readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function('module', 'exports', compiled)(loaded, loaded.exports);
  return loaded.exports;
}
const flow = load('src/lib/freelancer-setup.ts');
const profile = Object.fromEntries(['fullName', 'displayName', 'profileImageUrl', 'bio', 'experience', 'location', 'timezone', 'availability', 'profession'].map((key) => [key, 'valid']));
profile.languages = ['Hindi'];
const state = { profile, currentStep: 2, identity: { skipped: true, verified: false }, assessment: { submitted: false }, service: null };
test('API step 2 resumes portfolio, not an empty assessment', () => assert.equal(flow.freelancerSetupStep(state), 'portfolio'));
test('submitted portfolio unlocks dynamic test', () => assert.equal(flow.freelancerSetupStep({ ...state, currentStep: 3 }), 'assessment'));
test('missing professional profile resumes profile', () => assert.equal(flow.freelancerSetupStep({ ...state, profile: {} }), 'profile'));
test('identity choice still required but does not count as verification', () => assert.equal(flow.freelancerSetupStep({ ...state, identity: {} }), 'profile'));
test('submitted assessment resumes review', () => assert.equal(flow.freelancerSetupStep({ ...state, currentStep: 3, assessment: { submitted: true } }), 'review'));
test('rejected portfolio returns to correction', () => assert.equal(flow.freelancerSetupStep({ ...state, currentStep: 3, assessment: { submitted: true }, service: { status: 'Rejected' } }), 'portfolio'));
test('disabled assessment is handled without dereferencing missing payload', () => assert.equal(flow.freelancerSetupStep({ status: 'DISABLED', completed: true }), 'review'));
test('zero questions never permit empty submission', () => assert.equal(flow.assessmentAnswersComplete([], {}), false));
test('portfolio do-later drafts preserve tags, deliverables and categories for reload', () => {
  const draft = flow.portfolioDraftForSave({ title: 'Reels', tags: ' shorts, captions, ', deliverables: 'Master file\n\nProject archive', primaryCategory: 'SHORT_FORM', secondaryCategories: ['MOTION_GRAPHICS'] });
  assert.deepEqual(draft.tags, ['shorts', 'captions']);
  assert.deepEqual(draft.deliverables, ['Master file', 'Project archive']);
  assert.equal(draft.primaryEditorCategory, 'SHORT_FORM');
  assert.deepEqual(draft.secondaryEditorCategories, ['MOTION_GRAPHICS']);
  assert.equal(draft.title, 'Reels');
});
test('only real option IDs and all questions permit submission', () => {
  const questions = [{ id: 'q1', options: [{ id: 'a' }, { id: 'b' }] }, { id: 'q2', options: [{ id: 'a' }] }];
  assert.equal(flow.assessmentAnswersComplete(questions, { q1: 'a' }), false);
  assert.equal(flow.assessmentAnswersComplete(questions, { q1: 'invalid', q2: 'a' }), false);
  assert.equal(flow.assessmentAnswersComplete(questions, { q1: 'b', q2: 'a' }), true);
});
test('do later is user-scoped, observable, resettable and not persistent', () => {
  const deferral = load('src/lib/onboarding-deferral.ts');
  let updates = 0;
  const unsubscribe = deferral.subscribeOnboardingDeferral(() => updates++);
  assert.equal(deferral.isOnboardingDeferred('freelancer'), false);
  deferral.deferOnboarding('freelancer');
  assert.equal(deferral.isOnboardingDeferred('freelancer'), true);
  assert.equal(deferral.isOnboardingDeferred('agency'), false);
  deferral.resetOnboardingDeferral();
  assert.equal(deferral.isOnboardingDeferred('freelancer'), false);
  assert.equal(updates, 2);
  unsubscribe();
  deferral.deferOnboarding('agency');
  assert.equal(updates, 2);
  assert.equal(load('src/lib/onboarding-deferral.ts').isOnboardingDeferred('agency'), false);
});
test('UI entry points and background/logout reminder resets remain connected', () => {
  const source = (name) => readFileSync(path.join(__dirname, '..', name), 'utf8');
  assert.match(source('app/register.tsx'), /Skills test & Trust Score/);
  assert.match(source('app/(tabs)/dashboard.tsx'), /router.push\('\/freelancer-test'\)/);
  assert.match(source('app/_layout.tsx'), /status === 'background'\) resetOnboardingDeferral/);
  assert.match(source('src/hooks/useAuth.ts'), /resetOnboardingDeferral\(\)/);
  assert.match(source('app/connected-onboarding.tsx'), /method: 'PATCH', token, body: \{ stage:/);
  assert.match(source('app/connected-onboarding.tsx'), /disabled=\{!assessmentAnswersComplete/);
});
