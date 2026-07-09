// Adaptive notch bank — pool of narrow peaking cuts in the direct signal path
// (zero latency: pure IIR, no lookahead). Deploying or deepening a notch morphs
// coefficients linearly over a short ramp, so there are no clicks. A repeated deploy
// on the same frequency deepens the cut (residual howl still growing → cut harder).

import { peaking } from '@audio/biquad'

const IDENTITY = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }

/**
 * @param {object} opts — { fs=44100, size=12, q=30, depth=-9 (dB per deploy),
 *   maxDepth=-24, ramp=256 (samples coefficient morph) }
 * @returns {{ process(chunk): chunk, deploy(freq): void, notches(): Array }}
 */
export default function notchbank ({ fs = 44100, size = 12, q = 30, depth = -9, maxDepth = -24, ramp = 256 } = {}) {
	let slots = Array.from({ length: size }, () => ({
		freq: 0, gain: 0,
		cur: { ...IDENTITY }, from: { ...IDENTITY }, to: { ...IDENTITY },
		t: 1, x1: 0, x2: 0, y1: 0, y2: 0, active: false,
	}))

	function morph (slot, coefs) {
		slot.from = { ...slot.cur }
		slot.to = coefs
		slot.t = 0
	}

	return {
		deploy (freq) {
			let slot = slots.find(s => s.active && Math.abs(s.freq - freq) / freq < 0.03)
			if (slot) {
				if (slot.gain <= maxDepth + 1) return
				slot.gain = Math.max(maxDepth, slot.gain + depth)
			} else {
				slot = slots.find(s => !s.active)
				if (!slot) { // steal the shallowest
					slot = slots.reduce((a, b) => (a.gain > b.gain ? a : b))
					slot.x1 = slot.x2 = slot.y1 = slot.y2 = 0
				}
				slot.active = true
				slot.freq = freq
				slot.gain = depth
			}
			morph(slot, peaking(slot.freq, q, fs, slot.gain))
		},
		process (chunk) {
			for (let s of slots) {
				if (!s.active) continue
				for (let i = 0; i < chunk.length; i++) {
					if (s.t < 1) {
						s.t = Math.min(1, s.t + 1 / ramp)
						let c = s.cur, f = s.from, to = s.to, t = s.t
						c.b0 = f.b0 + (to.b0 - f.b0) * t
						c.b1 = f.b1 + (to.b1 - f.b1) * t
						c.b2 = f.b2 + (to.b2 - f.b2) * t
						c.a1 = f.a1 + (to.a1 - f.a1) * t
						c.a2 = f.a2 + (to.a2 - f.a2) * t
					}
					let x = chunk[i], c = s.cur
					let y = c.b0 * x + c.b1 * s.x1 + c.b2 * s.x2 - c.a1 * s.y1 - c.a2 * s.y2
					s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = chunk[i] = y
				}
			}
			return chunk
		},
		notches: () => slots.filter(s => s.active).map(s => ({ freq: s.freq, gain: s.gain })),
	}
}
