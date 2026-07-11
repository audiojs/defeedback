# @audio/defeedback-tracker [![npm](https://img.shields.io/npm/v/@audio/defeedback-tracker)](https://www.npmjs.com/package/@audio/defeedback-tracker) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Howl trajectory tracking — persistence + stability + narrowness gating; the music discriminator

```
npm install @audio/defeedback-tracker
```

```js
import tracker from '@audio/defeedback-tracker'
```

Stateful factory that turns per-frame [`@audio/defeedback-analyzer`](https://github.com/audiojs/defeedback-analyzer) candidates into confirmed howls. A candidate must clear the `pnpr`/`phpr` narrowness gates, persist at a stable frequency (within `freqTol`) for `minFrames` consecutive updates, and not be decaying (`trend >= growth`) before it's reported — this is what keeps sustained musical tones from being mistaken for feedback.

```js
let t = tracker({ minFrames: 3, pnpr: 18, phpr: 15 })

let howls = t.update(candidates)   // candidates from defeedback-analyzer, one call per hop
// → [{ freq, level }, ...] confirmed, growing or stable howls

t.reset()                            // clear all tracked trajectories
```

| Param | Default | |
|---|---|---|
| `minFrames` | `3` | consecutive confirming frames before a track reports |
| `pnpr` | `18` | dB, min peak-to-neighbor-power ratio to admit a candidate |
| `phpr` | `15` | dB, min peak-to-harmonic-power ratio to admit a candidate |
| `freqTol` | `0.02` | relative frequency tolerance for matching a candidate to an existing track |
| `growth` | `-3` | dB/frame, minimum trend to keep reporting (rejects decaying tones) |

Returns `{ update(candidates): Array<{freq, level}>, reset(): void }`. A track is dropped after being unseen for more than 2 updates.

**Use when:** deciding *when* to deploy a notch — feed confirmed howls to [`@audio/defeedback-notchbank`](https://github.com/audiojs/defeedback-notchbank)`.deploy(freq)`.<br>
**Not for:** spectral peak detection itself — use `defeedback-analyzer`.

---

Part of [@audio/defeedback](https://github.com/audiojs/defeedback) — the defeedback family umbrella.

MIT © [audiojs](https://github.com/audiojs)
