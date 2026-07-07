# @audio/defeedback

> Adaptive feedback (howling) suppression for live sound. All planned — and newly cheap.

| Package | What | Builds on |
|---|---|---|
| `@audio/defeedback-analyzer` | spectral peak + howl criteria (PHPR/PNPR) | `fourier-transform`, `@audio/spectral-crest`/`-flux` |
| `@audio/defeedback-tracker` | trajectory + growth rate, music discrimination | new (~150 lines) |
| `@audio/defeedback-notchbank` | ≤12 pooled notches, Q 30–50, −6…−12 dB, click-free interpolation | `@audio/filter-biquad` notch coefs |

Loop: analyze → track → deploy/release notches (site-todo design). **Offline MVP is a composition exercise now** — every DSP primitive exists; the genuinely new code is the tracker and coefficient interpolation. Real-time (mic→Dante→speakers) waits on the audio-module worklet contract. Reference: van Waterschoot & Moonen, "Fifty years of acoustic feedback control" (2011).
