import assert from 'assert';
import { patchNoteType, patchNoteVersion, patchNoteSearchHay, patchNoteWriteFields } from '../assets/js/patch-note-type.js';

function testFallbackLegacyApp(){
  assert.strictEqual(patchNoteType({version:'1.6.2', title:'업데이트'}), 'app');
  assert.strictEqual(patchNoteVersion({version:'1.6.2', title:'업데이트'}), '1.6.2');
}

function testExplicitWebHidesVersion(){
  assert.strictEqual(patchNoteType({type:'web', version:'1.6.2', title:'자유게시판 MIDI 미리듣기 개선'}), 'web');
  assert.strictEqual(patchNoteVersion({type:'web', version:'1.6.2', title:'자유게시판 MIDI 미리듣기 개선'}), '');
}

function testExplicitApp(){
  assert.strictEqual(patchNoteType({type:'app', version:'1.6.3', title:'테스트 APP'}), 'app');
  assert.strictEqual(patchNoteVersion({type:'APP', version:'1.6.3'}), '1.6.3');
}

function testWebWithoutVersion(){
  assert.strictEqual(patchNoteType({type:'web', title:'테스트 WEB'}), 'web');
  assert.strictEqual(patchNoteVersion({type:'web', title:'테스트 WEB'}), '');
  assert.strictEqual(patchNoteType({title:'버전 없는 웹'}), 'web');
}

function testSearchHay(){
  const legacy = patchNoteSearchHay({version:'1.6.2', title:'업데이트'}).toLowerCase();
  assert.ok(legacy.includes('app'));
  assert.ok(legacy.includes('1.6.2'));
  const web = patchNoteSearchHay({type:'web', title:'자유게시판 MIDI 미리듣기 개선'}).toLowerCase();
  assert.ok(web.includes('web'));
  assert.ok(web.includes('미리듣기'));
  assert.ok(!web.includes('v1.6.2'));
}

function testWritePayload(){
  const app = patchNoteWriteFields({type:'app', version:'1.6.3', title:'테스트 APP'});
  assert.strictEqual(app.ok, true);
  assert.deepStrictEqual(app.fields, {type:'app', version:'1.6.3'});
  const web = patchNoteWriteFields({type:'web', version:'1.6.2', title:'테스트 WEB'});
  assert.strictEqual(web.ok, true);
  assert.deepStrictEqual(web.fields, {type:'web'});
  const webToApp = patchNoteWriteFields({type:'app', version:'', title:'x'});
  assert.strictEqual(webToApp.ok, false);
  assert.strictEqual(webToApp.error, 'version-required');
}

testFallbackLegacyApp();
testExplicitWebHidesVersion();
testExplicitApp();
testWebWithoutVersion();
testSearchHay();
testWritePayload();
console.log('ok patch-note-type');
