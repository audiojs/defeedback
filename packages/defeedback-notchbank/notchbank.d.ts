export interface NotchbankOptions {
  /** sample rate, Hz, default 44100 */
  fs?: number
  /** pooled notch slots, default 12 */
  size?: number
  /** notch Q (sharpness), default 30 */
  q?: number
  /** dB cut applied per `deploy` call, default -9 */
  depth?: number
  /** dB, deepest a single notch can reach, default -24 */
  maxDepth?: number
  /** samples, coefficient morph length on every deploy/deepen (click-free), default 256 */
  ramp?: number
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
}

/** Zero-latency (pure IIR) pooled notch bank for the direct signal path. */
export default function notchbank(options?: NotchbankOptions): NotchbankInstance
