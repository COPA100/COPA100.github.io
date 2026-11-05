// Starts building the terrain the moment the page loads, before the 3D bundle has even arrived,
// so the mountain is ready as early as possible. The scene picks the result up from here.
import { quality } from '../lib/tier'
import { buildCoarse, buildStrip, type Buffers } from './build'
import TerrainWorker from './terrain.worker.ts?worker'

export type TerrainBuffers = { coarse: Buffers; strip: Buffers; ms: number }

function part(name: 'coarse' | 'strip') {
  return new Promise<{ b: Buffers; ms: number }>((resolve, reject) => {
    const w = new TerrainWorker()
    w.onmessage = (e) => {
      resolve(e.data)
      w.terminate()
    }
    w.onerror = reject
    w.postMessage({ part: name, segments: quality.segments, step: quality.stripStep, cols: quality.stripCols })
  })
}

export const terrainJob: Promise<TerrainBuffers> = Promise.all([part('coarse'), part('strip')])
  .then(([c, s]) => ({ coarse: c.b, strip: s.b, ms: Math.max(c.ms, s.ms) }))
  .catch(() => ({ coarse: buildCoarse(quality.segments), strip: buildStrip(quality.stripStep, quality.stripCols), ms: 0 }))
