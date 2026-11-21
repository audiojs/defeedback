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

test('block size does not move the notches — output identical under any chunking', () => {
	// The whole chunk used to be filtered before the sidechain ran, so a notch deployed
	// mid-chunk cut from the next call on: its onset depended on the host block size
	let n = 2 * fs, x = saw(220, n)
	for (let i = 0; i < n; i++) x[i] += 10 ** ((-40 + 30 * i / n) / 20) * Math.sin(2 * Math.PI * 3127 * i / fs)
	let run = block => {
		let d = Float32Array.from(x), df = defeedback({ fs })
		for (let pos = 0; pos < n; pos += block) df.process(d.subarray(pos, Math.min(n, pos + block)))
		return d
	}
	let ref = run(4096)
	ok(defeedback({ fs }).process(Float32Array.from(x)).some((v, i) => v !== x[i]), 'notches engage')
	for (let block of [1, 64, 997, 1024]) {
		let d = run(block), m = 0
		for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i] - ref[i]))
		is(m, 0, `block ${block} ≡ block 4096`)
	}
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

test('Q — former option name q still works, on the suppressor and its notch bank', () => {
	let x = saw(220, fs)
	for (let i = 0; i < fs; i++) x[i] += 0.3 * Math.sin(2 * Math.PI * 3127 * i / fs)
	let a = defeedback({ fs, Q: 50 }).process(Float32Array.from(x)), b = defeedback({ fs, q: 50 }).process(Float32Array.from(x))
	ok(a.every((v, i) => v === b[i]), 'defeedback: { q } ≡ { Q }')
	let c = defeedback({ fs }).process(Float32Array.from(x))
	ok(a.some((v, i) => v !== c[i]), 'Q changes the notches')
})

import { execFileSync } from 'node:child_process'
import { peaking } from '@audio/biquad'
import { defeedback as atom } from './audio.js'

// the howl test's take: a saw and a howl growing from −50 to −10 dBFS
function howling (n, howlF = 3127) {
	let d = saw(220, n)
	for (let i = 0; i < n; i++) d[i] += 10 ** ((-50 + 40 * (i / n)) / 20) * Math.sin(2 * Math.PI * howlF * i / fs)
	return d
}
// the manifest under a host's calls of 128 frames, its values from `at(frame)` (numbers as 1-length Float32Arrays)
function hosted (x, at = () => ({})) {
	let values = f => Object.fromEntries(Object.entries(atom.params).map(([k, s]) => [k, Float32Array.of(at(f)[k] ?? s.default)]))
	let proc = atom({ sampleRate: fs, maxBlockSize: 128, maxChannels: 1, params: values(0) }), out = new Float32Array(x.length)
	for (let i = 0; i < x.length; i += 128) { let o = out.subarray(i, i + 128); proc([[x.subarray(i, i + 128)]], [[o]], values(i)) }
	return out
}

test('manifest: Q is live: a change reshapes the notches deployed, the same bank as @audio/biquad\'s peaking at the new Q (was restart: ignored)', () => {
	// a bank deployed at Q 30, then Q 60: past the morph its notch is the peaking cut at 60, coefficient for coefficient,
	// so its output is a bank deployed at 60 from the start, run on the same signal from there
	let n = 3 * fs, x = howling(n), k = 2 * fs
	let moved = hosted(x, f => ({ Q: f < k ? 30 : 60 })), still = hosted(x)
	let diff = 0
	for (let i = k + 512; i < n; i++) diff = Math.max(diff, Math.abs(moved[i] - still[i]))
	ok(diff > 1e-3, `heard: ${diff.toFixed(4)}`)
	// the bank itself: deploy, then a new Q, morphed over its ramp, then its coefficients are peaking's
	let a = defeedback({ fs, slots: 4 }), b = defeedback({ fs, Q: 60, slots: 4 }), y = new Float32Array(1024)
	for (let i = 0; i < 4; i++) a.process(Float32Array.from(howling(2048)))
	let f0 = a.notches()[0]
	ok(f0, `a notch deployed: ${f0 && f0.freq.toFixed(1)} Hz, ${f0 && f0.gain.toFixed(1)} dB`)
	a.cfg[0] = 60; a.process(y)
	let c = peaking(f0.freq, 60, fs, f0.gain), z = Float32Array.from({ length: 512 }, (_, i) => Math.sin(i * 0.7)), za = z.slice(), ref = z.slice()
	let s1 = 0, s2 = 0, r1 = 0, r2 = 0
	for (let i = 0; i < ref.length; i++) { let v = ref[i], w = c.b0 * v + c.b1 * s1 + c.b2 * s2 - c.a1 * r1 - c.a2 * r2; s2 = s1; s1 = v; r2 = r1; r1 = w; ref[i] = w }
	// the bank's filter memory carries the last block; from silence both start alike
	let quiet = new Float32Array(4096); a.process(quiet); a.process(za)
	let err = 0
	for (let i = 0; i < za.length; i++) err = Math.max(err, Math.abs(za[i] - ref[i]))
	ok(err < 1e-6, `the notch at Q 60 is peaking(f, 60): ${err}`)
})

test('manifest: strength and notches are live: a new strength cuts the next deploys by it, a smaller pool lets the rest go flat (were restart: ignored)', () => {
	let n = 3 * fs, x = howling(n)
	// strength 0 from the start: a deploy cuts 0 dB, a peaking section flat to the rounding (its b1·x1 and a1·y1 cancel)
	let flat = hosted(x, () => ({ strength: 0 })), dev = 0
	for (let i = 0; i < n; i++) dev = Math.max(dev, Math.abs(flat[i] - x[i]))
	ok(dev < 1e-5, `strength 0: the input, to ${dev}`)
	// from 0 to 1 at 1 s: the howl, uncut until then, is deployed on again and now cut
	let moved = hosted(x, f => ({ strength: f < fs ? 0 : 1 })), diff = 0
	for (let i = fs; i < n; i++) diff = Math.max(diff, Math.abs(moved[i] - flat[i]))
	ok(diff > 1e-3, `strength 0 → 1 at 1 s heard: ${diff.toFixed(4)}`)
	// one notch deployed on a bank of two slots, then one in use: past the ramp it is gone, the output the input
	let df = defeedback({ fs, maxNotches: 2, slots: 2 }), d = howling(n)
	for (let i = 0; i < 2 * fs; i += 256) df.process(d.subarray(i, i + 256))
	let before = df.notches().length
	df.cfg[2] = 0
	let tail = Float32Array.from(d.subarray(2 * fs, 2 * fs + 4096)), kept = tail.slice()
	df.process(tail.subarray(0, 512))
	df.process(tail.subarray(512))
	ok(before >= 1 && df.notches().length === 0, `${before} notch, then none in use: ${df.notches().length} left`)
	ok(tail.subarray(512).every((v, i) => v === kept[512 + i]), 'past the ramp, the input as it is')
})

test('notchbank: a new Q leaves a notch that is going flat to go flat: freed, it cuts off nothing', async () => {
	// the pool shrinks under a deployed notch, then grows back with a new Q before its ramp ends: reshaped, the slot would be
	// freed holding a whole notch, a step in the output
	let { notchbank } = await import('./index.js'), b = notchbank({ fs, size: 2, ramp: 256 }), at = 0, y = []
	let run = n => { let x = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 1000 * (at + i) / fs)); at += n; b.process(x); y.push(...x) }
	b.deploy(1000); run(2048)
	b.cfg[2] = 0; b.retune(); run(64)
	b.cfg[2] = 2; b.cfg[0] = 60; b.retune(); run(4096); run(1024)
	let worst = 0, own = 0.5 * (2 * Math.PI * 1000 / fs) ** 2
	for (let i = 2048 + 66; i < y.length; i++) worst = Math.max(worst, Math.abs(y[i] - 2 * y[i - 1] + y[i - 2]))
	ok(worst < 1.5 * own && !b.notches().length, `largest second difference ${worst.toExponential(2)}, the tone's own ${own.toExponential(2)}`)
})

// CONTRACT 1.0, process: "Allocate nothing". A warm process() in a child Node with a 1 MB young generation, counted over
// 2^16 blocks of 8 frames (a collection is 1 MB, so 16 bytes a block show), under the contract validator's flags, at
// the defaults and with each param moving every block, one case after another in one process. Where V8 boxes a number
// moves with its version: measured on Node 20, 22 and 25
test('manifest: allocates nothing in process, at its defaults and as its params move', { skip: +process.versions.node.split('.')[0] < 20 && 'measured on Node 20 and later' }, () => {
	let cases = [[], ['notches', 1, 24], ['Q', 10, 100], ['strength', 0, 1]]
	let child = `
		import { defeedback as m } from ${JSON.stringify(import.meta.resolve('./audio.js'))}
		import { PerformanceObserver } from 'node:perf_hooks'
		let counts = []
		for (let [key, a, b] of JSON.parse(process.argv[1])) {
			let given = () => Object.fromEntries(Object.entries(m.params).map(([k, s]) => [k, Float32Array.of(s.default)]))
			let params = given(), proc = m({ sampleRate: 48000, maxBlockSize: 128, maxChannels: 2, params: given() })
			let src = [0, 1].map(c => Float32Array.from({ length: 512 }, (_, i) => 0.5 * Math.sin(i * 0.1 + c) + 0.1 * Math.sin(i * 1.7) + 0.05 * Math.sin(i * i * 0.37 + c)))
			let ins = Array.from({ length: 64 }, (_, k) => [src.map(c => c.subarray(k * 8, k * 8 + 8))]), outs = [[new Float32Array(8), new Float32Array(8)]]
			let v = key ? params[key] : null, to = Float32Array.of(a ?? 0, b ?? 0)
			let run = n => { for (let i = 0; i < n; i++) { if (v) v[0] = to[i & 1]; proc(ins[i & 63], outs, params) } }
			run(1 << 15); globalThis.gc()
			let gcs = 0, seen = new PerformanceObserver(list => { gcs += list.getEntries().length }); seen.observe({ entryTypes: ['gc'] })
			run(1 << 16); await new Promise(done => setTimeout(done, 20)); seen.disconnect()
			counts.push(gcs)
		}
		console.log(JSON.stringify(counts))`
	let counts = JSON.parse(execFileSync(process.execPath, ['--max-semi-space-size=1', '--expose-gc', '--no-concurrent-recompilation', '--input-type=module', '-e', child, JSON.stringify(cases)], { encoding: 'utf8' }))
	cases.forEach(([key, a, b], k) => is(counts[k], 0, `${key ? `${key} ${a} ↔ ${b} each block` : 'defaults'}: ${counts[k]} collections in 2^16 blocks`))
})

// The family's manifests: audio.js names every member that has a manifest (a package of packages/ the umbrella depends
// on, with an audio.js), and no other; each name a member's manifest exports is the entry's, the same binding
test('audio.js lists every member that has a manifest', async () => {
	const { readdirSync, existsSync, readFileSync } = await import('node:fs')
	const at = p => new URL(p, import.meta.url), { dependencies } = JSON.parse(readFileSync(at('package.json'), 'utf8'))
	const members = readdirSync(at('packages')).filter(d => existsSync(at(`packages/${d}/audio.js`)))
		.map(d => JSON.parse(readFileSync(at(`packages/${d}/package.json`), 'utf8')).name).filter(n => n in dependencies).sort()
	const listed = [...readFileSync(at('audio.js'), 'utf8').matchAll(/^export \* from '(@audio\/[^']+)\/audio'$/gm)].map(m => m[1]).sort()
	is(listed, members, 'one line per member, no other')
	const family = await import(at('audio.js')), missing = []
	for (const m of members) for (const [k, v] of Object.entries(await import(`${m}/audio`))) if (k !== 'default' && family[k] !== v) missing.push(`${m}: ${k}`)
	is(missing, [], 'every name a member\'s manifest exports, the same binding')
})
