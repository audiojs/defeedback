// @audio/defeedback — adaptive feedback (howling) suppression, live-sound AFS class
// (dbx AFS / Sabine): ZERO-LATENCY direct path (pure IIR notch bank, no lookahead),
// detection runs on the post-notch signal in parallel — residual howl deepens its notch.
// Alpha Labs DeFeedback-style ML suppression is the @audio/neural lane; this is classical.

import analyze from '@audio/defeedback-analyzer'
import tracker from '@audio/defeedback-tracker'
import notchbank from '@audio/defeedback-notchbank'

export { analyze, tracker, notchbank }

/**
 * Streaming suppressor factory.
 * @param {object} opts — { fs=44100, window=2048, hop=1024, maxNotches=12, Q=30 (`q`: former name),
 *   strength=1 (0..1 scales notch depth), ...tracker/analyzer thresholds }
 * @returns {{ process(chunk): chunk (in place, any block size), notches(): Array, reset() }}
 */
export default function defeedback ({ fs = 44100, window = 2048, hop = 1024, maxNotches = 12, Q, q, strength = 1, ...rest } = {}) {
	let bank = notchbank({ fs, size: maxNotches, Q: Q ?? q ?? 30, depth: -9 * strength, ...rest })
	let trk = tracker(rest)
	let ring = new Float32Array(window), frame = new Float32Array(window)
	let fill = 0, due = Math.max(window, hop)   // samples seen; sample count of the next analysis

	return {
		process (chunk) {
			// Split at analysis points: a notch deployed from the sidechain cuts from the next
			// sample on, whatever the block size (the whole chunk used to be filtered first,
			// so the notch landed up to a block late)
			for (let i = 0; i < chunk.length;) {
				let seg = chunk.subarray(i, Math.min(chunk.length, i + due - fill))
				bank.process(seg) // zero-latency direct path
				for (let j = 0; j < seg.length; j++) ring[fill++ % window] = seg[j]
				i += seg.length
				if (fill < due) continue
				// sidechain: analyze the post-notch signal every `hop` samples
				due += hop
				let start = fill % window
				for (let j = 0; j < window; j++) frame[j] = ring[(start + j) % window]
				for (let howl of trk.update(analyze(frame, { fs, ...rest }))) bank.deploy(howl.freq)
			}
			return chunk
		},
		notches: () => bank.notches(),
		reset () { trk.reset() },
	}
}
