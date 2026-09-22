const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, mocks={}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports','require',js)(exports, name => Object.hasOwn(mocks,name) ? mocks[name] : require(name)); return exports;
}
const core = load('src/lib/journey-core.ts');
const referral = load('src/lib/referral-contract.ts');
const context = (overrides={}) => ({ scope:'account-A', token:'qa-only', expiresAt:Date.UTC(2030,0,1), capability:{enabled:true,schemaVersion:1,privacyNoticeVersion:'v1'}, preference:{allowed:true,privacyNoticeVersion:'v1',savedAt:'2026-08-28T00:00:00Z'}, ...overrides });
function fixture() {
  let now = Date.UTC(2026,7,28), sequence=0, sends=0, writes=0, nextSend=null;
  const store = new Map(); const batches=[];
  const tracker=core.createJourneyTracker({
    storage:{read:async k=>store.get(k)??null,write:async(k,v)=>{writes++;store.set(k,v);},remove:async k=>{store.delete(k);}},
    now:()=>now,id:()=>`qa_${++sequence}`,appVersion:'2.1.4',distributionChannel:'DIRECT',
    send:async(body,token,signal)=>{sends++;batches.push({body,token,signal});return nextSend ? nextSend(body,token,signal) : {ok:true,acceptedEventIds:body.events.map(e=>e.eventId)};},
  });
  return {tracker,store,batches,setSend:fn=>{nextSend=fn;},advance:ms=>{now+=ms;}, get sends(){return sends;},get writes(){return writes;},get now(){return now;}};
}
test('missing, invalid and unsupported capabilities are disabled',()=>{
  for(const v of [null,{},true,{enabled:'true',schemaVersion:1,privacyNoticeVersion:'v1'},{enabled:true,schemaVersion:2,privacyNoticeVersion:'v1'},{enabled:true,schemaVersion:1},{enabled:true,schemaVersion:1,privacyNoticeVersion:'https://bad'}]) assert.equal(core.sanitizeJourneyCapability(v).enabled,false);
  assert.equal(core.sanitizeJourneyCapability(context().capability).enabled,true);
});
test('disabled or unconsented tracking queues nothing and makes zero network requests',async()=>{
  const f=fixture();
  for(const c of [null,context({capability:core.DISABLED_JOURNEY}),context({preference:null}),context({preference:{allowed:true,privacyNoticeVersion:'old'}}),context({expiresAt:1})]) {
    f.tracker.configure(c);await f.tracker.track('app.opened');await f.tracker.flush();
  }
  assert.equal(f.writes,0);assert.equal(f.sends,0);
});
test('allowlist excludes financial claims, secrets, URLs and personal data',async()=>{
  const f=fixture();f.tracker.configure(context());
  await f.tracker.track('Purchase',{value:2000});await f.tracker.track('onboarding.step_saved',{step:'profile',phone:'private',url:'https://private',score:100});
  await f.tracker.flush();assert.equal(f.batches[0].body.events.length,1);
  assert.deepEqual(f.batches[0].body.events[0].properties,{step:'profile'});
  assert.equal(JSON.stringify(f.batches[0].body).includes('qa-only'),false);
});
test('queue is bounded, drops expired entries and requires explicit acknowledgements',async()=>{
  const f=fixture();f.tracker.configure(context());for(let i=0;i<230;i++) await f.tracker.track('app.opened');
  assert.equal(JSON.parse([...f.store.values()][0]).length,200);
  f.advance(core.JOURNEY_MAX_AGE_MS+1);await f.tracker.flush();assert.equal(f.sends,0);assert.equal(f.store.size,0);
});
test('retry preserves event IDs, respects backoff and removes only acknowledged events',async()=>{
  const f=fixture();f.tracker.configure(context());await f.tracker.track('app.opened');await f.tracker.track('work.opened');
  f.setSend(async()=>{throw Error('offline');});await f.tracker.flush();await f.tracker.flush();assert.equal(f.sends,1);
  f.advance(30000);f.setSend(async b=>({ok:true,acceptedEventIds:[b.events[0].eventId,'not-in-batch']}));await f.tracker.flush();
  assert.equal(f.batches[0].body.events[0].eventId,f.batches[1].body.events[0].eventId);
  assert.equal(JSON.parse([...f.store.values()][0]).length,1);
});
test('missing endpoint halts retry until context changes',async()=>{
  const f=fixture();f.tracker.configure(context());await f.tracker.track('app.opened');
  f.setSend(async()=>{throw Object.assign(Error('disabled'),{status:404});});await f.tracker.flush();f.advance(400000);await f.tracker.flush();assert.equal(f.sends,1);
});
test('logout clears pending events and cancels in-flight export without restoring data',async()=>{
  const f=fixture();f.tracker.configure(context());await f.tracker.track('app.opened');let release;
  f.setSend(body=>new Promise(resolve=>{release=()=>resolve({ok:true,acceptedEventIds:body.events.map(e=>e.eventId)});}));
  const pending=f.tracker.flush();await new Promise(r=>setImmediate(r));
  f.tracker.reset();assert.equal(f.batches[0].signal.aborted,true);release();await pending;await f.tracker.settled();assert.equal(f.store.size,0);
});
test('account switch and withdrawal discard previous queue',async()=>{
  const f=fixture();f.tracker.configure(context());const pending=f.tracker.track('app.opened');
  f.tracker.configure(context({scope:'account-B',preference:null}));await pending;await f.tracker.settled();await f.tracker.flush();assert.equal(f.store.size,0);assert.equal(f.sends,0);
  f.tracker.configure(context());await f.tracker.track('app.opened');f.tracker.configure(context({preference:{allowed:false,privacyNoticeVersion:'v1'}}));await f.tracker.settled();assert.equal(f.store.size,0);
});
test('corrupted, duplicate and future-dated persisted records are not replayed',()=>{
  const now=Date.UTC(2026,7,28);const event={eventId:'qa_1',schemaVersion:1,eventName:'app.opened',occurredAt:new Date(now).toISOString(),appVersion:'2.1.4',distributionChannel:'DIRECT',properties:{}};
  assert.equal(core.parseJourneyQueue('bad',now).length,0);assert.equal(core.parseJourneyQueue(JSON.stringify([event,event,{...event,eventId:'qa_2',occurredAt:new Date(now+1).toISOString()}]),now).length,1);
});
test('referrals accept only approved paths and opaque IDs; never billing or external links',()=>{
  for(const url of ['https://gigxomi.com/r/GX_agent123','https://www.gigxomi.com/r/GX_agent123','gigxomi://r/GX_agent123']) assert.equal(referral.referralFromUrl(url),'GX_agent123');
  for(const url of ['https://evil.com/r/GX_agent123','https://gigxomi.com.evil.com/r/GX_agent123','https://evil@gigxomi.com/r/GX_agent123','http://gigxomi.com/r/GX_agent123','https://gigxomi.com/r/9981807309','https://gigxomi.com/mobile/billing-return?ref=GX_agent123','gigxomi://r/../../login','https://gigxomi.com:8443/r/GX_agent123']) assert.equal(referral.referralFromUrl(url),null);
});
test('install referrer tolerates absent data and rejects ambiguous/raw personal identifiers',()=>{
  assert.equal(referral.referralFromInstallReferrer(null),null);
  assert.equal(referral.referralFromInstallReferrer('utm_source=meta&ref=GX_agent123'),'GX_agent123');
  for(const raw of ['ref=9981807309','ref=name@example.com','ref=GX_agent123&ref=GX_other123','utm_source=meta']) assert.equal(referral.referralFromInstallReferrer(raw),null);
  assert.equal(referral.safeInstallTimestamp(1),null);assert.equal(referral.safeInstallTimestamp(Date.now()),null);
});
test('native plugin edits are idempotent and preserve release signing and billing links',()=>{
  const plugin=require('../plugins/with-install-referrer');
  const cachePlugin=require('../plugins/with-release-bundle-cache-isolation');
  const gradle='android { buildTypes { release { signingConfig signingConfigs.release } } }\ndependencies {\n}';
  assert.equal(plugin.patchGradle(plugin.patchGradle(gradle)),plugin.patchGradle(gradle));
  const reactGradle=`react {\n}\n${gradle}`;
  assert.equal(cachePlugin.patchGradle(cachePlugin.patchGradle(reactGradle)),cachePlugin.patchGradle(reactGradle));
  assert.match(cachePlugin.patchGradle(reactGradle),/extraPackagerArgs = \["--reset-cache"\]/);
  const main='PackageList(this).packages.apply {\n}';assert.equal(plugin.patchApplication(plugin.patchApplication(main)),plugin.patchApplication(main));
  assert.match(gradle,/signingConfigs.release/);
  const config=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo;
  assert.ok(config.android.intentFilters.some(f=>f.data.some(d=>d.pathPrefix==='/mobile/billing-return')));
  assert.ok(config.plugins.includes('./plugins/with-install-referrer'));
  assert.ok(config.plugins.includes('./plugins/with-release-bundle-cache-isolation'));
  assert.match(fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8'),/extraPackagerArgs = \["--reset-cache"\]/);
});

function nativeFixture(result={status:'unavailable'}) {
  const secure=new Map();const disk=new Map();let calls=0,requests=0,boundary;
  const runtime=load('src/lib/journey-runtime.ts',{
    'expo-constants':{default:{expoConfig:{version:'2.1.4'}}},
    'expo-file-system/legacy':{documentDirectory:'qa:///',getInfoAsync:async k=>({exists:disk.has(k)}),readAsStringAsync:async k=>disk.get(k),writeAsStringAsync:async(k,v)=>{disk.set(k,v);},makeDirectoryAsync:async()=>{},deleteAsync:async k=>{disk.delete(k);}},
    'expo-secure-store':{getItemAsync:async k=>secure.get(k)??null,setItemAsync:async(k,v)=>{secure.set(k,v);}},
    'react-native':{Platform:{OS:'android'},NativeModules:{GigxomiInstallReferrer:{read:async()=>{calls++;return result;}}}},
    './account-boundary':{subscribeAccountBoundary:fn=>{boundary=fn;}},
    './api':{apiRequest:async()=>{requests++;throw Error('No network expected');}},
    './journey-core':core,'./referral-contract':referral,
  });
  return {runtime,secure,disk,get calls(){return calls;},get requests(){return requests;},reset:()=>boundary()};
}

test('native unavailable/direct install is normal, one attempt per installation, no network',async()=>{
  const f=nativeFixture();
  await Promise.all([f.runtime.initializeInstallReferral(),f.runtime.initializeInstallReferral()]);
  await f.runtime.initializeInstallReferral();
  await f.runtime.journey.track('app.opened');await f.runtime.journey.flush();
  assert.equal(f.calls,1);assert.equal(f.requests,0);assert.equal(f.disk.size,0);
  const metadata=JSON.parse([...f.secure.values()][0]);
  assert.equal(metadata.checked,true);assert.equal(metadata.referralId,null);
  assert.ok(metadata.firstOpenedAt>0);
});

test('only validated first referral and installation timestamps survive local storage',async()=>{
  const timestamp=Math.floor(Date.now()/1000)-100;
  const f=nativeFixture({status:'available',referrer:'ref=GX_agent123&utm_source=private&phone=private',installStartedAtSeconds:timestamp});
  await f.runtime.initializeInstallReferral();
  await f.runtime.captureReferralLink('gigxomi://r/GX_second123?redirect=https://evil.com');
  const metadata=JSON.parse([...f.secure.values()][0]);
  assert.equal(metadata.referralId,'GX_agent123');assert.equal(metadata.installStartedAt,timestamp*1000);
  assert.equal(JSON.stringify(metadata).includes('private'),false);assert.equal(JSON.stringify(metadata).includes('redirect'),false);
  assert.equal(f.requests,0);assert.equal(f.disk.size,0);
});

test('malformed and billing links neither write referral data nor trigger new APIs',async()=>{
  const f=nativeFixture();
  for(const url of ['not a link','https://gigxomi.com/mobile/billing-return?ref=GX_agent123','https://evil.com/r/GX_agent123','gigxomi://r/9981807309']) await f.runtime.captureReferralLink(url);
  assert.equal(f.secure.size,0);assert.equal(f.requests,0);
});

test('runtime account-boundary reset clears the persisted optional queue',async()=>{
  const f=nativeFixture();f.runtime.journey.configure(context());await f.runtime.journey.track('work.opened');
  assert.equal(f.disk.size,1);f.reset();await f.runtime.journey.settled();assert.equal(f.disk.size,0);
  assert.equal(f.requests,0);
});

test('waiting for restored preferences pauses tracking without destroying retry IDs',async()=>{
  const f=fixture();f.tracker.configure(context());await f.tracker.track('app.opened');
  const previous=[...f.store.values()][0];f.tracker.suspend();
  await f.tracker.track('work.opened');await f.tracker.flush();
  assert.equal(f.sends,0);assert.equal([...f.store.values()][0],previous);
  f.tracker.configure(context());await f.tracker.flush();
  assert.equal(f.batches[0].body.events[0].eventId,JSON.parse(previous)[0].eventId);
});

test('logout while preference restoration is paused still clears pending events',async()=>{
  const f=fixture();f.tracker.configure(context());await f.tracker.track('app.opened');
  f.tracker.suspend();f.tracker.reset();await f.tracker.settled();assert.equal(f.store.size,0);
});

test('throwing storage and transport never reject a normal app action',async()=>{
  const tracker=core.createJourneyTracker({storage:{read:async()=>{throw Error('unavailable');},write:async()=>{throw Error('unavailable');},remove:async()=>{throw Error('unavailable');}},now:Date.now,id:()=> 'qa_event',appVersion:'2.1.4',distributionChannel:'DIRECT',send:async()=>{throw Error('offline');}});
  tracker.configure(context());await assert.doesNotReject(tracker.track('app.opened'));await assert.doesNotReject(tracker.flush());tracker.reset();await assert.doesNotReject(tracker.settled());
});

test('Reader checkout handlers guard returned links, not only visible buttons',()=>{
  const packageScreen=fs.readFileSync(path.join(root,'app/package.tsx'),'utf8');
  const signup=fs.readFileSync(path.join(root,'app/register.tsx'),'utf8');
  assert.match(packageScreen,/if \(!readerEdition\) await Linking\.openURL\(response\.paymentUrl\)/);
  assert.match(packageScreen,/function openWebPricing\(\)\s*\{\s*if \(readerEdition\) return;/);
  assert.match(signup,/if \(distributionChannel !== 'PLAY_READER'\) await Linking\.openURL\(result\.paymentUrl\)/);
});
