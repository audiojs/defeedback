import type { AnalyzerOptions } from '@audio/defeedback-analyzer'
import type { TrackerOptions } from '@audio/defeedback-tracker'
import type { NotchbankOptions, Notch } from '@audio/defeedback-notchbank'
export { default as analyze } from '@audio/defeedback-analyzer'
export { default as tracker } from '@audio/defeedback-tracker'
export { default as notchbank } from '@audio/defeedback-notchbank'
export type { AnalyzerOptions, FeedbackCandidate } from '@audio/defeedback-analyzer'
export type { TrackerOptions, TrackerCandidate, TrackerInstance, ConfirmedHowl } from '@audio/defeedback-tracker'
export type { NotchbankOptions, NotchbankInstance, Notch } from '@audio/defeedback-notchbank'
export interface DefeedbackOptions extends AnalyzerOptions, TrackerOptions, NotchbankOptions {
  window?: number
  hop?: number
  maxNotches?: number
  strength?: number
}
export interface DefeedbackInstance {
  /** Process any block size in place. */
  process<T extends Float32Array | Float64Array>(chunk: T): T
  notches(): Notch[]
  /** Clear detection tracks; active notch filters and sample history are retained. */
  reset(): void
}
export default function defeedback(options?: DefeedbackOptions): DefeedbackInstance
