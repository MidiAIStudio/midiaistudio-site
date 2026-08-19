# -*- coding: utf-8 -*-
from pathlib import Path
from mido import Message, MetaMessage, MidiFile, MidiTrack, bpm2tempo, second2tick

out = Path(__file__).resolve().parent / "midi-fixtures"
out.mkdir(parents=True, exist_ok=True)
TPB = 480
tempo = bpm2tempo(120)

def ticks(sec):
    return int(second2tick(sec, TPB, tempo))

def write_type1(path, tracks):
    mid = MidiFile(type=1, ticks_per_beat=TPB)
    meta = MidiTrack()
    meta.append(MetaMessage("set_tempo", tempo=tempo, time=0))
    mid.tracks.append(meta)
    for tr in tracks:
        mid.tracks.append(tr)
    mid.save(path)

# Program change on one channel: piano then violin
pc = MidiTrack()
pc.append(Message("program_change", channel=0, program=0, time=0))
pc.append(Message("note_on", channel=0, note=60, velocity=100, time=ticks(0.1)))
pc.append(Message("note_off", channel=0, note=60, velocity=0, time=ticks(0.4)))
pc.append(Message("program_change", channel=0, program=40, time=ticks(0.2)))
pc.append(Message("note_on", channel=0, note=67, velocity=100, time=ticks(0.1)))
pc.append(Message("note_off", channel=0, note=67, velocity=0, time=ticks(0.5)))
write_type1(out / "program-change.mid", [pc])

# Channel 10 drums (channel=9)
drums = MidiTrack()
drums.append(Message("program_change", channel=9, program=0, time=0))
t = 0
for note in (36, 38, 42, 46):
    drums.append(Message("note_on", channel=9, note=note, velocity=110, time=ticks(0.2 if t else 0.1)))
    drums.append(Message("note_off", channel=9, note=note, velocity=0, time=ticks(0.15)))
    t += 1
write_type1(out / "drums-ch10.mid", [drums])

# Simultaneous 4 instruments
parts = [
    (0, 0, 60),   # piano C4 ch1
    (1, 40, 64),  # violin E4 ch2
    (2, 73, 67),  # flute G4 ch3
    (3, 56, 72),  # trumpet C5 ch4
]
tracks = []
for ch, prog, note in parts:
    tr = MidiTrack()
    tr.append(Message("program_change", channel=ch, program=prog, time=0))
    tr.append(Message("note_on", channel=ch, note=note, velocity=100, time=ticks(0.05)))
    tr.append(Message("note_off", channel=ch, note=note, velocity=0, time=ticks(1.0)))
    tracks.append(tr)
write_type1(out / "simultaneous-4.mid", tracks)

# Single piano
piano = MidiTrack()
piano.append(Message("program_change", channel=0, program=0, time=0))
piano.append(Message("note_on", channel=0, note=60, velocity=100, time=ticks(0.1)))
piano.append(Message("note_on", channel=0, note=64, velocity=90, time=0))
piano.append(Message("note_on", channel=0, note=67, velocity=90, time=0))
piano.append(Message("note_off", channel=0, note=60, velocity=0, time=ticks(0.8)))
piano.append(Message("note_off", channel=0, note=64, velocity=0, time=0))
piano.append(Message("note_off", channel=0, note=67, velocity=0, time=0))
write_type1(out / "single-piano.mid", [piano])
print("wrote", out)
