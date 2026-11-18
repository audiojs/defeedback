// Howl trajectory tracking — a candidate becomes a confirmed howl when it persists at a
// stable frequency, looks like a bare narrow sinusoid (PNPR + PHPR gates — the music
// discriminator), and is not decaying. Stateful factory: feed analyzer candidates per hop.

/**
 * @param {object} opts — { minFrames=3 (persistence), pnpr=18 (dB), phpr=15 (dB),
 *   freqTol=0.02 (relative), growth=-3 (dB/frame min trend — reject decaying tones) }
 * @returns {{ update(candidates): Array<{freq, level}>, reset() }}
 */
export default function tracker (opts) {
	let T = tracks(opts), c = { n: 0, freq: null, level: null, pnpr: null, phpr: null }
	return {
		update (candidates) {
			let n = candidates.length
			c.n = n
			c.freq = Float64Array.from(candidates, x => x.freq); c.level = Float64Array.from(candidates, x => x.level)
			c.pnpr = Float64Array.from(candidates, x => x.pnpr); c.phpr = Float64Array.from(candidates, x => x.phpr)
			if (T.n + n > T.freq.length) T = grown(T, T.n + n)
			updateInto(T, c)
			let out = []
			for (let j = 0; j < T.h; j++) out.push({ freq: T.hf[j], level: T.hl[j] })
			return out
		},
		reset () { T.n = 0 },
	}
}

/**
 * The tracks in typed arrays, room for `cap` (a track lives while it is seen in one of its last three updates, so a
 * tracker fed m candidates an update holds 4m at most: 24 for the analyzer's 6), so that `updateInto` allocates
 * nothing: `n` tracks, each its `freq`, `level`, `count`, `missed`, `trend` at its index; the confirmed howls of the
 * last update, `h` of them, `hf` and `hl`; `cfg` = [minFrames, pnpr, phpr, freqTol, growth].
 */
export function tracks ({ minFrames = 3, pnpr = 18, phpr = 15, freqTol = 0.02, growth = -3 } = {}, cap = 64) {
	return {
		n: 0, cfg: Float64Array.of(minFrames, pnpr, phpr, freqTol, growth),
		freq: new Float64Array(cap), level: new Float64Array(cap), trend: new Float64Array(cap),
		count: new Int32Array(cap), missed: new Int32Array(cap), seen: new Uint8Array(cap),
		h: 0, hf: new Float64Array(cap), hl: new Float64Array(cap),
	}
}
const grown = (T, need) => {
	let U = tracks({}, Math.max(need, 2 * T.freq.length))
	U.cfg.set(T.cfg); U.n = T.n
	for (let k of ['freq', 'level', 'trend', 'count', 'missed', 'seen']) U[k].set(T[k])
	return U
}

/** One hop's candidates `c` ({ n, freq, level, pnpr, phpr }: the analyzer's `candidates`) into the tracks `T`; the
 *  confirmed, persistent, non-decaying howls into T.hf, T.hl (T.h of them) */
export function updateInto (T, c) {
	let { freq, level, trend, count, missed, seen, cfg } = T, minFrames = cfg[0], pnpr = cfg[1], phpr = cfg[2], freqTol = cfg[3], growth = cfg[4], n = T.n
	for (let t = 0; t < n; t++) seen[t] = 0
	for (let j = 0; j < c.n; j++) {
		if (c.pnpr[j] < pnpr || c.phpr[j] < phpr) continue // musical / broad content
		let f = c.freq[j], tr = -1
		for (let t = 0; t < n; t++) if (Math.abs(freq[t] - f) / freq[t] < freqTol) { tr = t; break }
		if (tr >= 0) {
			trend[tr] = c.level[j] - level[tr]
			freq[tr] = 0.5 * freq[tr] + 0.5 * f
			level[tr] = c.level[j]
			count[tr]++
			seen[tr] = 1
			missed[tr] = 0
		} else if (n < freq.length) {
			freq[n] = f; level[n] = c.level[j]; count[n] = 1; missed[n] = 0; seen[n] = 1; trend[n] = 0; n++
		}
	}
	// the dead go (not seen for a third update running), the rest keep their order
	let m = 0
	for (let t = 0; t < n; t++) {
		if (!seen[t] && ++missed[t] > 2) continue
		freq[m] = freq[t]; level[m] = level[t]; trend[m] = trend[t]; count[m] = count[t]; missed[m] = missed[t]; seen[m] = seen[t]; m++
	}
	T.n = m
	let h = 0
	for (let t = 0; t < m; t++) if (count[t] >= minFrames && trend[t] >= growth) { T.hf[h] = freq[t]; T.hl[h] = level[t]; h++ }
	T.h = h
}
