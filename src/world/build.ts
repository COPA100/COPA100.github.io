// Mesh builders for the terrain worker. Plain arrays only, so they also run on the main thread.
import { END_S, groundAt, nearest, sample, frame } from './road.ts'
import { SUMMIT } from './terrain.ts'

export type Buffers = { position: Float32Array; normal: Float32Array; index: Uint32Array }

export const STRIP_W = 64

/** The whole massif on a warped grid: dense at the centre, sparse at the horizon. */
export function buildCoarse(segments: number, extent = 4200, warp = 1.42): Buffers {
  const n = segments + 1
  const ax = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const s = (i / segments) * 2 - 1
    ax[i] = Math.sign(s) * Math.pow(Math.abs(s), warp) * extent
  }
  const position = new Float32Array(n * n * 3)
  for (let j = 0, k = 0; j < n; j++) {
    for (let i = 0; i < n; i++, k += 3) {
      const x = SUMMIT.x + ax[i]
      const z = SUMMIT.z + ax[j]
      let y = groundAt(x, z)
      // Sink under the fine road strip so the coarse facets never poke through it.
      const d = nearest(x, z, STRIP_W + 4).d
      if (d < STRIP_W) y -= 4 * (1 - smooth(STRIP_W - 16, STRIP_W - 3, d))
      position[k] = x
      position[k + 1] = y
      position[k + 2] = z
    }
  }
  const normal = new Float32Array(n * n * 3)
  for (let j = 0; j < n; j++) {
    const j0 = Math.max(0, j - 1)
    const j1 = Math.min(n - 1, j + 1)
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1)
      const i1 = Math.min(n - 1, i + 1)
      const hx = (position[(j * n + i1) * 3 + 1] - position[(j * n + i0) * 3 + 1]) / (ax[i1] - ax[i0])
      const hz = (position[(j1 * n + i) * 3 + 1] - position[(j0 * n + i) * 3 + 1]) / (ax[j1] - ax[j0])
      const l = 1 / Math.hypot(hx, 1, hz)
      const k = (j * n + i) * 3
      normal[k] = -hx * l
      normal[k + 1] = l
      normal[k + 2] = -hz * l
    }
  }
  const index = new Uint32Array(segments * segments * 6)
  for (let j = 0, k = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++, k += 6) {
      const a = j * n + i
      index.set([a, a + n, a + 1, a + 1, a + n, a + n + 1], k)
    }
  }
  return { position, normal, index }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A fine ribbon of ground either side of the road, where the headlights actually land. */
export function buildStrip(step: number, cols: number): Buffers {
  // Cross offsets: dense at the road edges, opening out towards the strip edge.
  const half: number[] = []
  for (let c = 0; c <= cols; c++) half.push(Math.pow(c / cols, 1.7) * STRIP_W)
  const offs = [...half.slice(1).reverse().map((v) => -v), ...half]
  const m = offs.length
  const rows = Math.floor(END_S / step) + 1
  const position = new Float32Array(rows * m * 3)
  const normal = new Float32Array(rows * m * 3)
  const f = frame()
  const e = 0.8
  for (let r = 0; r < rows; r++) {
    sample(Math.min(END_S, r * step), f)
    for (let c = 0; c < m; c++) {
      const k = (r * m + c) * 3
      const x = f.x + f.rx * offs[c]
      const z = f.z + f.rz * offs[c]
      position[k] = x
      // The outermost column turns down into a skirt, so the strip's edge tucks under the coarse
      // mountain instead of standing proud of it as a ledge.
      position[k + 1] = groundAt(x, z) - (c === 0 || c === m - 1 ? 6 : 0)
      position[k + 2] = z
      const hx = (groundAt(x + e, z) - groundAt(x - e, z)) / (2 * e)
      const hz = (groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e)
      const l = 1 / Math.hypot(hx, 1, hz)
      normal[k] = -hx * l
      normal[k + 1] = l
      normal[k + 2] = -hz * l
    }
  }
  // On the inside of a tight bend the cross-sections overlap, and the ribbon folds back over
  // itself: those triangles come out flipped and stretched, standing up as panels across the road
  // or vanishing from behind. Keep only triangles that face the same way as an unfolded strip and
  // aren't stretched far beyond their neighbours.
  const tri: number[] = []
  const ok = (i: number, j: number, k: number) => {
    const ax = position[i * 3], az = position[i * 3 + 2]
    const bx = position[j * 3] - ax, bz = position[j * 3 + 2] - az
    const cx = position[k * 3] - ax, cz = position[k * 3 + 2] - az
    // Facing: an unfolded strip triangle winds one consistent way in plan view.
    if (bz * cx - bx * cz <= 0.02) return false
    const l2 = (x: number, z: number) => x * x + z * z
    const longest = Math.max(l2(bx, bz), l2(cx, cz), l2(cx - bx, cz - bz))
    return longest < 70 * 70
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < m - 1; c++) {
      const a = r * m + c
      if (ok(a, a + 1, a + m)) tri.push(a, a + 1, a + m)
      if (ok(a + 1, a + m + 1, a + m)) tri.push(a + 1, a + m + 1, a + m)
    }
  }
  return { position, normal, index: new Uint32Array(tri) }
}
