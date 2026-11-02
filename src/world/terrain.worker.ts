import { buildCoarse, buildStrip } from './build.ts'

self.onmessage = (e: MessageEvent<{ segments: number; step: number; cols: number }>) => {
  const t0 = performance.now()
  const strip = buildStrip(e.data.step, e.data.cols)
  const coarse = buildCoarse(e.data.segments)
  const ms = performance.now() - t0
  const list = [coarse.position, coarse.normal, coarse.index, strip.position, strip.normal, strip.index].map((a) => a.buffer)
  ;(self as unknown as Worker).postMessage({ coarse, strip, ms }, list)
}
