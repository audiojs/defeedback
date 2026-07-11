# @audio/defeedback-notchbank [![npm](https://img.shields.io/npm/v/@audio/defeedback-notchbank)](https://www.npmjs.com/package/@audio/defeedback-notchbank) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Adaptive notch bank — pooled narrow IIR cuts, click-free coefficient morphing, deepen-on-redeploy

```
npm install @audio/defeedback-notchbank
```

```js
import notchbank from '@audio/defeedback-notchbank'
```

A pool of narrow peaking-EQ cuts sitting directly in the signal path — pure IIR, **zero added latency**. `deploy(freq)` activates a free slot at that frequency (or, if the pool is full, steals the shallowest cut); a repeated `deploy` at a frequency already covered deepens that notch instead of adding a new one (residual howl still growing → cut harder, down to `maxDepth`). Coefficients morph linearly over `ramp` samples on every deploy, so cuts fade in/deepen without clicks.

```js
let notches = notchbank({ fs: 48000, size: 12, q: 30, depth: -9 })

notches.deploy(2340)              // cut a howl at 2340 Hz
let out = notches.process(chunk)  // apply the active cuts, in place
notches.notches()                 // → [{ freq, gain }, ...] currently active
```

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Hz |
| `size` | `12` | pooled notch slots |
| `q` | `30` | notch Q (sharpness) |
| `depth` | `-9` | dB cut per `deploy` call |
| `maxDepth` | `-24` | dB, deepest a single notch can reach |
| `ramp` | `256` | samples, coefficient morph length |

Returns `{ process(chunk): chunk, deploy(freq): void, notches(): Array<{freq, gain}> }`. `process` mutates and returns `chunk` in place.

**Use when:** the direct audio path of an AFS chain — pair with [`@audio/defeedback-analyzer`](https://github.com/audiojs/defeedback-analyzer) + [`@audio/defeedback-tracker`](https://github.com/audiojs/defeedback-tracker) to decide *when* to `deploy`.<br>
**Not for:** detection — this module only applies cuts, it has no howl criteria of its own.

---

Part of [@audio/defeedback](https://github.com/audiojs/defeedback) — the defeedback family umbrella.

MIT © [audiojs](https://github.com/audiojs)
