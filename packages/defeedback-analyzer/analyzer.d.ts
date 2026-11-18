export interface AnalyzerOptions {
  /** sample rate, Hz, default 44100 */
  fs?: number
  /** max peaks returned, default 6 */
  maxCandidates?: number
  /** dB, ignore peaks below this level, default -70 */
  floor?: number
}

/** One detected spectral-peak candidate. */
export interface FeedbackCandidate {
  /** Hz, parabolically-refined peak frequency (~0.1% accurate) */
  freq: number
  /** dBFS, rough peak level */
  level: number
  /** dB, peak-to-neighboring-power ratio (van Waterschoot & Moonen 2011) — feedback reads far narrower than music */
  pnpr: number
  /** dB, peak-to-harmonic-power ratio — a bare howl carries no 2nd/3rd harmonic, a musical tone does */
  phpr: number
  /** fractional FFT bin index of the peak */
  kc: number
}

/** Analyze one power-of-2 analysis window (Hann-windowed internally). Returns up to `maxCandidates` peaks, strongest first, after the relational-harmonic gate drops musical overtones. */
export default function analyze(data: Float32Array, options?: AnalyzerOptions): FeedbackCandidate[]

/** The candidates of a window of `n` samples in typed arrays, for `analyzeInto` (allocation-free): `n` of them, strongest
 *  first, `freq`, `level`, `pnpr`, `phpr`, `kc` at each index; `cfg` = [fs, maxCandidates, floor]. */
export interface Candidates { n: number; cfg: Float64Array; freq: Float64Array; level: Float64Array; pnpr: Float64Array; phpr: Float64Array; kc: Float64Array }
export function candidates(n: number): Candidates
/** `analyze` into `c` (made by `candidates(data.length)`), allocating nothing. */
export function analyzeInto(data: Float32Array, c: Candidates): void
