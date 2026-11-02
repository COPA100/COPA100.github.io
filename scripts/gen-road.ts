import { natural, SUMMIT } from '../src/world/terrain.ts'
import { writePng } from './png.ts'
import { writeFileSync } from 'node:fs'

const deg = Math.PI / 180
const args = JSON.parse(process.argv[2] ?? '{}')
const C = {
  face: args.face ?? 200, // degrees, 0 = +z
  span: args.span ?? 55, // half-width of the switchback face, degrees
  y0: args.y0 ?? 380,
  dy: args.dy ?? 85, // climb per leg
  R: args.R ?? 17, // hairpin radius
  l5: args.l5 ?? 200, // degrees the final traverse wraps
  l5dy: args.l5dy ?? 110,
  l1: args.l1 ?? 0.35,
  s5: args.s5 as number | undefined,
  tail: args.tail as number | undefined,
  gmin: args.gmin ?? 0.03,
  gmax: args.gmax ?? 0.15,
}
const polar = (th: number, r: number) => [SUMMIT.x + Math.sin(th) * r, SUMMIT.z + Math.cos(th) * r]
function solveR(th: number, y: number) {
  let prev = 0
  for (let r = 20; r < 1400; r += 4) {
    const [x, z] = polar(th, r)
    if (natural(x, z) < y) {
      // refine
      let a = r - 4, b = r
      for (let i = 0; i < 12; i++) {
        const m = (a + b) / 2
        const [mx, mz] = polar(th, m)
        if (natural(mx, mz) < y) b = m
        else a = m
      }
      return (a + b) / 2
    }
    prev = r
  }
  return prev
}
function smoothArr(a: number[], sigma: number) {
  const out = a.slice()
  const k = Math.ceil(sigma * 3)
  for (let i = 0; i < a.length; i++) {
    let s = 0, w = 0
    for (let j = -k; j <= k; j++) {
      const ii = Math.min(a.length - 1, Math.max(0, i + j))
      const ww = Math.exp(-(j * j) / (2 * sigma * sigma))
      s += a[ii] * ww
      w += ww
    }
    out[i] = s / w
  }
  return out
}

type Leg = { th: number[]; r: number[]; y: number[] }
const legs: Leg[] = []
const face = C.face * deg, span = C.span * deg
const N = 240
const legDefs: { a: number; b: number; ya: number; yb: number }[] = []
let y = C.y0
for (let i = 0; i < 4; i++) {
  const dir = i % 2 === 0 ? 1 : -1
  const a = face - dir * span * (i === 0 ? C.l1 : 1), b = face + dir * span
  legDefs.push({ a, b, ya: y, yb: y + C.dy })
  y += C.dy + 4
}
legDefs.push({ a: face - span, b: face - span + C.l5 * deg, ya: y, yb: y + C.l5dy })

for (const d of legDefs) {
  const th: number[] = [], r: number[] = [], yy: number[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    th.push(d.a + (d.b - d.a) * t)
    yy.push(d.ya + (d.yb - d.ya) * t)
    r.push(solveR(th[i], yy[i]))
  }
  legs.push({ th, r: smoothArr(r, legs.length === 4 ? (C.s5 ?? 14) : 14), y: yy })
}
// Hairpin separation: outer leg end pushed out, inner leg start pulled in, so the gap is 2R.
for (let i = 0; i < 4; i++) {
  const o = legs[i], n = legs[i + 1]
  const ro = o.r[N], ri = n.r[0]
  const need = 2 * C.R - (ro - ri)
  if (need > 0) {
    for (let k = 0; k <= N; k++) {
      const fo = Math.exp(-Math.pow((N - k) / 40, 2))
      const fi = Math.exp(-Math.pow(k / 40, 2))
      o.r[k] += need * 0.5 * fo
      n.r[k] -= need * 0.5 * fi
    }
  }
}
// Assemble polyline.
type P = [number, number, number]
const raw: P[] = []
const hairpinIdx: number[] = []
for (let i = 0; i < legs.length; i++) {
  const L = legs[i]
  for (let k = 0; k <= N; k++) {
    const [x, z] = polar(L.th[k], L.r[k])
    raw.push([x, z, L.y[k]])
  }
  if (i < 4) {
    // semicircle bulging along the direction of travel
    const n = legs[i + 1]
    const [ax, az] = polar(L.th[N], L.r[N])
    const [bx, bz] = polar(n.th[0], n.r[0])
    const [px, pz] = polar(L.th[N - 1], L.r[N - 1])
    let tx = ax - px, tz = az - pz
    const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl
    const cx = (ax + bx) / 2, cz = (az + bz) / 2
    const rr = Math.hypot(ax - cx, az - cz)
    const ux = (ax - cx) / rr, uz = (az - cz) / rr
    const M = 24
    const y0 = L.y[N], y1 = n.y[0]
    hairpinIdx.push(raw.length + M / 2)
    for (let k = 1; k < M; k++) {
      const a = (k / M) * Math.PI
      raw.push([cx + ux * Math.cos(a) * rr + tx * Math.sin(a) * rr * 1.15, cz + uz * Math.cos(a) * rr + tz * Math.sin(a) * rr * 1.15, y0 + (y1 - y0) * k / M])
    }
  }
}
// Lead-in: the road arrives from the valley, straight, before the trailhead.
const LEAD = 360
{
  const [ax, az] = [raw[0][0], raw[0][1]]
  let tx = raw[0][0] - raw[3][0], tz = raw[0][1] - raw[3][1]
  const l = Math.hypot(tx, tz); tx /= l; tz /= l
  const pre: P[] = []
  for (let d = LEAD; d > 0; d -= 4) pre.push([ax + tx * d, az + tz * d, raw[0][2] - d * 0.07])
  raw.unshift(...pre)
  for (let i = 0; i < hairpinIdx.length; i++) hairpinIdx[i] += pre.length
}
// Resample by arc length at 2 m.
const DS = 2
const cum = [0]
for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]))
const total = cum[cum.length - 1]
const pts: P[] = []
const hpS = hairpinIdx.map((i) => cum[i])
for (let s = 0, j = 0; s <= total; s += DS) {
  while (j < cum.length - 2 && cum[j + 1] < s) j++
  const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1)
  pts.push([0, 1, 2].map((c) => raw[j][c] + (raw[j + 1][c] - raw[j][c]) * t) as P)
}
// Light smoothing of the path to soften leg/hairpin joins, then smooth heights.
for (let pass = 0; pass < 3; pass++) {
  const xs = smoothArr(pts.map((p) => p[0]), 2), zs = smoothArr(pts.map((p) => p[1]), 2)
  pts.forEach((p, i) => { p[0] = xs[i]; p[1] = zs[i] })
}
for (let i = 1; i < pts.length; i++) pts[i][2] = Math.min(pts[i - 1][2] + C.gmax * DS, Math.max(pts[i - 1][2] + C.gmin * DS, pts[i][2]))
const ys = smoothArr(pts.map((p) => p[2]), 10)
pts.forEach((p, i) => (p[2] = ys[i]))
// The last stretch settles onto the real ground, so the overlook sits on the mountain, not in a trench.
{
  const nat = smoothArr(pts.map((p) => natural(p[0], p[1])), 12)
  const K = Math.round((C.tail ?? 160) / DS)
  for (let i = pts.length - K; i < pts.length; i++) {
    const t = (i - (pts.length - K)) / K
    const w = t * t * (3 - 2 * t)
    pts[i][2] = pts[i][2] + (Math.min(nat[i], pts[i][2] + 30) - pts[i][2]) * w
  }
  for (let i = pts.length - K; i < pts.length; i++) pts[i][2] = Math.min(pts[i - 1][2] + 0.16 * DS, Math.max(pts[i][2], pts[i - 1][2] + 0.01 * DS))
  const sm2 = smoothArr(pts.map((p) => p[2]), 6)
  for (let i = pts.length - K; i < pts.length; i++) pts[i][2] = sm2[i]
}

let maxErr = 0, sumErr = 0, maxG = 0
pts.forEach((p, i) => {
  const e = p[2] - natural(p[0], p[1]); sumErr += Math.abs(e); maxErr = Math.max(maxErr, Math.abs(e))
  if (i) maxG = Math.max(maxG, (p[2] - pts[i - 1][2]) / DS)
})
// Minimum separation between road points far apart along the road.
let minSep = 1e9, at = 0
for (let i = 0; i < pts.length; i += 3) for (let j = i + 60; j < pts.length; j += 3) {
  const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
  if (d < minSep && Math.abs(i - j) * DS > 4 * C.R * 2.2) { minSep = d; at = i }
}
console.log('length', total.toFixed(0), 'y', pts[0][2].toFixed(0), '->', pts[pts.length - 1][2].toFixed(0), 'meanErr', (sumErr / pts.length).toFixed(1), 'maxErr', maxErr.toFixed(1), 'maxGrade', maxG.toFixed(3), 'minSep', minSep.toFixed(1), 'at s', at * DS)
{ const segs = [0, ...hpS, total]; const errs = segs.slice(1).map((b, k) => { let m = 0; pts.forEach((p, i) => { const sv = i * DS; if (sv >= segs[k] && sv < b) m = Math.max(m, Math.abs(p[2] - natural(p[0], p[1]))) }); return m.toFixed(0) }); console.log('max err per leg', errs.join(' ')) }
{ let m = 0; for (let i = pts.length - 60; i < pts.length; i++) m = Math.max(m, pts[i][2] - natural(pts[i][0], pts[i][1])); console.log('end cut (m)', m.toFixed(1), 'end y', pts[pts.length-1][2].toFixed(0)) }
console.log('hairpins s', hpS.map((v) => v.toFixed(0)).join(', '))

const W = 900, H = 900, half = Number(process.env.HALF ?? 900)
const img = new Uint8Array(W * H * 3)
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const wx = SUMMIT.x + (i / W * 2 - 1) * half, wz = SUMMIT.z + (j / H * 2 - 1) * half
  const v = natural(wx, wz)
  const k = (j * W + i) * 3
  const c = Math.abs(((v / 20) % 1) - 0.5) > 0.44 ? 90 : 14
  const c2 = Math.abs(((v / 100) % 1) - 0.5) > 0.485 ? 190 : c
  img[k] = img[k + 1] = img[k + 2] = c2
}
pts.forEach((p) => {
  const i = Math.round(((p[0] - SUMMIT.x) / half + 1) / 2 * W), j = Math.round(((p[1] - SUMMIT.z) / half + 1) / 2 * H)
  const e = p[2] - natural(p[0], p[1])
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const ii = i + a, jj = j + b
    if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue
    const k = (jj * W + ii) * 3
    const m = Math.min(1, Math.abs(e) / 30)
    img[k] = 255; img[k + 1] = e > 0 ? 200 * (1 - m) : 200; img[k + 2] = e > 0 ? 60 * (1 - m) : 200 * m
  }
})
writePng(process.env.OUT ?? 'scripts/road.png', W, H, img)
if (args.write) {
  const body = `// Generated by scripts/gen-road.ts. Road centreline every ${DS} m: x, z, y (metres).\nexport const ROAD_DS = ${DS}\nexport const LEAD_S = ${LEAD}
export const HAIRPIN_S = ${JSON.stringify(hpS.map((v) => Math.round(v)))}\nexport const ROAD_PTS = new Float32Array(${JSON.stringify(pts.flatMap((p) => p.map((v) => +v.toFixed(2))))})\n`
  writeFileSync('src/world/roadData.ts', body)
  console.log('wrote src/world/roadData.ts')
}
