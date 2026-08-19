import assert from 'assert';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseMidiPerformance, GM_SOUNDFONT_SLUGS, GM_DISPLAY_NAMES } from '../assets/js/board-midi-preview.js';

const here = dirname(fileURLToPath(import.meta.url));
const realMidi = 'C:/Users/최정환/Desktop/피이노 곡 편곡 추가 트럼펫 플루트 바이올린.mid';

function testRealArrangementMidi(){
  const buf = readFileSync(realMidi);
  const parsed = parseMidiPerformance(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const byProg = {};
  for(const n of parsed.notes){
    const key = n.drum ? 'drums' : n.program;
    byProg[key] = (byProg[key] || 0) + 1;
  }
  assert.ok(parsed.tracks.length >= 4, 'need 4 tracks');
  assert.ok(byProg[0] > 100, 'piano notes');
  assert.ok(byProg[56] > 100, 'trumpet notes');
  assert.ok(byProg[73] > 100, 'flute notes');
  assert.ok(byProg[40] > 100, 'violin notes');
  assert.strictEqual(GM_SOUNDFONT_SLUGS[0], 'acoustic_grand_piano');
  assert.strictEqual(GM_SOUNDFONT_SLUGS[56], 'trumpet');
  assert.strictEqual(GM_SOUNDFONT_SLUGS[73], 'flute');
  assert.strictEqual(GM_SOUNDFONT_SLUGS[40], 'violin');
  const chans = [...new Set(parsed.notes.map((n)=>n.channel))].sort();
  assert.deepStrictEqual(chans, [0,1,2,3]);
  const midProgChanges = parsed.programTimeline.some((tl)=> tl.filter((x)=>x.time>0.05).length > 0);
  assert.strictEqual(midProgChanges, false);
  console.log('ok real arrangement midi', {
    duration: Number(parsed.duration.toFixed(2)),
    notes: parsed.notes.length,
    byProg,
    tracks: parsed.tracks.map((t)=>({
      i: t.index,
      ch: t.channels.map((c)=>c+1),
      prog: t.programs,
      inst: t.programs.map((p)=>p==='drums'?'drums':GM_DISPLAY_NAMES[p]),
      n: t.noteCount
    }))
  });
}

function testProgramChangeFixture(){
  const buf = readFileSync(join(here, 'midi-fixtures', 'program-change.mid'));
  const parsed = parseMidiPerformance(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const programs = [...new Set(parsed.notes.map((n)=>n.program))];
  assert.ok(programs.includes(0) && programs.includes(40), 'same channel piano then violin');
  const first = parsed.notes[0];
  const last = parsed.notes[parsed.notes.length-1];
  assert.strictEqual(first.channel, last.channel);
  assert.notStrictEqual(first.program, last.program);
  console.log('ok program-change fixture', { programs, first: first.program, last: last.program, notes: parsed.notes.length });
}

function testDrumFixture(){
  const buf = readFileSync(join(here, 'midi-fixtures', 'drums-ch10.mid'));
  const parsed = parseMidiPerformance(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.ok(parsed.hasDrums);
  assert.ok(parsed.notes.every((n)=> n.channel === 9 && n.drum));
  console.log('ok drums ch10 fixture', { notes: parsed.notes.length, midiNotes: [...new Set(parsed.notes.map((n)=>n.midi))] });
}

function testSimultaneousFixture(){
  const buf = readFileSync(join(here, 'midi-fixtures', 'simultaneous-4.mid'));
  const parsed = parseMidiPerformance(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const atZero = parsed.notes.filter((n)=> n.time <= 0.2);
  const progs = [...new Set(atZero.map((n)=>n.program))].sort((a,b)=>a-b);
  assert.deepStrictEqual(progs, [0,40,56,73]);
  console.log('ok simultaneous 4 fixture', { atZero: atZero.length, progs });
}

testRealArrangementMidi();
testProgramChangeFixture();
testDrumFixture();
testSimultaneousFixture();
console.log('board midi preview parser tests passed');
