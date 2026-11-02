// The film's shot list. Scroll position, in viewport heights, drives road distance, camera and
// the light. Plateaus in the drive table are where a sign is held for reading.

import { END_S, HAIRPINS, PARK_S, START_S, sm } from './road.ts'
import { MARKER_S, holdS } from './signs.ts'
import { SUMMIT } from './terrain.ts'

export const TRACK_VH = 1230 // document height in vh; scrollable range is this minus one screen
export const END_VH = TRACK_VH - 100

const A = HAIRPINS
// Holds: [start vh, end vh] where a project sign is read.
export const HOLDS: [number, number][] = [
  [118, 196],
  [272, 350],
  [426, 504],
  [580, 658],
]
export const MARKER_VH = [790, 880]
export const OPEN_VH = 10
export const OVERLOOK_VH = [985, 1015] as const
export const MAP_VH = [1050, END_VH] as const

// [scroll vh, car position on the road in metres]
const holdA = (i: number) => holdS(i)[0]
const holdB = (i: number) => holdS(i)[1]
const DRIVE: [number, number][] = [
  [0, START_S],
  [OPEN_VH, START_S + 0.3],
  [44, START_S + 120],
  [HOLDS[0][0], holdA(0)],
  [HOLDS[0][1], holdB(0)],
  [HOLDS[1][0], holdA(1)],
  [HOLDS[1][1], holdB(1)],
  [HOLDS[2][0], holdA(2)],
  [HOLDS[2][1], holdB(2)],
  [HOLDS[3][0], holdA(3)],
  [HOLDS[3][1], holdB(3)],
  [700, A[3] + 70],
  [MARKER_VH[0] - 22, MARKER_S[0] - 8],
  [MARKER_VH[0] + 22, MARKER_S[0] + 8],
  [MARKER_VH[1] - 22, MARKER_S[1] - 8],
  [MARKER_VH[1] + 22, MARKER_S[1] + 8],
  [OVERLOOK_VH[0], PARK_S - 1.2],
  [OVERLOOK_VH[1], PARK_S],
  [END_VH, PARK_S],
]

// Monotone cubic (Fritsch-Carlson), so the car never reverses between keyframes.
function monotone(keys: [number, number][]) {
  const n = keys.length
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]))
  const m = [d[0]]
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]))
  m.push(d[n - 2])
  return (x: number) => {
    if (x <= keys[0][0]) return keys[0][1]
    if (x >= keys[n - 1][0]) return keys[n - 1][1]
    let i = 0
    while (keys[i + 1][0] < x) i++
    const [x0, y0] = keys[i]
    const [x1, y1] = keys[i + 1]
    const h = x1 - x0
    const t = (x - x0) / h
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1]
  }
}

export const roadAt = monotone(DRIVE)
void END_S

// ---- Camera ----

export type Env = { amb: number; ember: number; fogN: number; fogF: number; map: number }
export type Shot =
  | { k: 'chase'; az: number; r: number; h: number; look: number; lookH: number; fov: number; lat?: number; env: Env }
  | { k: 'hold'; sign: number; back: number; up: number; lat: number; fov: number; aim: number; env: Env }
  | { k: 'orbit'; th: number; r: number; y: number; lookY: number; fov: number; env: Env }
  | { k: 'fixed'; pos: [number, number, number]; tgt: [number, number, number]; fov: number; env: Env }
  | { k: 'side'; dist: number; h: number; lead: number; aimH: number; fov: number; env: Env }
  | { k: 'overlook'; back: number; h: number; side: number; ahead: number; aimH: number; fov: number; env: Env }
  | { k: 'top'; h: number; fov: number; env: Env }
  | { k: 'opening'; fov: number; env: Env }

const DRIVE_ENV: Env = { amb: 0.52, ember: 0, fogN: 500, fogF: 2400, map: 0 }
const HOLD_ENV: Env = { amb: 0.5, ember: 0, fogN: 500, fogF: 2600, map: 0 }
const WIDE_ENV: Env = { amb: 0.46, ember: 1, fogN: 2400, fogF: 6400, map: 0 }
const OVER_ENV: Env = { amb: 0.56, ember: 0, fogN: 1800, fogF: 7000, map: 0 }
const MAP_ENV: Env = { amb: 0.72, ember: 0, fogN: 9000, fogF: 12000, map: 1 }

const chase = (fov: number, o: Partial<Extract<Shot, { k: 'chase' }>> = {}): Shot => ({
  k: 'chase', az: 8, r: 11, h: 3.2, look: 30, lookH: -2, fov, env: DRIVE_ENV, ...o,
})
const hold = (sign: number, back: number, fov: number, lat = 2.2): Shot => ({ k: 'hold', sign, back, up: 1.3, lat, fov, aim: 0, env: HOLD_ENV })
const fixed = (pos: [number, number, number], tgt: [number, number, number], fov: number): Shot => ({ k: 'fixed', pos, tgt, fov, env: WIDE_ENV })

export type Key = [number, Shot]

export function keys(portrait: boolean): Key[] {
  const P = portrait
  const cf = P ? 58 : 40 // chase fov
  const hf = P ? 24 : 17 // hold fov, telephoto
  return [
    [0, { k: 'opening', fov: P ? 50 : 40, env: { amb: 0.34, ember: 0, fogN: 700, fogF: 3200, map: 0 } }],
    [OPEN_VH, { k: 'opening', fov: P ? 50 : 40, env: { amb: 0.34, ember: 0, fogN: 700, fogF: 3200, map: 0 } }],
    [46, chase(cf, { az: 22, r: 12, h: 4.2 })],
    [80, chase(cf)],
    [HOLDS[0][0] - 8, hold(0, P ? 20 : 30, hf)],
    [HOLDS[0][1], hold(0, P ? 17 : 26, hf)],
    [HOLDS[0][1] + 10, chase(cf, { az: -10 })],
    // Looking down on the massif, so the peak stands against the survey sheet rather than the sky.
    [HOLDS[0][1] + 40, P ? fixed([-1400, 1850, -2300], [0, 560, -40], 46) : fixed([-1250, 1600, -1850], [10, 520, -40], 31)],
    [HOLDS[1][0] - 30, P ? fixed([-1200, 1850, -2400], [40, 560, -40], 46) : fixed([-1060, 1600, -1980], [30, 520, -40], 31)],
    [HOLDS[1][0] - 2, hold(1, P ? 20 : 30, hf)],
    [HOLDS[1][1], hold(1, P ? 17 : 26, hf)],
    [HOLDS[1][1] + 10, chase(cf, { az: 10 })],
    [HOLDS[2][0] - 10, chase(cf, { az: -10, h: 3.2 })],
    [HOLDS[2][0] - 2, hold(2, P ? 20 : 30, hf)],
    [HOLDS[2][1], hold(2, P ? 17 : 26, hf)],
    [HOLDS[2][1] + 10, chase(cf, { az: -10 })],
    [HOLDS[2][1] + 40, P ? fixed([500, 2300, -2700], [60, 560, -100], 44) : fixed([300, 1900, -2300], [60, 560, -100], 28)],
    [HOLDS[3][0] - 30, P ? fixed([700, 2300, -2600], [80, 580, -80], 44) : fixed([480, 1900, -2250], [80, 580, -80], 28)],
    [HOLDS[3][0] - 2, hold(3, P ? 20 : 30, hf)],
    [HOLDS[3][1], hold(3, P ? 17 : 26, hf)],
    [HOLDS[3][1] + 10, chase(cf, { az: 14 })],
    [MARKER_VH[0] - 60, { k: 'side', dist: P ? 17 : 17, h: P ? 1.4 : 1.7, lead: P ? 2.2 : 4.5, aimH: P ? 3.0 : 2.4, fov: P ? 52 : 34, env: HOLD_ENV }],
    [MARKER_VH[1] + 46, { k: 'side', dist: P ? 17 : 17, h: P ? 1.4 : 1.7, lead: P ? 2.2 : 4.5, aimH: P ? 3.0 : 2.4, fov: P ? 52 : 34, env: HOLD_ENV }],
    [OVERLOOK_VH[0] - 50, chase(cf, { az: -8, r: 11, h: 3.4 })],
    // Parked at the top: low behind the car, the high beams running out over the drop.
    // The camera stands off to the left, so the two beams cross the frame out into the dark.
    [OVERLOOK_VH[0], { k: 'overlook', back: P ? 13 : 10, h: P ? 2.6 : 2.3, side: P ? 2.2 : 6.5, ahead: P ? 8 : 17, aimH: P ? -7 : -3, fov: P ? 64 : 46, env: OVER_ENV }],
    [OVERLOOK_VH[1] + 12, { k: 'overlook', back: P ? 13.6 : 10.8, h: P ? 2.8 : 2.5, side: P ? 2.4 : 7, ahead: P ? 8 : 17, aimH: P ? -7 : -3, fov: P ? 64 : 46, env: OVER_ENV }],
    // Then the crane lifts straight up off the car before the map takes over.
    [MAP_VH[0] - 6, { k: 'overlook', back: P ? 20 : 16, h: P ? 95 : 80, side: 6, ahead: 10, aimH: 0, fov: P ? 56 : 40, env: { amb: 0.6, ember: 0, fogN: 1600, fogF: 6400, map: 0 } }],
    [MAP_VH[0] + 40, { k: 'top', h: P ? 3800 : 2300, fov: 40, env: MAP_ENV }],
    [END_VH, { k: 'top', h: P ? 3600 : 2150, fov: 40, env: MAP_ENV }],
  ]
}

/** Smoothstep between two keys, eased harder for the long crane moves. */
export function segmentAt(list: Key[], vh: number) {
  let i = 0
  while (i < list.length - 2 && list[i + 1][0] < vh) i++
  const [a, A] = list[i]
  const [b, B] = list[i + 1]
  const t = Math.min(1, Math.max(0, (vh - a) / (b - a || 1)))
  // Ease in-out, strong, like a camera operator's hands.
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  return { A, B, t: e }
}

// Reduced motion: the camera holds; scenes dissolve between holds instead of flying.
export const CALM: [number, number][] = [
  [0, 40],
  [HOLDS[0][0], HOLDS[0][1]],
  [HOLDS[1][0], HOLDS[1][1]],
  [HOLDS[2][0], HOLDS[2][1]],
  [HOLDS[3][0], HOLDS[3][1]],
  [MARKER_VH[0] - 30, MARKER_VH[0] + 30],
  [MARKER_VH[1] - 30, MARKER_VH[1] + 30],
  [MAP_VH[0] + 40, END_VH + 50],
]

/** Reduced motion: where the film actually is (snapped into the nearest hold) and how visible. */
export function calm(vh: number) {
  for (let i = 0; i < CALM.length; i++) {
    const [a, b] = CALM[i]
    if (vh >= a && vh <= b) return { vh, vis: 1 }
    const next = CALM[i + 1]
    if (next && vh > b && vh < next[0]) {
      const mid = (b + next[0]) / 2
      const out = vh < mid ? b : next[0]
      const vis = vh < mid ? 1 - sm(b, mid, vh) : sm(mid, next[0], vh)
      return { vh: out, vis: Math.max(0, vis) }
    }
  }
  return { vh, vis: 1 }
}

export const summitXZ = [SUMMIT.x, SUMMIT.z] as const
