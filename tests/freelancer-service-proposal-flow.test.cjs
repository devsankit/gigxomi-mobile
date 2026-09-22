const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('proposal submission does not require an approved service', () => {
  const details = source('src/components/work/WorkPostDetails.tsx');
  assert.match(details, /Attach an approved service · Optional/);
  assert.match(details, /you can apply without one/);
  assert.doesNotMatch(details, /disabled=\{[^}]*!serviceId/);
  assert.match(details, /No approved service yet\. You can still send this proposal now\./);
});

test('mobile service publishing is video-editing only and retains review feedback', () => {
  const hook = source('src/hooks/useServices.ts');
  const workspace = source('src/components/ServiceWorkspace.tsx');
  assert.match(hook, /ServiceCategory = 'Video Editing'/);
  assert.doesNotMatch(workspace, /Graphic Design/);
  assert.match(workspace, /Submitted for Super Admin review|Super Admin review/);
  assert.ok(workspace.indexOf('resetForm(false);') < workspace.indexOf('setNotice(submitted.service.reviewNote'));
});

test('freelancer dashboard hides package expiry while agency keeps its status card', () => {
  const dashboard = source('app/(tabs)/dashboard.tsx');
  assert.match(dashboard, /!isFreelancer \? <PackageStatusCard/);
  assert.match(dashboard, /useRoleDashboard\(user\?\.role, workspaceMode, user\?\.userId\)/);
});
