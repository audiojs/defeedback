// Adaptive notch bank — pool of narrow peaking cuts in the direct signal path
// (zero latency: pure IIR, no lookahead). Deploying or deepening a notch morphs
// coefficients linearly over a short ramp, so there are no clicks. A repeated deploy
// on the same frequency deepens the cut (residual howl still growing → cut harder).
//
// Each slot lives in typed arrays (a number written to an object's field is a new object in V8), so `process`,
// `run` and `deploy` allocate nothing. The cut is @audio/biquad's `peaking` (RBJ Audio-EQ-Cookbook), its arithmetic
// written out into the slot's coefficients. `cfg` = [Q, depth, slots in use] may change between calls: a new Q
// morphs every active notch to its new shape, a new depth applies to the deploys after it, and slots past the count
// in use morph flat and then go.

const PI2 = Math.PI * 2

/**
 * @param {object} opts — { fs=44100, size=12, Q=30 (`q`: former name), depth=-9 (dB per deploy),
 *   maxDepth=-24, ramp=256 (samples coefficient morph), slots=size (the most `cfg[2]` may set) }
 * @returns {{ process(chunk): chunk, run(chunk, from, to), deploy(freq): void, notches(): Array, retune(), cfg }}
 */
export default function notchbank ({ fs = 44100, size = 12, Q, q, depth = -9, maxDepth = -24, ramp = 256, slots = size } = {}) {
	Q ??= q ?? 30
	let N = Math.max(slots, size)
	let freq = new Float64Array(N), gain = new Float64Array(N), t = new Float64Array(N).fill(1), active = new Uint8Array(N)
	// per slot: x1 x2 y1 y2; and b0 b1 b2 a1 a2 now, at the morph's start and at its end
	let mem = new Float64Array(4 * N), cur = new Float64Array(5 * N), from = new Float64Array(5 * N), to = new Float64Array(5 * N)
	for (let s = 0; s < N; s++) cur[5 * s] = from[5 * s] = to[5 * s] = 1
	// Q, depth, slots in use; and the Q the notches were last shaped at
	let cfg = Float64Array.of(Q, depth, size), shaped = Float64Array.of(Q)

	// the slot's cut at its freq and gain into `to`, from where it is now, t from 0
	function morph (s, flat) {
		let o = 5 * s
		for (let k = 0; k < 5; k++) from[o + k] = cur[o + k]
		if (flat) { to[o] = 1; to[o + 1] = to[o + 2] = to[o + 3] = to[o + 4] = 0 }
		else {
			let w = PI2 * freq[s] / fs, cw = Math.cos(w), alpha = Math.sin(w) / (2 * cfg[0]), A = 10 ** (gain[s] / 40), a0 = 1 + alpha / A
			to[o] = (1 + alpha * A) / a0; to[o + 1] = -2 * cw / a0; to[o + 2] = (1 - alpha * A) / a0; to[o + 3] = -2 * cw / a0; to[o + 4] = (1 - alpha / A) / a0
		}
		t[s] = 0
	}
	// Q and the slots in use as cfg has them: a new Q reshapes the active notches (not one already going flat, which a
	// reshape would leave a whole notch when it is freed), slots past the count go flat
	function retune () {
		let use = cfg[2]
		if (cfg[0] !== shaped[0]) { shaped[0] = cfg[0]; for (let s = 0; s < use; s++) if (active[s] === 1) morph(s, false) }
		for (let s = use; s < N; s++) if (active[s] === 1) { active[s] = 2; morph(s, true) }
	}
	function run (chunk, a, b) {
		for (let s = 0; s < N; s++) {
			if (!active[s]) continue
			let o = 5 * s, m = 4 * s, x1 = mem[m], x2 = mem[m + 1], y1 = mem[m + 2], y2 = mem[m + 3], ts = t[s]
			for (let i = a; i < b; i++) {
				if (ts < 1) {
					ts = Math.min(1, ts + 1 / ramp)
					for (let k = o; k < o + 5; k++) cur[k] = from[k] + (to[k] - from[k]) * ts
				}
				let x = chunk[i]
				let y = cur[o] * x + cur[o + 1] * x1 + cur[o + 2] * x2 - cur[o + 3] * y1 - cur[o + 4] * y2
				x2 = x1; x1 = x; y2 = y1; y1 = y; chunk[i] = y
			}
			mem[m] = x1; mem[m + 1] = x2; mem[m + 2] = y1; mem[m + 3] = y2; t[s] = ts
			if (active[s] === 2 && ts >= 1) { active[s] = 0; gain[s] = 0; mem.fill(0, m, m + 4) }   // gone flat: free
		}
	}

	return {
		cfg,
		deploy (freq_) {
			let use = cfg[2], s = -1
			if (!(use >= 1)) return   // no slot in use
			for (let k = 0; k < use; k++) if (active[k] === 1 && Math.abs(freq[k] - freq_) / freq_ < 0.03) { s = k; break }
			if (s >= 0) {
				if (gain[s] <= maxDepth + 1) return
				gain[s] = Math.max(maxDepth, gain[s] + cfg[1])
			} else {
				for (let k = 0; k < use; k++) if (!active[k]) { s = k; break }
				if (s < 0) { // steal the shallowest (the last of them, as reduce((a, b) => a.gain > b.gain ? a : b) picks)
					s = 0
					for (let k = 1; k < use; k++) if (!(gain[s] > gain[k])) s = k
					mem.fill(0, 4 * s, 4 * s + 4)
				}
				active[s] = 1
				freq[s] = freq_
				gain[s] = cfg[1]
			}
			morph(s, false)
		},
		process (chunk) { run(chunk, 0, chunk.length); return chunk },
		run,
		retune,
		notches: () => { let out = []; for (let s = 0; s < N; s++) if (active[s]) out.push({ freq: freq[s], gain: gain[s] }); return out },
	}
}
