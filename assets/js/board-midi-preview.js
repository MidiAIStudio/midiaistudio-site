/**
 * Board MIDI preview: Channel + Program Change → GM soundfont (lazy).
 * Track/file names are never used to guess instruments.
 */

export const GM_SOUNDFONT_SLUGS = [
  'acoustic_grand_piano','bright_acoustic_piano','electric_grand_piano','honkytonk_piano',
  'electric_piano_1','electric_piano_2','harpsichord','clavinet','celesta','glockenspiel',
  'music_box','vibraphone','marimba','xylophone','tubular_bells','dulcimer','drawbar_organ',
  'percussive_organ','rock_organ','church_organ','reed_organ','accordion','harmonica',
  'tango_accordion','acoustic_guitar_nylon','acoustic_guitar_steel','electric_guitar_jazz',
  'electric_guitar_clean','electric_guitar_muted','overdriven_guitar','distortion_guitar',
  'guitar_harmonics','acoustic_bass','electric_bass_finger','electric_bass_pick','fretless_bass',
  'slap_bass_1','slap_bass_2','synth_bass_1','synth_bass_2','violin','viola','cello','contrabass',
  'tremolo_strings','pizzicato_strings','orchestral_harp','timpani','string_ensemble_1',
  'string_ensemble_2','synth_strings_1','synth_strings_2','choir_aahs','voice_oohs','synth_choir',
  'orchestra_hit','trumpet','trombone','tuba','muted_trumpet','french_horn','brass_section',
  'synth_brass_1','synth_brass_2','soprano_sax','alto_sax','tenor_sax','baritone_sax','oboe',
  'english_horn','bassoon','clarinet','piccolo','flute','recorder','pan_flute','blown_bottle',
  'shakuhachi','whistle','ocarina','lead_1_square','lead_2_sawtooth','lead_3_calliope',
  'lead_4_chiff','lead_5_charang','lead_6_voice','lead_7_fifths','lead_8_bass__lead',
  'pad_1_new_age','pad_2_warm','pad_3_polysynth','pad_4_choir','pad_5_bowed','pad_6_metallic',
  'pad_7_halo','pad_8_sweep','fx_1_rain','fx_2_soundtrack','fx_3_crystal','fx_4_atmosphere',
  'fx_5_brightness','fx_6_goblins','fx_7_echoes','fx_8_scifi','sitar','banjo','shamisen','koto',
  'kalimba','bagpipe','fiddle','shanai','tinkle_bell','agogo','steel_drums','woodblock',
  'taiko_drum','melodic_tom','synth_drum','reverse_cymbal','guitar_fret_noise','breath_noise',
  'seashore','bird_tweet','telephone_ring','helicopter','applause','gunshot'
];

export const GM_DISPLAY_NAMES = GM_SOUNDFONT_SLUGS.map((s)=>s.replace(/_/g, ' '));

const SF_BASES = [
  'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/FluidR3_GM/',
  'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/'
];
const SF_NOTES = ['C2','G2','C3','G3','C4','G4','C5','G5','C6'];
const DRUM_CHANNEL = 9; // GM channel 10, 0-based
const gmSampleCache = new Map();

function midiToNoteName(m){
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const n = ((m % 12) + 12) % 12;
  return names[n] + (Math.floor(m / 12) - 1);
}

function readVLQ(bytes, pos){
  let v = 0;
  for(let i=0;i<4;i++){
    if(pos.i >= bytes.length) throw new Error('MIDI VLQ overflow');
    const b = bytes[pos.i++];
    v = (v << 7) | (b & 0x7f);
    if((b & 0x80) === 0) break;
  }
  return v;
}

function parseSmfTracks(arrayBuffer){
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let i = 0;
  const str = (n)=>{
    const s = String.fromCharCode(...bytes.subarray(i, i+n));
    i += n;
    return s;
  };
  if(str(4) !== 'MThd') throw new Error('Invalid MIDI header');
  const hdrLen = view.getUint32(i); i += 4;
  const format = view.getUint16(i); i += 2;
  const ntrks = view.getUint16(i); i += 2;
  const division = view.getUint16(i); i += 2;
  i += Math.max(0, hdrLen - 6);
  const ticksPerBeat = (division & 0x8000) ? 480 : division;
  const pos = { i };
  const tracks = [];
  for(let t=0; t<ntrks; t++){
    if(i + 8 > bytes.length) break;
    pos.i = i;
    if(str(4) !== 'MTrk') break;
    const len = view.getUint32(i); i += 4;
    const end = i + len;
    pos.i = i;
    const events = [];
    let tick = 0;
    let running = 0;
    let trackName = '';
    while(pos.i < end){
      tick += readVLQ(bytes, pos);
      if(pos.i >= end) break;
      let status = bytes[pos.i];
      if(status < 0x80){
        status = running;
      }else{
        pos.i++;
        running = status;
      }
      if(status === 0xff){
        const meta = bytes[pos.i++];
        const ml = readVLQ(bytes, pos);
        if(meta === 0x51 && ml === 3){
          const tempo = (bytes[pos.i]<<16) | (bytes[pos.i+1]<<8) | bytes[pos.i+2];
          events.push({ tick, type:'tempo', tempo });
        }else if(meta === 0x03){
          trackName = Array.from(bytes.subarray(pos.i, pos.i+ml)).map((c)=>String.fromCharCode(c)).join('');
        }
        pos.i += ml;
        continue;
      }
      if(status === 0xf0 || status === 0xf7){
        const sl = readVLQ(bytes, pos);
        pos.i += sl;
        continue;
      }
      const cmd = status & 0xf0;
      const channel = status & 0x0f;
      if(cmd === 0xc0 || cmd === 0xd0){
        const a = bytes[pos.i++];
        if(cmd === 0xc0) events.push({ tick, type:'program', channel, program: a & 0x7f });
        continue;
      }
      const a = bytes[pos.i++];
      const b = bytes[pos.i++];
      if(cmd === 0x90){
        events.push({ tick, type: b ? 'noteOn' : 'noteOff', channel, midi: a, velocity: b / 127 });
      }else if(cmd === 0x80){
        events.push({ tick, type:'noteOff', channel, midi: a, velocity: b / 127 });
      }
    }
    i = end;
    tracks.push({ name: trackName, events });
  }
  return { format, ticksPerBeat, tracks };
}

function eventsToSeconds(tracks, ticksPerBeat){
  const merged = [];
  tracks.forEach((tr, trackIndex)=>{
    tr.events.forEach((ev)=> merged.push({ ...ev, trackIndex }));
  });
  merged.sort((a,b)=> a.tick - b.tick || (a.type === 'tempo' || a.type === 'program' ? -1 : 1));
  let tempo = 500000;
  let lastTick = 0;
  let seconds = 0;
  const out = [];
  for(const ev of merged){
    seconds += (ev.tick - lastTick) * (tempo / ticksPerBeat) / 1e6;
    lastTick = ev.tick;
    if(ev.type === 'tempo'){
      tempo = ev.tempo || tempo;
      continue;
    }
    out.push({ ...ev, time: seconds });
  }
  return out;
}

function pairNotes(timedEvents){
  const active = new Map();
  const notes = [];
  const programs = Array(16).fill(0);
  const programTimeline = Array.from({ length: 16 }, ()=>[{ time: 0, program: 0 }]);
  for(const ev of timedEvents){
    if(ev.type === 'program'){
      programs[ev.channel] = ev.program;
      programTimeline[ev.channel].push({ time: ev.time, program: ev.program });
      continue;
    }
    const key = ev.channel + ':' + ev.midi;
    if(ev.type === 'noteOn'){
      if(!active.has(key)) active.set(key, []);
      active.get(key).push({ time: ev.time, velocity: ev.velocity, channel: ev.channel, midi: ev.midi, trackIndex: ev.trackIndex });
    }else if(ev.type === 'noteOff'){
      const stack = active.get(key);
      if(!stack || !stack.length) continue;
      const on = stack.shift();
      const program = programAt(programTimeline[on.channel], on.time);
      const drum = on.channel === DRUM_CHANNEL;
      notes.push({
        time: on.time,
        duration: Math.max(0.04, ev.time - on.time),
        midi: on.midi,
        name: midiToNoteName(on.midi),
        velocity: on.velocity,
        channel: on.channel,
        program: drum ? 0 : program,
        drum,
        trackIndex: on.trackIndex
      });
    }
  }
  for(const stack of active.values()){
    for(const on of stack){
      const program = programAt(programTimeline[on.channel], on.time);
      const drum = on.channel === DRUM_CHANNEL;
      notes.push({
        time: on.time,
        duration: 0.4,
        midi: on.midi,
        name: midiToNoteName(on.midi),
        velocity: on.velocity,
        channel: on.channel,
        program: drum ? 0 : program,
        drum,
        trackIndex: on.trackIndex
      });
    }
  }
  notes.sort((a,b)=> a.time - b.time);
  return { notes, programTimeline };
}

function programAt(timeline, time){
  let p = 0;
  for(const ev of timeline){
    if(ev.time <= time + 1e-6) p = ev.program;
    else break;
  }
  return p;
}

export function parseMidiPerformance(arrayBuffer){
  const smf = parseSmfTracks(arrayBuffer);
  const timed = eventsToSeconds(smf.tracks, smf.ticksPerBeat);
  const { notes, programTimeline } = pairNotes(timed);
  const duration = notes.reduce((m,n)=> Math.max(m, n.time + n.duration), 0);
  const programs = [...new Set(notes.filter((n)=>!n.drum).map((n)=>n.program))].sort((a,b)=>a-b);
  const hasDrums = notes.some((n)=>n.drum);
  const tracks = smf.tracks.map((tr, idx)=>{
    const trackNotes = notes.filter((n)=> n.trackIndex === idx);
    const chans = [...new Set(trackNotes.map((n)=>n.channel))];
    const progs = [...new Set(trackNotes.map((n)=> n.drum ? 'drums' : n.program))];
    return {
      index: idx,
      name: tr.name || '',
      channels: chans,
      programs: progs,
      noteCount: trackNotes.length,
      firstNote: trackNotes[0] || null,
      lastNote: trackNotes.length ? trackNotes[trackNotes.length-1] : null
    };
  });
  return { duration, notes, programs, hasDrums, tracks, programTimeline, ticksPerBeat: smf.ticksPerBeat };
}

function gmFamilyPreset(program){
  const fam = Math.floor((program || 0) / 8);
  if(fam === 0) return { oscillator:{ type:'triangle' }, envelope:{ attack:0.004, decay:0.28, sustain:0.18, release:0.35 } };
  if(fam === 5) return { oscillator:{ type:'sawtooth' }, envelope:{ attack:0.14, decay:0.2, sustain:0.72, release:0.55 } };
  if(fam === 7) return { oscillator:{ type:'sawtooth' }, envelope:{ attack:0.05, decay:0.12, sustain:0.62, release:0.22 } };
  if(fam === 9) return { oscillator:{ type:'sine' }, envelope:{ attack:0.09, decay:0.12, sustain:0.45, release:0.18 } };
  if(fam === 4) return { oscillator:{ type:'triangle' }, envelope:{ attack:0.01, decay:0.2, sustain:0.7, release:0.2 } };
  return { oscillator:{ type:'square' }, envelope:{ attack:0.03, decay:0.12, sustain:0.4, release:0.28 } };
}

async function fetchSample(program, note){
  const slug = GM_SOUNDFONT_SLUGS[program] || GM_SOUNDFONT_SLUGS[0];
  let lastErr = null;
  for(const base of SF_BASES){
    const url = `${base}${slug}-mp3/${encodeURIComponent(note)}.mp3`;
    try{
      const res = await fetch(url, { mode:'cors', credentials:'omit' });
      if(!res.ok) throw new Error(String(res.status));
      return await res.arrayBuffer();
    }catch(err){
      lastErr = err;
    }
  }
  throw lastErr || new Error('sample fetch failed');
}

async function decodeAudio(arrayBuffer){
  const Tone = window.Tone;
  const ctx = Tone?.getContext?.()?.rawContext || new (window.AudioContext || window.webkitAudioContext)();
  return await ctx.decodeAudioData(arrayBuffer.slice(0));
}

export async function loadGmProgramSamples(program, onStatus){
  const key = String(program);
  if(gmSampleCache.has(key)) return gmSampleCache.get(key);
  const pending = (async ()=>{
    const urls = {};
    let loaded = 0;
    await Promise.all(SF_NOTES.map(async (note)=>{
      try{
        const raw = await fetchSample(program, note);
        urls[note] = await decodeAudio(raw);
        loaded += 1;
      }catch(_){}
    }));
    if(loaded < 3){
      console.warn('unsupported GM program', program, GM_SOUNDFONT_SLUGS[program] || '', '→ fallback synth');
      return null;
    }
    return urls;
  })();
  gmSampleCache.set(key, pending);
  try{
    const result = await pending;
    if(onStatus) onStatus(`악기 음원 준비 중… (${GM_DISPLAY_NAMES[program] || program})`);
    return result;
  }catch(err){
    gmSampleCache.delete(key);
    throw err;
  }
}

function scheduleDrums(Tone, notes, maxSec, dest){
  const out = dest || undefined;
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.05, octaves: 5,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.08 }
  });
  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.04 }
  });
  const hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.02 }
  });
  hat.volume.value = -8;
  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.04, octaves: 3,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.06 }
  });
  [kick, snare, hat, tom].forEach((n)=> out ? n.connect(out) : n.toDestination());
  notes.forEach((note)=>{
    if(!note.drum || note.time >= maxSec) return;
    const vel = Math.max(0.15, Math.min(1, note.velocity));
    const t = note.time;
    const n = note.midi;
    try{
      if(n === 35 || n === 36){
        kick.triggerAttackRelease('C1', 0.22, t, vel);
      }else if(n === 38 || n === 40){
        snare.triggerAttackRelease(0.14, t, vel);
      }else if(n === 42 || n === 44 || n === 46){
        hat.triggerAttackRelease(0.05, t, vel * 0.7);
      }else if(n === 49 || n === 51 || n === 57 || n === 59){
        snare.triggerAttackRelease(0.35, t, vel * 0.55);
      }else{
        tom.triggerAttackRelease('C2', 0.12, t, vel * 0.8);
      }
    }catch(_){}
  });
}

export async function renderMidiPreviewWav(arrayBuffer, maxSec=40, opts={}){
  const Tone = window.Tone;
  if(!Tone?.Offline) throw new Error('미리듣기 엔진 없음');
  const parsed = parseMidiPerformance(arrayBuffer);
  const dur = Math.min(Math.max(Number(parsed.duration) || 1, 0.5), maxSec);
  const windowNotes = parsed.notes.filter((n)=> n.time < maxSec);
  const programs = [...new Set(windowNotes.filter((n)=>!n.drum).map((n)=>n.program))];
  const sampleMap = new Map();
  if(opts.onStatus) opts.onStatus('악기 음원 준비 중…');
  await Promise.all(programs.map(async (program)=>{
    try{
      const buffers = await loadGmProgramSamples(program, opts.onStatus);
      if(buffers) sampleMap.set(program, buffers);
    }catch(_){
      console.warn('unsupported GM program', program, '→ fallback synth');
    }
  }));
  if(opts.onStatus) opts.onStatus(`MIDI → 오디오 미리듣기 변환 중 (첫 ${maxSec}초)…`);
  const rendered = await Tone.Offline(() => {
    const master = new Tone.Limiter(-1.5).toDestination();
    programs.forEach((program)=>{
      const buffers = sampleMap.get(program);
      if(buffers){
        const sampler = new Tone.Sampler({ urls: buffers, attack: 0.005, release: 0.35 });
        sampler.volume.value = -8;
        sampler.connect(master);
        windowNotes.forEach((note)=>{
          if(note.drum || note.program !== program || note.time >= maxSec) return;
          const len = Math.min(Math.max(0.04, note.duration), Math.max(0.04, maxSec - note.time));
          try{ sampler.triggerAttackRelease(note.name, len, note.time, Math.max(0.12, Math.min(1, note.velocity))); }catch(_){}
        });
      }else{
        const synth = new Tone.PolySynth(Tone.Synth, gmFamilyPreset(program));
        synth.maxPolyphony = 48;
        synth.volume.value = -10;
        synth.connect(master);
        windowNotes.forEach((note)=>{
          if(note.drum || note.program !== program || note.time >= maxSec) return;
          const len = Math.min(Math.max(0.04, note.duration), Math.max(0.04, maxSec - note.time));
          try{ synth.triggerAttackRelease(note.name, len, note.time, Math.max(0.12, Math.min(1, note.velocity))); }catch(_){}
        });
      }
    });
    if(parsed.hasDrums){
      scheduleDrums(Tone, windowNotes, maxSec, master);
    }
  }, dur);
  const audioBuffer = typeof rendered?.get === 'function' ? rendered.get() : rendered;
  if(!audioBuffer || !audioBuffer.getChannelData) throw new Error('미리듣기 변환 실패');
  return { audioBuffer, parsed, loadedPrograms: [...sampleMap.keys()], fallbackPrograms: programs.filter((p)=>!sampleMap.has(p)) };
}

export function summarizePerformance(parsed){
  return (parsed.tracks || []).map((tr)=>({
    track: tr.index,
    name: tr.name,
    channels: tr.channels.map((c)=>c+1),
    programs: tr.programs,
    instruments: tr.programs.map((p)=> p === 'drums' ? 'Drum Kit' : (GM_DISPLAY_NAMES[p] || p)),
    noteCount: tr.noteCount
  }));
}
