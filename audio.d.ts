export interface DefeedbackContext {
  sampleRate: number
  maxChannels?: number
  params: { notches: Float32Array; q: Float32Array; strength: Float32Array }
}
export const defeedback: {
  (ctx: DefeedbackContext): (inputs: Float32Array[][], outputs: Float32Array[][]) => void
  channels: 'any'
  params: Record<'notches' | 'q' | 'strength', {
    type: 'number'; min: number; max: number; default: number
    step?: number; curve?: string; flags: string[]
  }>
}
