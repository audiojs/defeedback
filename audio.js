// atom manifest — adaptive feedback (howling) suppressor, live-sound AFS class.
// The umbrella factory is already a zero-latency streaming processor (pure-IIR
// notch bank in the direct path, detection sidechained) accepting any block size —
// one instance per channel. Pool size / Q / strength bake into the bank at
// construction — flags:['restart'].

import defeedbackFn from './index.js'

export const defeedback = (ctx) => {
	const chans = []
	for (let c = 0, N = ctx.maxChannels ?? 8; c < N; c++) chans.push(defeedbackFn({
		fs: ctx.sampleRate,
		maxNotches: ctx.params.notches[0] | 0,
		q: ctx.params.q[0],
		strength: ctx.params.strength[0],
	}))
	return (inputs, outputs) => {
		const inp = inputs[0], out = outputs[0]
		if (!inp || !inp.length) return
		for (let c = 0; c < inp.length; c++) {
			out[c].set(inp[c])
			chans[c].process(out[c])
		}
	}
}
defeedback.channels = 'any'
defeedback.params = {
	notches:  { type: 'number', min: 1, max: 24, default: 12, step: 1, flags: ['restart'] },
	q:        { type: 'number', min: 10, max: 100, default: 30, curve: 'log', flags: ['restart'] },
	strength: { type: 'number', min: 0, max: 1, default: 1, flags: ['restart'] },
}
