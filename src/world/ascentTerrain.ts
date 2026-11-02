// Pure procedural terrain. Shared by the worker (mesh) and the main thread (camera, route).

const perm = new Uint8Array(512)
{
  // Small seeded shuffle so the mountain is identical on every load.
  const p = Array.from({ length: 256 }, (_, i) => i)
  let seed = 417
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807) % 2147483647
    const j = seed % (i + 1)
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
}

const GX = [1, -1, 1, -1, 1.41, -1.41, 0, 0]
const GY = [1, 1, -1, -1, 0, 0, 1.41, -1.41]

export function noise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const X = xi & 255
  const Y = yi & 255
  const aa = perm[perm[X] + Y] & 7
  const ab = perm[perm[X] + Y + 1] & 7
  const ba = perm[perm[X + 1] + Y] & 7
  const bb = perm[perm[X + 1] + Y + 1] & 7
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const n00 = GX[aa] * fx + GY[aa] * fy
  const n10 = GX[ba] * (fx - 1) + GY[ba] * fy
  const n01 = GX[ab] * fx + GY[ab] * (fy - 1)
  const n11 = GX[bb] * (fx - 1) + GY[bb] * (fy - 1)
  const a = n00 + (n10 - n00) * u
  const b = n01 + (n11 - n01) * u
  return a + (b - a) * v
}

function fbm(x: number, y: number, oct: number) {
  let sum = 0
  let amp = 0.5
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(x, y)
    x = x * 2.03 + 17.1
    y = y * 2.03 - 9.3
    amp *= 0.5
  }
  return sum
}

/** Ridged multifractal, roughly 0..1: sharp crests, smooth valleys. */
function ridged(x: number, y: number, oct: number) {
  let sum = 0
  let amp = 0.55
  let weight = 1
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noise(x, y)) * 1.7
    if (n < 0) n = 0
    n *= n
    sum += n * amp * weight
    weight = Math.min(1, n * 1.8)
    x = x * 2.07 + 31.7
    y = y * 2.07 - 11.9
    amp *= 0.44
  }
  return sum
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Neighbouring massifs, so the horizon is a range and not one lonely cone. [x, z, height, radius]
const RANGE: [number, number, number, number][] = [
  [-640, -520, 250, 250],
  [720, -640, 300, 280],
  [-1050, 40, 190, 300],
  [1120, 90, 230, 300],
  [80, -1150, 340, 420],
  [-620, 560, 92, 170],
  [660, 620, 110, 190],
  [-1300, -900, 260, 340],
  [1400, -1000, 280, 360],
]

export const TP = { r0: 260, k: 1.0, a: 290, b: 110, c: 130 }

export function heightAt(x: number, z: number) {
  const wx = x + 78 * noise(x * 0.0027 + 3.1, z * 0.0027 - 7.2) + 10 * noise(x * 0.012 + 40, z * 0.012)
  const wz = z + 78 * noise(x * 0.0027 - 11.7, z * 0.0027 + 5.4) + 10 * noise(x * 0.012, z * 0.012 + 70)
  const r = Math.hypot(wx, wz)
  const a = Math.atan2(wz, wx)

  // Broad lobes around the massif, so it isn't a perfect cone. Low contrast on purpose:
  // anything sharper converges at the peak into needle-like fins.
  const lobes = noise(Math.cos(a) * 1.1 + 9.3, Math.sin(a) * 1.1 + 2.1)
  const arms = 1 + 0.42 * lobes * smooth(20, 170, r)

  const rm = ridged(wx * 0.0038 + 5, wz * 0.0038 - 3, 5)
  const shoulders = ridged(wx * 0.0017 + 21, wz * 0.0017 + 8, 3)
  const env = Math.pow(1 / (1 + (r / TP.r0) * (r / TP.r0)), TP.k)

  let h = TP.a * env * arms + TP.b * env * shoulders + TP.c * Math.pow(env, 0.8) * rm * smooth(0, 70, r + 30)

  for (let i = 0; i < RANGE.length; i++) {
    const p = RANGE[i]
    const d = Math.hypot(wx - p[0], wz - p[1])
    const e = Math.exp(-Math.pow(d / p[3], 1.35))
    if (e > 0.002) h += p[2] * e * (0.55 + 0.7 * rm)
  }

  h += 14 + 18 * fbm(x * 0.003 + 12, z * 0.003 + 4, 2) + 8 * rm * smooth(200, 900, r)
  return Math.max(0, h)
}

export function findSummit() {
  let bx = 0
  let bz = 0
  let bh = -1
  let step = 40
  for (let pass = 0; pass < 4; pass++) {
    const cx = bx
    const cz = bz
    for (let i = -6; i <= 6; i++) {
      for (let j = -6; j <= 6; j++) {
        const x = cx + i * step
        const z = cz + j * step
        const h = heightAt(x, z)
        if (h > bh) {
          bh = h
          bx = x
          bz = z
        }
      }
    }
    step /= 5
  }
  return { x: bx, z: bz, h: bh }
}

export type TerrainBuffers = { position: Float32Array; normal: Float32Array; index: Uint32Array }

export function buildTerrain(segments: number, extent = 2000, warp = 1.38): TerrainBuffers {
  const n = segments + 1
  const axis = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const s = (i / segments) * 2 - 1
    axis[i] = Math.sign(s) * Math.pow(Math.abs(s), warp) * extent
  }

  const position = new Float32Array(n * n * 3)
  for (let j = 0, k = 0; j < n; j++) {
    for (let i = 0; i < n; i++, k += 3) {
      position[k] = axis[i]
      position[k + 1] = heightAt(axis[i], axis[j])
      position[k + 2] = axis[j]
    }
  }

  const normal = new Float32Array(n * n * 3)
  for (let j = 0; j < n; j++) {
    const j0 = Math.max(0, j - 1)
    const j1 = Math.min(n - 1, j + 1)
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1)
      const i1 = Math.min(n - 1, i + 1)
      const dx = axis[i1] - axis[i0]
      const dz = axis[j1] - axis[j0]
      const hx = (position[(j * n + i1) * 3 + 1] - position[(j * n + i0) * 3 + 1]) / dx
      const hz = (position[(j1 * n + i) * 3 + 1] - position[(j0 * n + i) * 3 + 1]) / dz
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
      const b = a + 1
      const c = a + n
      const d = c + 1
      index[k] = a
      index[k + 1] = c
      index[k + 2] = b
      index[k + 3] = b
      index[k + 4] = c
      index[k + 5] = d
    }
  }
  return { position, normal, index }
}
