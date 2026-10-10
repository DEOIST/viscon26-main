"""Builds level 3's chart from its music track: frontend/level3/trackChart.ts.

Dev-only and run by hand after the track changes; it needs librosa, which is not in
requirements*.txt (pip install librosa soundfile in a scratch venv):

    python tools/thesis_chart.py ../frontend/level3/assets/music/thesis-defense.ogg \
        ../frontend/level3/trackChart.ts

It fits the track's beat grid, measures onset strength and the dominant pitch at every
sixteenth, then keeps the strongest onsets of each bar up to a per-phase budget: the opening
is sparse, the meltdown is the peak and the final defense never outruns it. Higher pitches go
to lanes further right, like a keyboard. Chords land on the strongest downbeats from the
cross-examination on, and the defense ends on the four-key QED chord.
"""

import sys

import librosa
import numpy as np

HOP = 256
SR = 22050
# Bars (from the first strong downbeat) where each phase begins: the track's own breaks.
PHASES = (("opening", None), ("cross", 7), ("meltdown", 16), ("final", 23))
LAST_BAR = 28  # the final defense's last bar; the QED chord lands on its last strong hit
BUDGET = {"opening": 4, "cross": 6, "meltdown": 7, "final": 7}  # notes per bar, chords count
ALLOW_SIXTEENTHS = {"opening": False, "cross": True, "meltdown": False, "final": True}
CHORDS = {"opening": False, "cross": False, "meltdown": True, "final": True}
GOLD_EVERY = 2  # a golden downbeat every other bar (from the cross-examination on)


def analyse(path: str):
    y, sr = librosa.load(path, sr=SR, mono=True)
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    _, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=HOP, units="time")
    k = np.arange(len(beats))
    period, offset = np.linalg.lstsq(np.vstack([k, np.ones_like(k)]).T, beats, rcond=None)[0]
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP)
    tonic = int(np.argmax(chroma.mean(axis=1)))
    frames = env.shape[0]

    def frame(t: float) -> int:
        return min(frames - 1, max(0, int(round(t * sr / HOP))))

    def strength(t: float) -> float:
        return max(env[frame(t + d)] for d in (-0.02, 0.0, 0.02))

    def pitch(t: float) -> int:
        f = frame(t)
        return int((np.argmax(chroma[:, f : f + 4].mean(axis=1)) - tonic) % 12)

    return period, offset, strength, pitch, len(y) / sr


def phase_of(bar: int) -> str:
    current = PHASES[0][0]
    for name, start in PHASES[1:]:
        if bar >= start:
            current = name
    return current


def build(path: str):
    period, offset, strength, pitch, duration = analyse(path)
    six = period / 4
    notes: list[tuple[int, int, bool]] = []  # (time ms, lane, gold)
    last_lane_time = [-1e9] * 4
    starts = [s for _, s in PHASES[1:]]

    for bar in range(0, LAST_BAR + 1):
        phase = phase_of(bar)
        if bar in starts:
            continue  # each phase opens on the track's break bar, empty for its banner
        candidates = []
        for step in range(16):
            if step % 2 and not ALLOW_SIXTEENTHS[phase]:
                continue
            t = offset + (bar * 16 + step) * six
            # Downbeats and backbeats win ties, so the chart reads on the beat.
            weight = strength(t) * (1.25 if step % 4 == 0 else 1.0)
            candidates.append((weight, step, t))
        keep = sorted(sorted(candidates, reverse=True)[: BUDGET[phase]], key=lambda c: c[1])
        steps = [c[1] for c in keep]
        run = 1
        chosen = []
        for i, (_, step, t) in enumerate(keep):
            # At most four sixteenths in a row.
            run = run + 1 if i and step - steps[i - 1] == 1 else 1
            if run > 4:
                continue
            chosen.append((step, t))
        budget = BUDGET[phase]
        for step, t in chosen:
            if budget <= 0:
                break
            is_last = bar == LAST_BAR and step == chosen[-1][0]
            lane = min(3, pitch(t) * 4 // 12)
            # Never repeat a lane faster than an eighth: slide to the nearest free lane.
            for shift in (0, 1, -1, 2, -2, 3, -3):
                candidate = lane + shift
                if 0 <= candidate < 4 and t - last_lane_time[candidate] >= period / 2 - 0.002:
                    lane = candidate
                    break
            else:
                continue
            gold = bar >= 7 and step == 0 and bar % GOLD_EVERY == 0
            ms = int(round(t * 1000))
            if is_last:
                lanes = [0, 1, 2, 3]
                gold = True
            elif CHORDS[phase] and step == 0 and budget >= 2:
                partner = (lane + 2) % 4
                lanes = [lane]
                if t - last_lane_time[partner] >= period / 2 - 0.002:
                    lanes.append(partner)
            else:
                lanes = [lane]
            for chord_lane in sorted(lanes):
                notes.append((ms, chord_lane, gold))
                last_lane_time[chord_lane] = t
            budget -= len(lanes)
            if is_last:
                break

    # The defense ends on the QED chord: all four keys, golden, on the last bar's last note.
    last_bar_start = int(round((offset + LAST_BAR * 16 * six) * 1000))
    final = max(t for t, _, _ in notes if t >= last_bar_start)
    eighth = int(period * 500)
    notes = [n for n in notes if not (n[0] == final or final - eighth < n[0] < final)] + [
        (final, lane, True) for lane in range(4)
    ]
    notes.sort()

    phase_times = [0] + [int(round((offset + s * 16 * six) * 1000)) for s in starts]
    end = int(round((offset + (LAST_BAR + 1) * 16 * six) * 1000)) + 1200
    return period, offset, duration, phase_times, end, notes


def write(out: str, period, offset, duration, phase_times, end, notes):
    lines = ",\n".join(f"        [{t}, {lane}, {str(gold).lower()}]" for t, lane, gold in notes)
    names = [name for name, _ in PHASES]
    pairs = zip(names, phase_times, strict=True)
    phases = ",\n".join(f'        {{ phase: "{name}", time: {t} }}' for name, t in pairs)
    body = f"""// Generated by backend/tools/thesis_chart.py from assets/music/thesis-defense.ogg.
// Do not edit by hand: rerun the script when the track changes. Times are ms of track time.

import type {{ TrackChart }} from "./chart";

export const TRACK_CHART: TrackChart = {{
    beatMs: {period * 1000:.3f},
    firstBeatMs: {offset * 1000:.1f},
    durationMs: {int(duration * 1000)},
    end: {end},
    phases: [
{phases},
    ],
    notes: [
{lines},
    ],
}};
"""
    with open(out, "w", encoding="utf-8") as handle:
        handle.write(body)


if __name__ == "__main__":
    write(sys.argv[2], *build(sys.argv[1]))
