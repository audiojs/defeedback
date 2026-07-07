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
 * @param {object} opts — { fs=44100, window=2048, hop=1024, maxNotches=12, q=30,
 *   strength=1 (0..1 scales notch depth), ...tracker/analyzer thresholds }
 * @returns {{ process(chunk): chunk (in place, any block size), notches(): Array, reset() }}
 */
export default function defeedback ({ fs = 44100, window = 2048, hop = 1024, maxNotches = 12, q = 30, strength = 1, ...rest } = {}) {
	let bank = notchbank({ fs, size: maxNotches, q, depth: -9 * strength, ...rest })
	let trk = tracker(rest)
	let ring = new Float32Array(window)
	let fill = 0, sinceAnalysis = 0

	return {
		process (chunk) {
			bank.process(chunk) // zero-latency direct path
			// sidechain: accumulate post-notch signal, analyze every `hop` samples
			for (let i = 0; i < chunk.length; i++) {
				ring[fill % window] = chunk[i]
				fill++
				if (++sinceAnalysis >= hop && fill >= window) {
					sinceAnalysis = 0
					let frame = new Float32Array(window)
					let start = fill % window
					for (let j = 0; j < window; j++) frame[j] = ring[(start + j) % window]
					for (let howl of trk.update(analyze(frame, { fs, ...rest }))) bank.deploy(howl.freq)
				}
			}
			return chunk
		},
		notches: () => bank.notches(),
		reset () { trk.reset() },
	}
}
