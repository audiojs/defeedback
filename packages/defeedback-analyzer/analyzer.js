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
	let c = candidates(data.length), out = []
	c.cfg[0] = fs; c.cfg[1] = maxCandidates; c.cfg[2] = floor
	analyzeInto(data, c)
	for (let j = 0; j < c.n; j++) out.push({ freq: c.freq[j], level: c.level[j], pnpr: c.pnpr[j], phpr: c.phpr[j], kc: c.kc[j] })
	return out
}

/**
 * The candidates of one window of n samples, kept in typed arrays so that `analyzeInto` allocates nothing: `n` of them,
 * strongest first, each `freq`, `level`, `pnpr`, `phpr`, `kc` at its index; `cfg` = [fs, maxCandidates, floor], set by
 * the caller (defaults 44100, 6, −70); the rest is the analysis' own memory.
 */
export function candidates (n) {
	let half = n / 2, m = half + 1, win = new Float64Array(n)
	for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)
	let f = () => new Float64Array(m)
	return {
		n: 0, cfg: Float64Array.of(44100, 6, -70), freq: f(), level: f(), pnpr: f(), phpr: f(), kc: f(),
		win, buf: new Float64Array(n), mag: f(),
		// the peaks in bin order before the gate: level, pnpr, phpr, kc; which pass it; their order by level
		pl: f(), pn: f(), ph: f(), pk: f(), keep: new Uint8Array(m), ord: new Int32Array(m),
	}
}

/** `analyze` into `c` (made by `candidates(data.length)`): the same candidates, as numbers in its arrays */
export function analyzeInto (data, c) {
	let n = data.length, half = n / 2, fs = c.cfg[0], maxCandidates = c.cfg[1], floor = c.cfg[2]
	let buf = c.buf, win = c.win, mag = c.mag, pl = c.pl, pn = c.pn, ph = c.ph, pk = c.pk, keep = c.keep, ord = c.ord
	for (let i = 0; i < n; i++) buf[i] = data[i] * win[i]
	let sp = fft(buf), re = sp[0], im = sp[1]
	for (let k = 0; k <= half; k++) mag[k] = re[k] * re[k] + im[k] * im[k]

	// dB of a power p is 10 log10(p + 1e-20); a harmonic's power, the most of the bins around it
	let m = 0
	let kMin = Math.max(4, Math.round(100 * n / fs)) // ignore <100 Hz rumble
	for (let k = kMin; k < half - 4; k++) {
		if (mag[k] <= mag[k - 1] || mag[k] < mag[k + 1]) continue
		let level = 10 * Math.log10(mag[k] * 4 / (n * n) + 1e-20) // rough dBFS calibration
		if (level < floor) continue
		// parabolic freq refinement (dB domain)
		let la = Math.log(mag[k - 1] + 1e-20), lb = Math.log(mag[k] + 1e-20), lc = Math.log(mag[k + 1] + 1e-20)
		let off = 0.5 * (la - lc) / (la - 2 * lb + lc || 1e-12)
		if (!(off > -1 && off < 1)) off = 0
		let kc = k + off
		// PNPR: peak vs mean power a few bins away (±4..8) — feedback is far narrower than music
		// (within 6 bins of either end a neighbour lies past the spectrum and the mean is NaN, as reading past it made it; a read
		// past a typed array had V8 box every power this loop loaded)
		let nb = k >= 6 && k + 6 <= half ? (mag[k - 4] + mag[k - 5] + mag[k - 6] + mag[k + 4] + mag[k + 5] + mag[k + 6]) / 6 : NaN
		let dk = 10 * Math.log10(mag[k] + 1e-20)
		let pnpr = dk - 10 * Math.log10(nb + 1e-20)
		// PHPR: peak vs its own 2nd/3rd harmonics — a bare howl has none
		let h2 = 0, h3 = 0
		if (2 * kc <= half) { let b = Math.round(2 * kc); for (let j = Math.max(0, b - 1); j <= Math.min(half, b + 1); j++) if (mag[j] > h2) h2 = mag[j] }
		if (3 * kc <= half) { let b = Math.round(3 * kc); for (let j = Math.max(0, b - 1); j <= Math.min(half, b + 1); j++) if (mag[j] > h3) h3 = mag[j] }
		let phpr = dk - 10 * Math.log10(Math.max(h2, h3) + 1e-20)
		pl[m] = level; pn[m] = pnpr; ph[m] = phpr; pk[m] = kc; keep[m] = 1; m++
	}
	// relational harmonic gate: a peak that sits within 1% of an integer multiple of a
	// strong lower peak is a musical overtone, not feedback (parabolic freqs ≈ 0.1% accurate).
	// The peaks lie in bin order, two bins apart at least, so in order of kc too: the fundamentals are the first 8 over
	// −45 dB
	for (let i = 0; i < m; i++) {
		for (let f = 0, seen = 0; f < m && seen < 8; f++) {
			if (!(pl[f] > -45)) continue
			seen++
			if (pk[f] >= pk[i] * 0.75) break
			let r = Math.round(pk[i] / pk[f])
			if (r >= 2 && Math.abs(pk[i] - r * pk[f]) / (r * pk[f]) < 0.01) { keep[i] = 0; break }
		}
	}
	// the strongest first, ties in bin order (a stable sort by level, as Array.prototype.sort is)
	let q = 0
	for (let i = 0; i < m; i++) {
		if (!keep[i]) continue
		let j = q++
		while (j > 0 && pl[ord[j - 1]] < pl[i]) { ord[j] = ord[j - 1]; j-- }
		ord[j] = i
	}
	c.n = Math.min(q, maxCandidates)
	for (let j = 0; j < c.n; j++) {
		let i = ord[j]
		c.freq[j] = pk[i] * fs / n; c.level[j] = pl[i]; c.pnpr[j] = pn[i]; c.phpr[j] = ph[i]; c.kc[j] = pk[i]
	}
}
