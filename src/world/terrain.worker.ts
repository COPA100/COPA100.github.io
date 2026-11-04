import { buildCoarse, buildStrip } from './build.ts'

// One part of the mesh per worker, so the two halves build side by side.
self.onmessage = (e: MessageEvent<{ part: 'coarse' | 'strip'; segments: number; step: number; cols: number }>) => {
  const t0 = performance.now()
  const b = e.data.part === 'coarse' ? buildCoarse(e.data.segments) : buildStrip(e.data.step, e.data.cols)
  const ms = performance.now() - t0
  ;(self as unknown as Worker).postMessage({ b, ms }, [b.position.buffer, b.normal.buffer, b.index.buffer])
}
