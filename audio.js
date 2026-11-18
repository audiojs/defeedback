// atom manifest — adaptive feedback (howling) suppressor, live-sound AFS class.
// The umbrella factory is already a zero-latency streaming processor (pure-IIR
// notch bank in the direct path, detection sidechained) accepting any block size —
// one instance per channel, its notch slots made here for notches.max. All three params
// are live, written to the instance's `cfg` each block: a new Q reshapes the notches in
// place (a coefficient morph over the bank's ramp, no click), a new strength sets the cut
// of the deploys after it, a smaller pool lets the slots past it go flat.

import defeedbackFn from './index.js'

export const defeedback = (ctx) => {
	const chans = []
	for (let c = 0, N = ctx.maxChannels ?? 8; c < N; c++) chans.push(defeedbackFn({
		fs: ctx.sampleRate,
		maxNotches: ctx.params.notches[0] | 0,
		slots: defeedback.params.notches.max,
		Q: ctx.params.Q[0],
		strength: ctx.params.strength[0],
	}))
	return (inputs, outputs, params) => {
		const inp = inputs[0], out = outputs[0]
		if (!inp || !inp.length) return
		for (let c = 0; c < inp.length; c++) {
			const ch = chans[c], cfg = ch.cfg
			cfg[0] = params.Q[0]
			cfg[1] = -9 * params.strength[0]
			cfg[2] = params.notches[0] | 0
			out[c].set(inp[c])
			ch.process(out[c])
		}
	}
}
defeedback.channels = 'any'
defeedback.params = {
	notches:  { type: 'number', min: 1, max: 24, default: 12, step: 1 },
	Q:        { type: 'number', min: 10, max: 100, default: 30, curve: 'log', alias: 'q' },
	strength: { type: 'number', min: 0, max: 1, default: 1 },
}
