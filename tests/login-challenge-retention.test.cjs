const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const loginSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'login.tsx'), 'utf8');

test('OTP login retains the issued request identifiers until verification', () => {
  assert.match(loginSource, /otpRequestRef\.current = nextRequest/);
  assert.match(loginSource, /otpRequestRef\.current \?\? otpRequestState \?\? \(requestOtp\.data/);
  assert.match(loginSource, /challengeId: challengeId \|\| undefined/);
  assert.match(loginSource, /intentId: intentId \|\| undefined/);
});

test('protected agency code mode never opens WhatsApp', () => {
  assert.match(loginSource, /response\.deliveryMode !== 'preconfigured-code'/);
  assert.match(loginSource, /Agency access code/);
});
