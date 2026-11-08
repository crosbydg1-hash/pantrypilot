"""Adds sound to the PantryPilot reels: an original upbeat music track, pop and whoosh effects on each scene,
and a voiceover read by the Mac's built-in voice. Everything is made here, so there is nothing copyrighted in it.

usage: python3 marketing/add_sound.py        (run make_reels.py first)
For each reel it writes two versions in marketing/reels/:
  <name>-voice.mp4   music + sound effects + voiceover
  <name>-music.mp4   music + sound effects only"""
import array, json, math, random, subprocess, wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
FRAMES, REELS = HERE / 'reel-frames', HERE / 'reels'
WORK = FRAMES / 'audio'; WORK.mkdir(exist_ok=True)
SR = 44100
VOICE, RATE = 'Samantha (English (US))', 185
random.seed(7)

# What the voice says, and which scene each line starts on (it waits if the line before is still talking).
LINES = {
    'reel-nothing-to-eat': [
        (0, "P O V: there's nothing to eat."),
        (1, "But you've got chicken, garlic, lemon, and honey."),
        (5, "PantryPilot found eight recipes you can make right now."),
        (6, "Honey garlic chicken."),
        (7, "Charred lemon chicken."),
        (8, "Or a lemon herb roast chicken."),
        (9, "PantryPilot. It's free. Link in bio!"),
    ],
    'reel-plan-the-week': [
        (0, "How to plan a whole week of dinners in thirty seconds."),
        (1, "Pick what you want each night."),
        (6, "One tap, and there's your shopping list."),
        (7, "And it skips what you already have."),
        (8, "PantryPilot. Plan the week, shop once. Link in bio!"),
    ],
    'reel-15-minute-dinners': [
        (0, "Three dinners you can make in fifteen minutes."),
        (1, "One. Cheesy chicken quesadillas."),
        (2, "Two. Shrimp tacos with a lime slaw."),
        (3, "Three. Pesto pasta with peas."),
        (4, "Find what you can make with what you have. PantryPilot, link in bio!"),
    ],
}

def starts_of(tl):
    out, t = [], 0.0
    for i, s in enumerate(tl['scenes']):
        out.append(t); t += s['seconds'] - (tl['fade'] if i < len(tl['scenes']) - 1 else 0)
    return out, t

# ---------- tiny synthesizer ----------
def note(n): return 440 * 2 ** ((n - 69) / 12)   # MIDI note number -> Hz

def add(buf, start, samples, gain=1.0):
    i0 = int(start * SR)
    for k, v in enumerate(samples):
        j = i0 + k
        if 0 <= j < len(buf): buf[j] += v * gain

def kick():
    n = int(.28 * SR)
    return [math.sin(2 * math.pi * (50 + 110 * math.exp(-k / SR * 28)) * k / SR) * math.exp(-k / SR * 9) for k in range(n)]

def noise_hit(length, decay, tone=0.0):
    n, prev, out = int(length * SR), 0.0, []
    for k in range(n):
        x = random.uniform(-1, 1); hp = x - prev; prev = x   # brighter noise
        out.append((hp * (1 - tone) + x * tone) * math.exp(-k / SR * decay))
    return out

def pluck(freq, length, bright=0.5):
    n = int(length * SR)
    return [(math.sin(2 * math.pi * freq * k / SR) + bright * 0.5 * math.sin(4 * math.pi * freq * k / SR)
             + bright * 0.25 * math.sin(6 * math.pi * freq * k / SR)) * math.exp(-k / SR * 6) * min(1, k / 80) for k in range(n)]

def bass(freq, length):
    n = int(length * SR)
    return [(math.sin(2 * math.pi * freq * k / SR) + 0.3 * math.sin(4 * math.pi * freq * k / SR)) * min(1, k / 200) * min(1, (n - k) / 400) for k in range(n)]

def music(total):
    """An original four-chord loop at 112 beats a minute: kick, claps, hi-hats, bass and plucked chords."""
    buf = [0.0] * int((total + 1) * SR)
    beat = 60 / 112
    chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]   # C, G, Am, F
    K, CLAP, HAT = kick(), noise_hit(.18, 22, .3), noise_hit(.05, 70)
    b = 0
    while b * beat < total:
        t = b * beat
        bar, pos = divmod(b, 4)
        ch = chords[bar % 4]
        add(buf, t, K, .55)
        if pos in (1, 3): add(buf, t, CLAP, .22)
        add(buf, t, HAT, .10); add(buf, t + beat / 2, HAT, .07)
        add(buf, t, bass(note(ch[0] - 24), beat * .45), .22); add(buf, t + beat / 2, bass(note(ch[0] - 24), beat * .4), .18)
        for i, nn in enumerate([ch[0], ch[1], ch[2], ch[1] + 12 if pos % 2 else ch[2]]):   # little arpeggio
            add(buf, t + i * beat / 4, pluck(note(nn), .35, .6), .07)
        b += 1
    fade = int(1.2 * SR); end = int(total * SR)
    for k in range(len(buf)):
        if k > end - fade: buf[k] *= max(0.0, (end - k) / fade)
    return buf[:end]

def pop():
    n = int(.09 * SR)
    return [math.sin(2 * math.pi * (900 - 500 * k / n) * k / SR) * math.exp(-k / SR * 40) for k in range(n)]

def whoosh():
    n, lp, out = int(.4 * SR), 0.0, []
    for k in range(n):
        a = 0.02 + 0.25 * (k / n)                 # filter opens up
        lp += a * (random.uniform(-1, 1) - lp)
        out.append(lp * math.sin(math.pi * k / n) * 2.2)
    return out

def ding():
    return [sum(math.sin(2 * math.pi * f * k / SR) * g for f, g in ((1318.5, 1), (1975.5, .5), (2637, .25))) * math.exp(-k / SR * 4) for k in range(int(1.2 * SR))]

def read_wav(path):
    with wave.open(str(path)) as w:
        data = array.array('h', w.readframes(w.getnframes()))
    return [v / 32768 for v in data]

def write_wav(path, buf):
    peak = max(1e-9, max(abs(v) for v in buf))
    g = min(1.0, 0.89 / peak)
    with wave.open(str(path), 'w') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(array.array('h', (int(max(-1, min(1, v * g)) * 32767) for v in buf)).tobytes())

def speak(text, i, name):
    aiff, wav = WORK / f'{name}-{i}.aiff', WORK / f'{name}-{i}.wav'
    subprocess.run(['say', '-v', VOICE, '-r', str(RATE), '-o', str(aiff), text], check=True)
    subprocess.run(['afconvert', '-f', 'WAVE', '-d', f'LEI16@{SR}', '-c', '1', str(aiff), str(wav)], check=True)
    return read_wav(wav)

def build(name):
    tl_path = FRAMES / f'{name}.json'
    tl = json.loads(tl_path.read_text())
    starts, total = starts_of(tl)

    # Voice first: each line gets the scenes from its starting scene up to the next line's scene,
    # and those scenes are stretched if the line needs longer, so the words always match the picture.
    import make_reels
    base = make_reels.REELS_ALL[name]()
    for sc, b in zip(tl['scenes'], base): sc['seconds'] = b[2]
    lines = LINES[name]
    voices = [speak(text, i, name) for i, (_, text) in enumerate(lines)]
    n_sc = len(tl['scenes'])
    for j, (first, _) in enumerate(lines):
        last = (lines[j + 1][0] if j + 1 < len(lines) else n_sc) - 1
        group = tl['scenes'][first:last + 1]
        span = sum(g['seconds'] for g in group) - tl['fade'] * (len(group) - (0 if last == n_sc - 1 else 0))
        need = len(voices[j]) / SR + (0.9 if last == n_sc - 1 else 0.3)
        if span < need:
            k = need / span
            for g in group: g['seconds'] = round(g['seconds'] * k, 3)
    tl_path.write_text(json.dumps(tl, indent=1))
    starts, total = starts_of(tl)
    clips = [(starts[first] + 0.1, voices[j]) for j, (first, _) in enumerate(lines)]
    video = REELS / f'{name}.mp4'
    subprocess.run(['swift', str(HERE / 'render_video.swift'), str(tl_path), str(video)], check=True, capture_output=True)

    fx = [0.0] * int(total * SR)
    for i, s in enumerate(tl['scenes']):
        e = s.get('effect')
        if i == len(tl['scenes']) - 1: add(fx, starts[i], ding(), .35)
        elif e in ('zoom', 'slide'): add(fx, max(0, starts[i] - .15), whoosh(), .35)
        else: add(fx, starts[i], pop(), .45)
    bed = music(total)
    voice = [0.0] * len(bed)
    for at, v in clips: add(voice, at, v, 1.0)

    # Turn the music down while the voice talks (smoothly), so the words are clear.
    env, level, out_voice, out_music = 0.0, [], [], []
    for k in range(len(bed)):
        target = 1.0 if abs(voice[k]) > 0.02 else 0.0
        env += (target - env) * (0.01 if target > env else 0.00012)
        level.append(env)
    mix_voice = [bed[k] * (1 - 0.6 * level[k]) * .8 + fx[k] * .8 + voice[k] * 1.0 for k in range(len(bed))]
    mix_music = [bed[k] * .9 + fx[k] * .8 for k in range(len(bed))]

    for tag, mix in (('voice', mix_voice), ('music', mix_music)):
        wav, m4a, out = WORK / f'{name}-{tag}.wav', WORK / f'{name}-{tag}.m4a', REELS / f'{name}-{tag}.mp4'
        write_wav(wav, mix)
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '192000', str(wav), str(m4a)], check=True)
        subprocess.run(['swift', str(HERE / 'mux.swift'), str(video), str(m4a), str(out)], check=True, capture_output=True)
        print('made', out.name, f'({total:.1f}s)')

if __name__ == '__main__':
    import sys
    for n in (sys.argv[1:] or LINES): build(n)
