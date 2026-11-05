// The road, in road space. Everything placed along the climb asks this module where it is.
// Shared by the main thread and the terrain worker, so it must stay free of DOM and three.js.

import { HAIRPIN_S, LEAD_S, ROAD_PTS } from './roadData.ts'
import { noise } from './ascentTerrain.ts'
import { SUMMIT, natural } from './terrain.ts'

const N = ROAD_PTS.length / 3
const PX = new Float64Array(N)
const PZ = new Float64Array(N)
const PY = new Float64Array(N)
const CS = new Float64Array(N) // arc length
const TH = new Float64Array(N) // heading
for (let i = 0; i < N; i++) {
  PX[i] = ROAD_PTS[i * 3]
  PZ[i] = ROAD_PTS[i * 3 + 1]
  PY[i] = ROAD_PTS[i * 3 + 2]
  if (i) CS[i] = CS[i - 1] + Math.hypot(PX[i] - PX[i - 1], PZ[i] - PZ[i - 1])
}
for (let i = 0; i < N; i++) {
  const a = Math.max(0, i - 1)
  const b = Math.min(N - 1, i + 1)
  // forward = (sin h, -cos h)
  TH[i] = Math.atan2(PX[b] - PX[a], -(PZ[b] - PZ[a]))
}
// Unwrap so headings interpolate without jumps.
for (let i = 1; i < N; i++) {
  while (TH[i] - TH[i - 1] > Math.PI) TH[i] -= Math.PI * 2
  while (TH[i] - TH[i - 1] < -Math.PI) TH[i] += Math.PI * 2
}

export const ROAD_LEN = CS[N - 1]
export const START_S = LEAD_S
export const END_S = ROAD_LEN

/** Arc length of each hairpin apex, refined to the point of tightest turn. */
export const HAIRPINS = HAIRPIN_S.map((guess) => {
  let best = guess
  let bestK = 0
  for (let s = guess - 60; s <= guess + 60; s += 2) {
    const k = Math.abs(headingAt(s + 4) - headingAt(s - 4))
    if (k > bestK) {
      bestK = k
      best = s
    }
  }
  return best
})

function idx(s: number) {
  const t = Math.min(ROAD_LEN - 1e-6, Math.max(0, s))
  // Points are close to evenly spaced, so start from a guess and walk.
  let i = Math.min(N - 2, Math.floor((t / ROAD_LEN) * (N - 1)))
  while (i > 0 && CS[i] > t) i--
  while (i < N - 2 && CS[i + 1] < t) i++
  const u = (t - CS[i]) / (CS[i + 1] - CS[i] || 1)
  return [i, u] as const
}

export function headingAt(s: number) {
  const [i, u] = idx(s)
  return TH[i] + (TH[i + 1] - TH[i]) * u
}

export type Frame = { x: number; y: number; z: number; tx: number; tz: number; rx: number; rz: number; heading: number; grade: number }
export const frame = (): Frame => ({ x: 0, y: 0, z: 0, tx: 0, tz: -1, rx: 1, rz: 0, heading: 0, grade: 0 })

export function sample(s: number, out: Frame = frame()): Frame {
  const [i, u] = idx(s)
  const h = TH[i] + (TH[i + 1] - TH[i]) * u
  out.x = PX[i] + (PX[i + 1] - PX[i]) * u
  out.z = PZ[i] + (PZ[i + 1] - PZ[i]) * u
  out.y = PY[i] + (PY[i + 1] - PY[i]) * u
  out.grade = (PY[i + 1] - PY[i]) / (CS[i + 1] - CS[i] || 1)
  out.heading = h
  out.tx = Math.sin(h)
  out.tz = -Math.cos(h)
  out.rx = Math.cos(h)
  out.rz = Math.sin(h)
  if (s > ROAD_LEN) {
    out.x += out.tx * (s - ROAD_LEN)
    out.z += out.tz * (s - ROAD_LEN)
  }
  return out
}

export const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Road half-widths. The right side opens into the overlook lay-by at the very top.
export const HALF = 3.7
export const halfLeft = (_s: number) => HALF + 0.6
export const halfRight = (s: number) => HALF + 0.6 + 7.5 * sm(END_S - 120, END_S - 55, s)

// The car keeps to the right lane, then pulls off into the lay-by and swings to face the view.
export const carLateral = (s: number) => 1.85 + 5.0 * sm(END_S - 95, END_S - 40, s)
export const carYaw = (s: number) => 1.4 * sm(END_S - 78, END_S - 30, s)
export const PARK_S = END_S - 34

// ---- Nearest point on the road, via a coarse grid of segments ----

const CELL = 40
const grid = new Map<number, number[]>()
let minX = Infinity
let minZ = Infinity
for (let i = 0; i < N; i++) {
  minX = Math.min(minX, PX[i])
  minZ = Math.min(minZ, PZ[i])
}
minX -= 400
minZ -= 400
const key = (cx: number, cz: number) => cx * 4096 + cz
for (let i = 0; i < N - 1; i++) {
  const cx = Math.floor((PX[i] - minX) / CELL)
  const cz = Math.floor((PZ[i] - minZ) / CELL)
  const k = key(cx, cz)
  const list = grid.get(k)
  if (list) list.push(i)
  else grid.set(k, [i])
}

export type Near = { d: number; lat: number; s: number; y: number; past: number }
const near: Near = { d: Infinity, lat: 0, s: 0, y: 0, past: 0 }

/** Closest road point within `reach` metres, or d = Infinity. Returns a shared object. */
export function nearest(x: number, z: number, reach = 80): Near {
  near.d = Infinity
  const r = Math.ceil(reach / CELL)
  const cx = Math.floor((x - minX) / CELL)
  const cz = Math.floor((z - minZ) / CELL)
  let best = Infinity
  let bi = -1
  let bu = 0
  for (let a = -r; a <= r; a++) {
    for (let b = -r; b <= r; b++) {
      const list = grid.get(key(cx + a, cz + b))
      if (!list) continue
      for (let n = 0; n < list.length; n++) {
        const i = list[n]
        const ex = PX[i + 1] - PX[i]
        const ez = PZ[i + 1] - PZ[i]
        const l2 = ex * ex + ez * ez || 1
        const u = Math.max(0, Math.min(1, ((x - PX[i]) * ex + (z - PZ[i]) * ez) / l2))
        const dx = x - (PX[i] + ex * u)
        const dz = z - (PZ[i] + ez * u)
        const d2 = dx * dx + dz * dz
        if (d2 < best) {
          best = d2
          bi = i
          bu = u
        }
      }
    }
  }
  if (bi < 0 || best > reach * reach) return near
  const h = TH[bi] + (TH[bi + 1] - TH[bi]) * bu
  const px = PX[bi] + (PX[bi + 1] - PX[bi]) * bu
  const pz = PZ[bi] + (PZ[bi + 1] - PZ[bi]) * bu
  near.d = Math.sqrt(best)
  near.lat = (x - px) * Math.cos(h) + (z - pz) * Math.sin(h)
  near.s = CS[bi] + (CS[bi + 1] - CS[bi]) * bu
  near.y = PY[bi] + (PY[bi + 1] - PY[bi]) * bu
  // Beyond either end of the road, distance along it counts too, or the bench runs on forever.
  const capped = (bi === N - 2 && bu >= 1) || (bi === 0 && bu <= 0)
  near.past = capped ? Math.sqrt(Math.max(0, best - near.lat * near.lat)) : 0
  return near
}

/**
 * Spurs and gullies running straight down the flanks. The base massif is a smooth envelope, which
 * reads as a pyramid from low wide shots; this breaks its side faces and silhouette into ridges.
 * The road only uses the switchback face (bearings ~135-270 from the summit) and a ring near the
 * top (probe: scripts/probe-road.ts), so the relief stays off both, and the generated road and its
 * bench are untouched.
 */
const FACE = (202 * Math.PI) / 180
export function relief(x: number, z: number) {
  const dx = x - SUMMIT.x
  const dz = z - SUMMIT.z
  const r = Math.hypot(dx, dz)
  // Bearings ~25-125 carry no road at all, so the ridges there can climb almost to the peak.
  const brg = Math.atan2(dx, dz)
  const ne = sm(0.35, 0.6, brg) * (1 - sm(2.0, 2.2, brg))
  const radial = (ne * sm(70, 200, r) + (1 - ne) * sm(250, 460, r)) * (1 - sm(1300, 1900, r))
  if (radial <= 0) return 0
  let d = brg - FACE
  d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)))
  const k = radial * sm(1.27, 1.62, d)
  if (k <= 0) return 0
  const c = dx / r
  const s = dz / r
  const t = r * 0.0011
  // Sampled round a circle, so the pattern varies with bearing: crests run downhill and twist a little.
  const a = 1 - Math.abs(noise(c * 2.6 + t, s * 2.6 - t * 0.6)) * 2
  const b = 1 - Math.abs(noise(c * 6.1 - t * 1.4 + 11, s * 6.1 + t + 5)) * 2
  // Taller towards the shoulders, settling out onto the plain.
  const amp = 1 - sm(500, 1600, r) * 0.6
  return k * amp * (125 * a * a + 40 * b - 55)
}

const SHOULDER = 1.1

/** Ground height with the road benched into the mountain: cuts above, fills below. */
export function groundAt(x: number, z: number) {
  const r = nearest(x, z, 70)
  if (r.d === Infinity) return natural(x, z) + relief(x, z)
  const n = natural(x, z) + relief(x, z) * sm(18, 66, r.d)
  const half = r.lat >= 0 ? halfRight(r.s) : halfLeft(r.s)
  // A shoulder: the ground holds at the road bed for a metre past the edge before the cut or
  // fill starts, so the terrain mesh, sampled on its own grid, can never rise through the edge.
  const out = Math.max(Math.abs(r.lat) - half - SHOULDER, r.past)
  const bed = r.y - 0.14
  const gap = Math.abs(n - bed)
  // Cuts and fills about 1:1, so the bench reads as engineering, not a cliff or an apron.
  const reach = Math.min(60, 3 + gap * (n < bed ? 1.0 : 1.1))
  const w = 1 - sm(0, reach, out)
  return n + (bed - n) * w
}

/** Distance to the road, for the worker to sink coarse terrain under the fine strip. */
export const roadDistance = (x: number, z: number) => nearest(x, z, 80).d

export const ROAD_POINTS = { PX, PZ, PY, CS, N }
