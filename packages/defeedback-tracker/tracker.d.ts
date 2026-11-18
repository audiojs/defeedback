export interface TrackerOptions {
  /** consecutive confirming updates before a track reports, default 3 */
  minFrames?: number
  /** dB, min peak-to-neighbor-power ratio to admit a candidate, default 18 */
  pnpr?: number
  /** dB, min peak-to-harmonic-power ratio to admit a candidate, default 15 */
  phpr?: number
  /** relative frequency tolerance for matching a candidate to an existing track, default 0.02 */
  freqTol?: number
  /** dB/frame, minimum trend to keep reporting (rejects decaying tones), default -3 */
  growth?: number
}

/** Minimal candidate shape consumed by `update` (matches `@audio/defeedback-analyzer`'s output; extra fields such as `kc` are ignored). */
export interface TrackerCandidate {
  freq: number
  level: number
  pnpr: number
  phpr: number
}

/** A confirmed howl trajectory. */
export interface ConfirmedHowl {
  freq: number
  level: number
}

export interface TrackerInstance {
  /** Feed one hop's analyzer candidates. Returns confirmed, persistent, non-decaying howls. */
  update(candidates: TrackerCandidate[]): ConfirmedHowl[]
  /** Clear all tracked trajectories. */
  reset(): void
}

/** Stateful factory — turns per-frame candidates into confirmed howl trajectories (persistence + stability + narrowness gating). */
export default function tracker(options?: TrackerOptions): TrackerInstance

/** The tracks in typed arrays, room for `cap`, for `updateInto` (allocation-free): `n` tracks; the last update's
 *  confirmed howls, `h` of them, in `hf` (Hz) and `hl` (dB); `cfg` = [minFrames, pnpr, phpr, freqTol, growth]. */
export interface Tracks { n: number; h: number; hf: Float64Array; hl: Float64Array; cfg: Float64Array }
export function tracks(options?: TrackerOptions, cap?: number): Tracks
/** One hop's candidates (`{ n, freq, level, pnpr, phpr }`, as the analyzer's `candidates`) into the tracks. */
export function updateInto(T: Tracks, c: { n: number; freq: ArrayLike<number>; level: ArrayLike<number>; pnpr: ArrayLike<number>; phpr: ArrayLike<number> }): void
