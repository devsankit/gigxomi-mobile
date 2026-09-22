const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const source = file => readFileSync(path.join(__dirname, '..', file), 'utf8');
const code = ts.transpileModule(source('src/lib/learning-destination.ts'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const box = {exports:{}};
new Function('module','exports',code)(box,box.exports);
const {learningDestination} = box.exports;
const course = {id:'course-b',completionPercent:40,chapters:[{id:'chapter-b',lessons:[{id:'done',progress:{status:'COMPLETED'}},{id:'next',progress:{status:'IN_PROGRESS'}}]}]};
test('course cards never resume a different course', () => {
  assert.deepEqual(learningDestination(course,{playlistId:'course-a',chapterId:'chapter-a',lessonId:'other'}),{playlistId:'course-b',chapterId:'chapter-b',lessonId:'next'});
});
test('valid saved lesson is resumed; stale targets fall back within that course', () => {
  const target = {playlistId:'course-b',chapterId:'chapter-b',lessonId:'next'};
  assert.deepEqual(learningDestination(course,target),target);
  assert.deepEqual(learningDestination(course,{...target,lessonId:'removed'}),target);
});
test('complete and empty courses open their own report or chapters', () => {
  assert.deepEqual(learningDestination({...course,completionPercent:100}),{playlistId:'course-b'});
  assert.deepEqual(learningDestination({...course,chapters:[]}),{playlistId:'course-b'});
});
test('Team renders shared Learning in place; dashboard has no fabricated trends or startup tutorial', () => {
  for (const file of ['src/components/team/AgencyTeamScreen.tsx','app/(tabs)/team.tsx']) {
    assert.match(source(file), /return <LearningView header=/);
    assert.doesNotMatch(source(file), /router.push\('\/learning'\)/);
  }
  assert.doesNotMatch(source('app/(tabs)/dashboard.tsx'), /buildSignalSeries|SparkBars|FirstRunCoachmarks|Karma Score/);
  assert.match(source('app/(tabs)/dashboard.tsx'), /onOpen\(learningDestination\(playlist, target\)\)/);
});
