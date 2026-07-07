// Howl trajectory tracking — a candidate becomes a confirmed howl when it persists at a
// stable frequency, looks like a bare narrow sinusoid (PNPR + PHPR gates — the music
// discriminator), and is not decaying. Stateful factory: feed analyzer candidates per hop.

/**
 * @param {object} opts — { minFrames=3 (persistence), pnpr=18 (dB), phpr=15 (dB),
 *   freqTol=0.02 (relative), growth=-3 (dB/frame min trend — reject decaying tones) }
 * @returns {{ update(candidates): Array<{freq, level}>, reset() }}
 */
export default function tracker ({ minFrames = 3, pnpr = 18, phpr = 15, freqTol = 0.02, growth = -3 } = {}) {
	let tracks = [] // {freq, level, count, missed}

	return {
		update (candidates) {
			for (let t of tracks) t.seen = false
			for (let c of candidates) {
				if (c.pnpr < pnpr || c.phpr < phpr) continue // musical / broad content
				let tr = tracks.find(t => Math.abs(t.freq - c.freq) / t.freq < freqTol)
				if (tr) {
					tr.trend = c.level - tr.level
					tr.freq = 0.5 * tr.freq + 0.5 * c.freq
					tr.level = c.level
					tr.count++
					tr.seen = true
					tr.missed = 0
				} else {
					tracks.push({ freq: c.freq, level: c.level, count: 1, missed: 0, seen: true, trend: 0 })
				}
			}
			for (let t of tracks) if (!t.seen && ++t.missed > 2) t.dead = true
			tracks = tracks.filter(t => !t.dead)
			return tracks.filter(t => t.count >= minFrames && t.trend >= growth).map(t => ({ freq: t.freq, level: t.level }))
		},
		reset () { tracks = [] },
	}
}
