export interface NotchbankOptions {
  /** sample rate, Hz, default 44100 */
  fs?: number
  /** pooled notch slots, default 12 */
  size?: number
  /** notch Q (sharpness), default 30 */
  Q?: number
  /** @deprecated former name of `Q` */
  q?: number
  /** dB cut applied per `deploy` call, default -9 */
  depth?: number
  /** dB, deepest a single notch can reach, default -24 */
  maxDepth?: number
  /** samples, coefficient morph length on every deploy/deepen (click-free), default 256 */
  ramp?: number
  /** slots made, the most `cfg[2]` may put in use, default `size` */
  slots?: number
}

/** A single active (or inactive) notch slot's public state. */
export interface Notch {
  /** Hz */
  freq: number
  /** dB, current cut depth (negative) */
  gain: number
}

export interface NotchbankInstance {
  /** Apply the currently active notch cuts to `chunk` in place. Returns `chunk`. */
  process(chunk: Float32Array): Float32Array
  /** Activate a notch at `freq` (or deepen it, up to `maxDepth`, if one is already active near that frequency). Steals the shallowest slot when the pool is full. */
  deploy(freq: number): void
  /** Currently active notches. */
  notches(): Notch[]
  /** Apply the cuts to chunk[from..to) in place (allocation-free). */
  run(chunk: Float32Array | Float64Array, from: number, to: number): void
  /** Read `cfg` anew: a changed Q morphs the active notches to their new shape, slots past the count in use morph flat and go. */
  retune(): void
  /** [Q, dB cut per deploy, slots in use]: write between calls, then `retune()` */
  cfg: Float64Array
}

/** Zero-latency (pure IIR) pooled notch bank for the direct signal path. */
export default function notchbank(options?: NotchbankOptions): NotchbankInstance
