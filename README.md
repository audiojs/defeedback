# @audio/defeedback

> Adaptive feedback (howling) suppression — live-sound AFS class, **zero-latency direct path**.

| Package | What |
|---|---|
| `@audio/defeedback-analyzer` | spectral peaks + PNPR/PHPR howl criteria, parabolic freqs, relational harmonic gate (Waterschoot & Moonen 2011) |
| `@audio/defeedback-tracker` | persistence/stability/growth gating — the music discriminator |
| `@audio/defeedback-notchbank` | ≤12 pooled narrow IIR cuts, click-free coefficient morphing, deepen-on-redeploy |

The umbrella exports a streaming factory: `defeedback({fs, strength}) → {process(chunk), notches()}`. The audio path is pure IIR notches (0 samples latency); detection runs on the **post-notch** signal in parallel, so an insufficient notch deepens itself.

Verified by tests: a growing howl over music is suppressed ≥12 dB while the music stays ±1 dB; harmonic-rich tones deploy zero notches; and a **closed electro-acoustic loop simulation** (resonant room, loop gain > 1) runs away without the suppressor and stays bounded with it inline.

Design notes: detection must catch the howl pre-saturation (a clipped howl grows harmonics and reads as musical — same physics limits every AFS). Alpha Labs DeFeedback-class ML suppression (speech-trained model) is a different lane — see `@audio/neural`.
