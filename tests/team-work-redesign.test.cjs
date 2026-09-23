const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
function load(file, mocks = {}, extra = '') {
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8') + extra;
  const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = {exports:{}};
  new Function('module','exports','require',code)(mod,mod.exports,id=>{if(id in mocks)return mocks[id];throw new Error('Unexpected import '+id);});
  return mod.exports;
}
const presentation = load('src/lib/work-presentation.ts');
test('tags are trimmed and deduplicated without losing display spelling',()=>assert.deepEqual(presentation.uniqueTags([' Reels ','reels','Color','COLOR','', 'Sound']),['Reels','Color','Sound']));
test('single budgets are not duplicated and missing prices are not zero',()=>{
  assert.equal(presentation.budgetLabel(500,500),'₹500');
  assert.equal(presentation.budgetLabel(null,null),'Budget to discuss');
  assert.equal(presentation.rupees(null),'Price on request');
  assert.equal(presentation.rupees(0),'₹0');
});
test('Karma never impersonates Trust Score; provisional and unassessed are explicit',()=>{
  assert.equal(presentation.trustLabel({karmaScore:90}),'Not assessed');
  assert.equal(presentation.trustLabel({trustScore:0,trustProvisional:true}),'0/100 · Provisional');
});
test('portfolio URLs reject unsafe schemes and credentials',()=>{
  for(const url of ['javascript:alert(1)','http://example.com','https://user:password@example.com','bad'])assert.equal(presentation.publicMediaUrl(url),null);
  assert.equal(presentation.publicMediaUrl('https://example.com/video.mp4'),'https://example.com/video.mp4');
  assert.equal(presentation.youtubeVideoId('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'),null);
});
test('Team portfolio cards open a native player before invitation',()=>{
  const card=readFileSync(path.join(__dirname,'../src/components/team/EditorCard.tsx'),'utf8');
  const screen=readFileSync(path.join(__dirname,'../src/components/team/AgencyTeamScreen.tsx'),'utf8');
  const player=readFileSync(path.join(__dirname,'../src/components/team/EditorProfile.tsx'),'utf8');
  assert.match(card,/onPortfolio \?\? onView/);
  assert.match(screen,/EditorPortfolioPlayerModal/);
  assert.match(screen,/onPortfolio=\{\(\) => setPortfolioEditor\(item\)\}/);
  assert.match(player,/PortfolioMediaPlayer/);
  assert.match(player,/Invite to Agency Team/);
  assert.match(player,/useEditorProfile\(editor.id\)/);
  assert.match(player,/QueryFeedback.*actionError/);
});
const media = load('src/lib/portfolio-media.ts', { './work-presentation': presentation });
test('portfolio playback resolves real providers without host spoofing or unsafe URLs', () => {
  assert.equal(media.resolvePortfolioMedia('javascript:alert(1)'), null);
  assert.equal(media.resolvePortfolioMedia('https://youtu.be/dQw4w9WgXcQ').kind, 'youtube');
  assert.equal(media.resolvePortfolioMedia('https://cdn.example.com/showreel.mp4?signature=abc#t=10').kind, 'direct');
  assert.equal(media.resolvePortfolioMedia('https://vimeo.com.evil.test/123').kind, 'external');
  assert.equal(media.resolvePortfolioMedia('https://vimeo.com/123/abc123').embedUrl, 'https://player.vimeo.com/video/123?h=abc123');
  assert.equal(media.resolvePortfolioMedia('https://player.vimeo.com/video/123?h=secret').embedUrl, 'https://player.vimeo.com/video/123?h=secret');
  const loom = media.resolvePortfolioMedia('https://www.loom.com/share/abc123');
  assert.equal(loom.embedUrl, 'https://www.loom.com/embed/abc123');
  assert.equal(loom.url, 'https://www.loom.com/share/abc123');
  assert.equal(media.resolvePortfolioMedia('https://drive.google.com/file/d/abc-123/view').embedUrl, 'https://drive.google.com/file/d/abc-123/preview');
  assert.equal(media.resolvePortfolioMedia('https://drive.google.com/open?id=abc_123').kind, 'drive_file');
});
test('portfolio samples deduplicate and exclude unusable links', () => {
  assert.deepEqual(media.portfolioSources({ services: [{portfolioUrl:'https://example.com/a.mp4'}, {portfolioUrl:'http://unsafe.test'}], portfolioLinks:['https://example.com/a.mp4','https://example.com/b.mp4'] }), ['https://example.com/a.mp4','https://example.com/b.mp4']);
});
test('YouTube supplies app identity and failure events without autoplay', () => {
  const html = media.youtubePortfolioHtml('dQw4w9WgXcQ');
  assert.match(html, /origin=https:\/\/www\.youtube\.com/);
  assert.match(html, /onPlayerError/);
  assert.match(html, /kind: 'error'/);
  assert.throws(() => media.youtubePortfolioHtml("bad';script"));
});
const auth = {token:'qa-token',session:{userId:'editor-a',tenantId:'tenant-a',role:'FREELANCER'}};
let queryOptions;
const mocks = {'@tanstack/react-query':{useQuery:options=>(queryOptions=options),useMutation:options=>options,useQueryClient:()=>({})},'@/src/lib/api':{apiRequest:()=>{}},'./queryKeys':{queryKeys:{workMatching:['work'],assignments:['assignments'],editorDirectory:['directory']}},'./useAuth':{useAuth:()=>auth,useStoredToken:()=>({data:auth.token})}};
mocks['@/src/lib/journey-runtime'] = { journey: { track: () => Promise.resolve() } };
const work = load('src/hooks/useWorkMatching.ts',mocks,'\nexport const testAdapter = {mapTaskToPost, mapTaskApplication, toWorkMatchingPayload};');
const task={id:'task-a',tenantId:'tenant-a',agencyName:'Agency',title:'Reels',brief:'Brief',category:'Reels',budgetAmount:500,referenceLinks:[],requiredSkills:['Reels'],status:'OPEN',visibility:'PUBLIC',deadline:null,createdAt:'2026-08-27',updatedAt:'2026-08-27'};
const application={id:'app-a',taskId:task.id,tenantId:task.tenantId,freelancerId:'editor-a',freelancerName:'Real response name',proposal:'Proposal',quotedAmount:500,estimatedTurnaround:'2 days',portfolioReference:'',status:'ACCEPTED',createdAt:task.createdAt,updatedAt:task.updatedAt};
test('task adapter preserves applicant and assigned editor names',()=>{
  const post=work.testAdapter.mapTaskToPost({...task,assignedFreelancerId:'editor-a',acceptedApplicationId:'app-a'},[application]);
  assert.equal(post.applications[0].editorName,'Real response name');
  assert.equal(post.assignedFreelancerName,'Real response name');
});
test('recommendation unavailable is distinct from no matches and no score is manufactured',()=>{
  const post=work.testAdapter.mapTaskToPost(task);
  assert.equal(post.recommendationsAvailable,false);
  assert.equal(post.recommendedEditors,undefined);
  const result=work.testAdapter.toWorkMatchingPayload({tasks:[task],applications:[]},'FREELANCER');
  assert.equal(result.matchedWork[0].match,undefined);
  assert.equal(result.matchedWork[0].matchScore,undefined);
});
test('all freelancer application statuses survive mapping',()=>{
  for(const status of ['SHORTLISTED','ACCEPTED','REJECTED','WITHDRAWN'])assert.equal(work.testAdapter.mapTaskApplication({...application,status},task).status,status);
  assert.equal(work.testAdapter.mapTaskApplication({...application,status:'APPLIED'},task).status,'PENDING');
});
test('work query keys isolate accounts and tenants',()=>{
  work.useWorkMatching('FREELANCER');const first=queryOptions.queryKey;
  auth.session={...auth.session,userId:'editor-b',tenantId:'tenant-b'};
  work.useWorkMatching('FREELANCER');
  assert.notDeepEqual(first,queryOptions.queryKey);
});
let calls=[];
const team = load('src/hooks/useTeam.ts',{...mocks,'@tanstack/react-query':{...mocks['@tanstack/react-query'],useInfiniteQuery:o=>(queryOptions=o,{data:{pages:[{mode:'agency',editors:[{id:'a'}]},{mode:'agency',editors:[{id:'a'},{id:'b'}]}]}})},'@/src/lib/api':{apiRequest:(url,options)=>calls.push({url,options})}});
test('directory requests scope search presence pagination and forward cancellation',()=>{
  const result=team.useEditorDirectory({scope:'team',search:' editor ',onlineOnly:true});
  const signal=new AbortController().signal;
  queryOptions.queryFn({pageParam:'24',signal});
  const request=calls.at(-1); const url=new URL('https://qa.invalid'+request.url);
  assert.equal(url.searchParams.get('scope'),'team');assert.equal(url.searchParams.get('search'),'editor');assert.equal(url.searchParams.get('cursor'),'24');assert.equal(url.searchParams.get('online'),'1');assert.equal(request.options.signal,signal);
  assert.deepEqual(result.data.editors.map(e=>e.id),['a','b']);
  assert.equal(queryOptions.getNextPageParam({mode:'agency',pageInfo:{nextCursor:'48'}}),'48');
  assert.equal(queryOptions.getNextPageParam({mode:'agency',pageInfo:{nextCursor:null}}),undefined);
});
