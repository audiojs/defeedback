// @audio/defeedback — adaptive feedback (howling) suppression, live-sound AFS class
// (dbx AFS / Sabine): ZERO-LATENCY direct path (pure IIR notch bank, no lookahead),
// detection runs on the post-notch signal in parallel — residual howl deepens its notch.
// Alpha Labs DeFeedback-style ML suppression is the @audio/neural lane; this is classical.

import analyze, { candidates, analyzeInto } from '@audio/defeedback-analyzer'
import tracker, { tracks, updateInto } from '@audio/defeedback-tracker'
import notchbank from '@audio/defeedback-notchbank'

export { analyze, tracker, notchbank }

/**
 * Streaming suppressor factory.
 * @param {object} opts — { fs=44100, window=2048, hop=1024, maxNotches=12, Q=30 (`q`: former name),
 *   strength=1 (0..1 scales notch depth), slots=maxNotches (the most notches `cfg` may allow), ...tracker/analyzer
 *   thresholds }
 * @returns {{ process(chunk): chunk (in place, any block size), notches(): Array, reset(), cfg }}: `cfg`, the bank's
 *   [Q, depth per deploy (−9·strength dB), notches in use], may change between calls (see @audio/defeedback-notchbank)
 */
export default function defeedback ({ fs = 44100, window = 2048, hop = 1024, maxNotches = 12, Q, q, strength = 1, slots, ...rest } = {}) {
	let bank = notchbank({ fs, size: maxNotches, Q: Q ?? q ?? 30, depth: -9 * strength, slots, ...rest })
	// the analysis and the tracks in typed arrays (the tracker fed m candidates a hop holds 4m tracks at most), the
	// samples seen and the count of the next analysis in a Float64Array: process allocates nothing but one number (16
	// bytes) at each deploy of a notch
	let cand = candidates(window), maxCandidates = rest.maxCandidates ?? 6, trk = tracks(rest, 4 * maxCandidates)
	cand.cfg[0] = fs; cand.cfg[1] = maxCandidates; cand.cfg[2] = rest.floor ?? -70
	let ring = new Float32Array(window), frame = new Float32Array(window)
	let at = Float64Array.of(0, Math.max(window, hop))   // samples seen; sample count of the next analysis

	return {
		cfg: bank.cfg,
		process (chunk) {
			bank.retune()
			let fill = at[0], due = at[1]
			// Split at analysis points: a notch deployed from the sidechain cuts from the next
			// sample on, whatever the block size (the whole chunk used to be filtered first,
			// so the notch landed up to a block late)
			for (let i = 0; i < chunk.length;) {
				let e = Math.min(chunk.length, i + due - fill)
				bank.run(chunk, i, e) // zero-latency direct path
				for (let j = i; j < e; j++) ring[fill++ % window] = chunk[j]
				i = e
				if (fill < due) continue
				// sidechain: analyze the post-notch signal every `hop` samples
				due += hop
				let start = fill % window
				for (let j = 0; j < window; j++) frame[j] = ring[(start + j) % window]
				analyzeInto(frame, cand)
				updateInto(trk, cand)
				for (let h = 0; h < trk.h; h++) bank.deploy(trk.hf[h])
			}
			at[0] = fill; at[1] = due
			return chunk
		},
		notches: () => bank.notches(),
		reset () { trk.n = 0 },
	}
}
