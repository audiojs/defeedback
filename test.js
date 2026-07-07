import test, { almost, ok, is } from 'tst'
import defeedback from './index.js'

const fs = 44100

function goertzel (d, f, from = 0, to = d.length) {
	let w = 2 * Math.PI * f / fs, cw = Math.cos(w), s1 = 0, s2 = 0
	for (let i = from; i < to; i++) { let s0 = d[i] + 2 * cw * s1 - s2; s2 = s1; s1 = s0 }
	return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - 2 * cw * s1 * s2)) / (to - from)
}
function saw (f, n, amp = 0.3) {
	let d = new Float32Array(n)
	for (let i = 0; i < n; i++) { let s = 0; for (let h = 1; h <= 8; h++) s += Math.sin(2 * Math.PI * h * f * i / fs) / h; d[i] = amp * s }
	return d
}

test('kills a growing howl, leaves the music ±1 dB', () => {
	let n = 3 * fs
	let d = saw(220, n)
	let howlF = 3127
	for (let i = 0; i < n; i++) {
		let db = -50 + 40 * (i / n) // grows −50 → −10 dBFS
		d[i] += 10 ** (db / 20) * Math.sin(2 * Math.PI * howlF * i / fs)
	}
	let dry = Float32Array.from(d)
	let df = defeedback({ fs })
	for (let pos = 0; pos < n; pos += 256) df.process(d.subarray(pos, Math.min(n, pos + 256)))

	let late = [Math.round(2.5 * fs), n]
	let howlDb = 20 * Math.log10(goertzel(d, howlF, ...late) / goertzel(dry, howlF, ...late))
	ok(howlDb < -12, 'howl suppressed ' + howlDb.toFixed(1) + ' dB')
	let musicDb = 20 * Math.log10(goertzel(d, 220, ...late) / goertzel(dry, 220, ...late))
	ok(Math.abs(musicDb) < 1, 'music intact (' + musicDb.toFixed(2) + ' dB)')
	ok(df.notches().length >= 1 && df.notches().some(nt => Math.abs(nt.freq - howlF) / howlF < 0.03), 'notch on the howl')
	ok(d.every(isFinite))
})

test('music protection — steady harmonic-rich tone deploys no notches', () => {
	let d = saw(400, 2 * fs, 0.5)
	let df = defeedback({ fs })
	for (let pos = 0; pos < d.length; pos += 256) df.process(d.subarray(pos, pos + 256))
	is(df.notches().length, 0, 'no notches on music')
})

test('closed loop — unstable without, stable with (zero-latency path)', () => {
	// mic ← src + g·room(delayed speaker): room = resonant bandpass (700 Hz, Q 3),
	// loop delay 250 samples → one comb mode (705.6 Hz) sits in-band with gain ≈ 1.01:
	// a single slowly-growing howl, like a real PA on the edge.
	let seconds = 4, n = seconds * fs, D = 250, g = 1.012
	let w = 2 * Math.PI * 700 / fs, alpha = Math.sin(w) / 6, a0 = 1 + alpha
	let B0 = alpha / a0, B2 = -alpha / a0, A1 = -2 * Math.cos(w) / a0, A2 = (1 - alpha) / a0
	function runLoop (suppressor) {
		let out = new Float32Array(n)
		let x1 = 0, x2 = 0, y1 = 0, y2 = 0, peak = 0
		let block = new Float32Array(64)
		for (let pos = 0; pos < n; pos += 64) {
			for (let i = 0; i < 64 && pos + i < n; i++) {
				let idx = pos + i
				let src = idx % 8000 < 400 ? 0.05 * Math.sin(2 * Math.PI * 330 * idx / fs) : 0
				let x = idx >= D ? out[idx - D] : 0
				let room = B0 * x + B2 * x2 - A1 * y1 - A2 * y2
				x2 = x1; x1 = x; y2 = y1; y1 = room
				block[i] = Math.max(-4, Math.min(4, src + g * room))
			}
			if (suppressor) suppressor.process(block)
			for (let i = 0; i < 64 && pos + i < n; i++) {
				out[pos + i] = block[i]
				let a = Math.abs(block[i])
				if (pos + i > n * 0.6 && a > peak) peak = a
			}
		}
		return peak // late-window peak
	}
	let wild = runLoop(null)
	let tamed = runLoop(defeedback({ fs }))
	ok(wild > 1.5, 'without suppression the loop runs away (peak ' + wild.toFixed(2) + ')')
	ok(tamed < 0.5, 'with suppression it stays bounded (peak ' + tamed.toFixed(3) + ')')
})
