// Feedback candidate detection — spectral peaks scored by the classical howl criteria
// (van Waterschoot & Moonen 2011): PNPR (peak-to-neighboring-power ratio — feedback is
// far narrower than music) and PHPR (peak-to-harmonic-power ratio — feedback is a bare
// sinusoid, musical tones carry harmonics).

import { fft } from 'fourier-transform'

/**
 * Analyze one window. @returns Array<{freq, level (dB), pnpr, phpr}>
 * @param {Float32Array} data — analysis window (power of 2)
 * @param {object} opts — { fs=44100, maxCandidates=6, floor=-70 (dB) }
 */
export default function analyze (data, { fs = 44100, maxCandidates = 6, floor = -70 } = {}) {
	let n = data.length, half = n / 2
	let buf = new Float64Array(n)
	for (let i = 0; i < n; i++) buf[i] = data[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n))
	let [re, im] = fft(buf)
	let mag = new Float64Array(half + 1)
	for (let k = 0; k <= half; k++) mag[k] = re[k] * re[k] + im[k] * im[k]

	let db = p => 10 * Math.log10(p + 1e-20)
	let at = kc => { // max power around a (possibly fractional) bin
		let b = Math.round(kc)
		let m = 0
		for (let j = Math.max(0, b - 1); j <= Math.min(half, b + 1); j++) if (mag[j] > m) m = mag[j]
		return m
	}
	let out = []
	let kMin = Math.max(4, Math.round(100 * n / fs)) // ignore <100 Hz rumble
	for (let k = kMin; k < half - 4; k++) {
		if (mag[k] <= mag[k - 1] || mag[k] < mag[k + 1]) continue
		let level = db(mag[k] * 4 / (n * n)) // rough dBFS calibration
		if (level < floor) continue
		// parabolic freq refinement (dB domain)
		let la = Math.log(mag[k - 1] + 1e-20), lb = Math.log(mag[k] + 1e-20), lc = Math.log(mag[k + 1] + 1e-20)
		let off = 0.5 * (la - lc) / (la - 2 * lb + lc || 1e-12)
		if (!(off > -1 && off < 1)) off = 0
		let kc = k + off
		// PNPR: peak vs mean power a few bins away (±4..8) — feedback is far narrower than music
		let nb = (mag[k - 4] + mag[k - 5] + mag[k - 6] + mag[k + 4] + mag[k + 5] + mag[k + 6]) / 6
		let pnpr = db(mag[k]) - db(nb)
		// PHPR: peak vs its own 2nd/3rd harmonics — a bare howl has none
		let phpr = db(mag[k]) - db(Math.max(2 * kc <= half ? at(2 * kc) : 0, 3 * kc <= half ? at(3 * kc) : 0))
		out.push({ freq: kc * fs / n, level, pnpr, phpr, kc })
	}
	// relational harmonic gate: a peak that sits within 1% of an integer multiple of a
	// strong lower peak is a musical overtone, not feedback (parabolic freqs ≈ 0.1% accurate)
	let fundamentals = out.filter(c => c.level > -45).sort((a, b) => a.kc - b.kc).slice(0, 8)
	out = out.filter(c => {
		for (let f of fundamentals) {
			if (f.kc >= c.kc * 0.75) break
			let m = Math.round(c.kc / f.kc)
			if (m >= 2 && Math.abs(c.kc - m * f.kc) / (m * f.kc) < 0.01) return false
		}
		return true
	})
	out.sort((a, b) => b.level - a.level)
	return out.slice(0, maxCandidates)
}
