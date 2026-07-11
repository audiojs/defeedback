# @audio/defeedback-analyzer [![npm](https://img.shields.io/npm/v/@audio/defeedback-analyzer)](https://www.npmjs.com/package/@audio/defeedback-analyzer) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Feedback candidate detection — spectral peaks scored by PNPR/PHPR howl criteria (van Waterschoot & Moonen 2011)

```
npm install @audio/defeedback-analyzer
```

```js
import analyze from '@audio/defeedback-analyzer'
```

Windows one analysis frame, FFTs it, and picks spectral peaks scored by two classical howl criteria: **PNPR** (peak-to-neighboring-power ratio — feedback is far narrower than any musical content) and **PHPR** (peak-to-harmonic-power ratio — a bare howl carries no 2nd/3rd harmonic, a musical tone does). Peak frequencies are parabolically refined in the dB domain (~0.1% accuracy). A relational harmonic gate then drops any peak that sits within 1% of an integer multiple of a stronger lower peak — a musical overtone, not a second howl.

```js
let candidates = analyze(frame, { fs: 48000 })
// [{ freq, level (dB), pnpr, phpr, kc }, ...] — sorted by level, strongest first
// kc: fractional FFT bin index of the peak
```

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Hz |
| `maxCandidates` | `6` | max peaks returned |
| `floor` | `-70` | dB, ignore peaks below this level |

`data` is one power-of-2 analysis window (Hann-windowed internally); bins below 100 Hz are ignored (rumble). Feed candidates into [`@audio/defeedback-tracker`](https://github.com/audiojs/defeedback-tracker) for persistence gating before deploying a notch.

**Use when:** building a custom AFS pipeline stage-by-stage.<br>
**Not for:** end-to-end suppression — use the `@audio/defeedback` umbrella factory.

---

Part of [@audio/defeedback](https://github.com/audiojs/defeedback) — the defeedback family umbrella.

MIT © [audiojs](https://github.com/audiojs)
