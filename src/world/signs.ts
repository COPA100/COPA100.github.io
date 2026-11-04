// Where every sign stands. Projects sit on big boards at the outside of each hairpin, facing the
// car as it arrives; experience sits on small markers along the final traverse.

import { END_S, HAIRPINS, HALF, carLateral, groundAt, sample, frame } from './road.ts'
import { projects } from '../data/content.ts'

export type SignKind = 'project' | 'marker'

export type SignDef = {
  id: string
  kind: SignKind
  slot: number
  c: [number, number, number] // centre
  right: [number, number, number] // unit, as the viewer reads it
  w: number
  h: number
  ground: number
  turn: 1 | -1 // which way the road bends at this sign, for the arrow
  eye: [number, number, number] // where the car waits while this sign is read
}

/** The stretch of road the car creeps along while a project sign is held. */
export const holdS = (i: number) => [HAIRPINS[i] - 46, HAIRPINS[i] - 34] as const

const f = frame()

export const MARKER_S = [0.36, 0.58, 0.8].map((t) => {
  const a = HAIRPINS[3] + 40
  const b = END_S - 150
  return a + (b - a) * t
})

export function signDefs(portrait: boolean): SignDef[] {
  const out: SignDef[] = []
  HAIRPINS.forEach((apex, i) => {
    sample(apex - 40, f)
    const tx = f.tx
    const tz = f.tz
    const hIn = f.heading
    sample(apex + 40, f)
    let dh = f.heading - hIn
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    sample(apex, f)
    const apexY = f.y
    const cx = f.x + tx * (HALF + 11)
    const cz = f.z + tz * (HALF + 11)
    // Face the board square to the car waiting on the approach.
    const sMid = (holdS(i)[0] + holdS(i)[1]) / 2
    sample(sMid, f)
    const lat0 = carLateral(sMid)
    const ex = f.x + f.rx * lat0
    const ez = f.z + f.rz * lat0
    const dl = Math.hypot(cx - ex, cz - ez)
    const dx = (cx - ex) / dl
    const dz = (cz - ez) / dl
    const g = groundAt(cx, cz)
    // A board is only as tall as what it says: no figure, a shorter board.
    const tall = !!projects[i]?.figure
    const w = portrait ? 10 : 17
    const h = portrait ? (tall ? 14.4 : 11.2) : tall ? 10 : 8.4
    const lift = portrait ? 2.2 : 2.4
    out.push({ id: `p${i}`, kind: 'project', slot: i, c: [cx, apexY + lift + h / 2, cz], right: [-dz, 0, dx], w, h, ground: g, turn: dh > 0 ? 1 : -1, eye: [ex, f.y, ez] })
  })
  MARKER_S.forEach((s, i) => {
    sample(s, f)
    const lat = -(HALF + 3.6)
    const cx = f.x + f.rx * lat
    const cz = f.z + f.rz * lat
    const w = portrait ? 7.4 : 9.4
    const h = portrait ? 8.4 : 5.4
    out.push({ id: `m${i}`, kind: 'marker', slot: i, c: [cx, f.y + 2.3 + h / 2, cz], right: [f.tx, 0, f.tz], w, h, ground: f.y, turn: 1, eye: [f.x, f.y, f.z] })
  })
  return out
}

/** World corners TL, TR, BR, BL. */
export function corners(d: SignDef) {
  const [cx, cy, cz] = d.c
  const [rx, , rz] = d.right
  const hw = d.w / 2
  const hh = d.h / 2
  return [
    [cx - rx * hw, cy + hh, cz - rz * hw],
    [cx + rx * hw, cy + hh, cz + rz * hw],
    [cx + rx * hw, cy - hh, cz + rz * hw],
    [cx - rx * hw, cy - hh, cz - rz * hw],
  ] as [number, number, number][]
}

/** The direction the sign face looks out along. */
export const normalOf = (d: SignDef) => [-d.right[2], 0, d.right[0]] as [number, number, number]
