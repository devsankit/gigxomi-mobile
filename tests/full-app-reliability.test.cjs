const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const box = { exports: {} }; cache.set(file, box);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('module', 'exports', 'require', js)(box, box.exports, id => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
      if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
      return require(id);
    });
    return box.exports;
  }
  return load;
}
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
test('QA refuses missing API, production and cross-origin endpoints', () => {
  const { assertQaRequestUrl: check } = loader()('src/lib/qa-boundary.ts');
  assert.throws(() => check('https://www.gigxomi.com/api', true), /explicit isolated/);
  for (const host of ['gigxomi.com', 'www.gigxomi.com', 'postproduction.work']) assert.throws(() => check(`https://${host}/api`, true, `https://${host}/api`), /production/);
  assert.throws(() => check('https://www.gigxomi.com/api', true, 'http://127.0.0.1:8900/api'), /outside/);
  assert.doesNotThrow(() => check('http://127.0.0.1:8900/api/tasks', true, 'http://127.0.0.1:8900/api'));
  assert.doesNotThrow(() => check('https://www.gigxomi.com/api', false));
});
test('account generation changes on account/tenant switch, not same-account refresh', () => {
  const boundary = loader()('src/lib/account-boundary.ts');
  const first = { userId: 'qa-a', tenantId: 'qa-one', role: 'FREELANCER' };
  boundary.setAccountCacheScope(first); const gen = boundary.getAccountGeneration();
  boundary.setAccountCacheScope(first); assert.equal(boundary.getAccountGeneration(), gen);
  boundary.setAccountCacheScope({ ...first, tenantId: 'qa-two' }); assert.ok(boundary.getAccountGeneration() > gen);
  boundary.resetAccountBoundary(); assert.equal(boundary.getAccountCacheScope(), null);
});
test('offline chat list/thread cannot cross accounts or read legacy unscoped cache', async () => {
  const storage = new Map(); const oldStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  try {
    const load = loader({ 'react-native': { Platform: { OS: 'web' } }, 'expo-file-system/legacy': {} });
    const boundary = load('src/lib/account-boundary.ts'); const cache = load('src/lib/chatCache.ts');
    storage.set('gigxomi.chat.list.freelancer', JSON.stringify({ data: { conversations: [{ id: 'private-legacy' }] } }));
    const a = { userId: 'qa-a', tenantId: 'qa-one', role: 'FREELANCER' };
    boundary.setAccountCacheScope(a); assert.equal(await cache.readCachedChatList('freelancer'), null);
    await cache.writeCachedChatList('freelancer', { conversations: [{ id: 'qa-chat-a' }] });
    await cache.writeCachedChatThread('qa-chat-a', 'freelancer', { id: 'qa-chat-a' });
    boundary.setAccountCacheScope({ ...a, userId: 'qa-b' });
    assert.equal(await cache.readCachedChatList('freelancer'), null);
    assert.equal(await cache.readCachedChatThread('qa-chat-a', 'freelancer'), null);
    boundary.setAccountCacheScope(a); assert.equal((await cache.readCachedChatList('freelancer')).conversations[0].id, 'qa-chat-a');
    boundary.resetAccountBoundary(); assert.equal(await cache.readCachedChatList('freelancer'), null);
  } finally { globalThis.localStorage = oldStorage; }
});
test('manual refresh never invokes disabled role queries', async () => {
  const { refreshEnabledQueries } = loader()('src/lib/query-refresh.ts'); let calls = 0;
  const result = await refreshEnabledQueries([{ isEnabled: true, refetch: async () => ++calls }, { isEnabled: false, refetch: async () => { throw Error('wrong role'); } }]);
  assert.equal(calls, 1); assert.equal(result.length, 1); assert.equal(result[0].status, 'fulfilled');
});
test('pending outgoing messages never cross accounts or resend legacy unowned entries', async () => {
  const oldStorage = globalThis.localStorage; const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key,value) => store.set(key,value) };
  try {
    const load = loader({ 'react-native': { Platform: { OS:'web' } }, 'expo-file-system/legacy': {} });
    const boundary=load('src/lib/account-boundary.ts'); const outbox=load('src/lib/chatOutbox.ts');
    store.set('gigxomi.chat.outbox', JSON.stringify({version:1,messages:[{id:'legacy',audience:'freelancer'}]}));
    const a={userId:'a',tenantId:null,role:'FREELANCER'};boundary.setAccountCacheScope(a);
    assert.equal((await outbox.listPendingChatMessages()).length,0);
    await outbox.enqueuePendingChatMessage({id:'qa-message',conversationId:'qa-chat',audience:'freelancer',clientMessageId:'qa-message',lane:'internal',body:'QA only'});
    boundary.setAccountCacheScope({...a,userId:'b'});assert.equal((await outbox.listPendingChatMessages()).length,0);
    boundary.setAccountCacheScope(a);assert.equal((await outbox.listPendingChatMessages()).length,1);
    const queued=outbox.markPendingChatMessageAttempt('qa-message');boundary.resetAccountBoundary();
    await assert.rejects(queued,/original account/);
  } finally {globalThis.localStorage=oldStorage;}
});
test('focus refresh does not rerun on callback identity changes; tour dismisses before storage writes', () => {
  assert.match(source('src/hooks/useRefreshOnFocus.ts'), /\}, \[enabled\]\)/);
  const tour=source('src/components/FirstRunCoachmarks.tsx');
  assert.ok(tour.indexOf('setVisible(false);') < tour.indexOf("await SecureStore.setItemAsync(storageKey, 'complete')"));
});
test('API discards authenticated response after account switch', async () => {
  const oldFetch = global.fetch; const load = loader(); const boundary = load('src/lib/account-boundary.ts');
  const { apiRequest } = load('src/lib/api.ts'); let release;
  global.fetch = () => new Promise(resolve => { release = resolve; });
  try {
    const pending = apiRequest('/qa', { token: 'qa-token' });
    boundary.resetAccountBoundary(); release(new Response('{}', { status: 200 }));
    await assert.rejects(pending, error => error.name === 'AbortError');
  } finally { global.fetch = oldFetch; }
});
test('pre-aborted requests remain cancellations, never offline fallback', async () => {
  const oldFetch = global.fetch; const { apiRequest } = loader()('src/lib/api.ts');
  const controller = new AbortController(); controller.abort();
  global.fetch = async (_, options) => { assert.equal(options.signal.aborted, true); throw new Error('aborted'); };
  try { await assert.rejects(apiRequest('/qa', { signal: controller.signal }), error => error.name === 'AbortError'); }
  finally { global.fetch = oldFetch; }
});
test('late network failure after logout is cancellation, not cached account fallback', async () => {
  const oldFetch=global.fetch;const load=loader();const boundary=load('src/lib/account-boundary.ts');const {apiRequest}=load('src/lib/api.ts');let reject;
  global.fetch=()=>new Promise((_,fail)=>{reject=fail;});
  try {const request=apiRequest('/qa',{token:'qa-token'});boundary.resetAccountBoundary();reject(new TypeError('Network failed'));await assert.rejects(request,error=>error.name==='AbortError');}
  finally {global.fetch=oldFetch;}
});
test('HTML, raw server errors and plaintext diagnostics never reach user copy', async () => {
  const oldFetch = global.fetch; const { apiRequest, ApiError } = loader()('src/lib/api.ts');
  try {
    for (const payload of ['<html>private db detail</html>', 'private db detail', JSON.stringify({ error: 'private db detail' })]) {
      global.fetch = async () => new Response(payload, { status: 500 });
      await assert.rejects(apiRequest('/qa'), error => error instanceof ApiError && error.status === 500 && !/private|500|html/i.test(error.message));
    }
  } finally { global.fetch = oldFetch; }
});
test('request timeout covers a stalled response body', async () => {
  const oldFetch = global.fetch; const { apiRequest } = loader()('src/lib/api.ts');
  global.fetch = async (_, options) => ({ text: () => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  try { await assert.rejects(apiRequest('/qa', { timeoutMs: 1000 }), /too long/); } finally { global.fetch = oldFetch; }
});
test('automatic mutation replay is disabled and all auth transitions purge queries', () => {
  assert.match(source('src/lib/queryClient.ts'), /mutations:\s*\{[\s\S]*?retry: false/);
  const auth = source('src/hooks/useAuth.ts');
  assert.equal((auth.match(/await acceptAuthenticatedSession\(queryClient, response\)/g) || []).length, 5);
  assert.match(auth, /cancelQueries\(\)/); assert.match(auth, /removeQueries\(\)/);
});
test('dashboard uses saved profile state and unknown presence is not online', () => {
  const dashboard = source('app/(tabs)/dashboard.tsx');
  assert.match(dashboard, /profileDone = setupGate.data\?\.profileComplete === true/);
  assert.match(dashboard, /online === null/); assert.match(dashboard, /onlineStatus === 'online' : null/);
  assert.doesNotMatch(dashboard, /trustScore > 0|onlineStatus !== 'offline'/);
  assert.match(dashboard, /refreshEnabledQueries/);
});
test('agency integration management is reachable without changing routing', () => {
  const integrations = source('app/integrations.tsx');
  assert.match(integrations, /Client inbox connections/);
  assert.match(integrations, /WhatsApp Business Cloud API/);
});
test('onboarding deep links require a session and reset form state per account', () => {
  const onboarding=source('app/connected-onboarding.tsx');
  assert.match(onboarding,/if \(!auth.token \|\| !auth.session\)/);
  assert.match(onboarding,/Sign in to continue setup/);
  assert.equal((onboarding.match(/key=\{auth.session.userId\}/g)||[]).length,2);
});
test('permission refusal is not presented as an expired login', () => {
  const feedback=source('src/components/work/WorkPrimitives.tsx');
  assert.match(feedback,/const expired = error instanceof ApiError && error.status === 401;/);
  assert.match(feedback,/forbidden \? 'Access not available'/);
});
