// Pins HTML signs onto their 3D faces with a projective transform, so the type stays real text,
// links stay real links and nothing has to raycast a click.

import * as THREE from 'three'
import { U, drive } from '../lib/state'
import { corners, normalOf, type SignDef } from '../world/signs'
import { sm } from '../world/road'
import { HOLDS, MARKER_VH } from '../world/script'
import { boardIndex } from '../scene/Mounts'
import { reducedMotion } from '../lib/tier'

type Entry = {
  def: SignDef
  el: HTMLElement
  pxW: number
  pxH: number
  corners: THREE.Vector3[]
  centre: THREE.Vector3
  vis: (vh: number) => number
  shown: boolean
  lastOp: string
  normal: THREE.Vector3
  struck: number // when the lamps were switched on, in seconds, or -1
  lampOp: string[]
}

const entries = new Map<string, Entry>()

export function registerSign(def: SignDef, el: HTMLElement, pxW: number, pxH: number, vis: (vh: number) => number) {
  const c = corners(def).map(([x, y, z]) => new THREE.Vector3(x, y, z))
  const centre = new THREE.Vector3(...def.c)
  entries.set(def.id, { def, el, pxW, pxH, corners: c, centre, vis, shown: false, lastOp: '', normal: new THREE.Vector3(...normalOf(def)), struck: -1, lampOp: ['', '', '', ''] })
  return () => {
    entries.delete(def.id)
  }
}

const v = new THREE.Vector4()
const tmp = new THREE.Vector3()

/** Heckbert's square-to-quad mapping, scaled from element pixels. */
function setHomography(el: HTMLElement, w: number, h: number, q: number[]) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const sx = x0 - x1 + x2 - x3
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const sy = y0 - y1 + y2 - y3
  const det = dx1 * dy2 - dx2 * dy1
  const g = (sx * dy2 - dx2 * sy) / det
  const hh = (dx1 * sy - sx * dy1) / det
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + hh * x3
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + hh * y3
  el.style.transform = `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${x0},${y0},0,1)`
}

// The same low-beam lobe as the shaders, so a sign brightens exactly when the beam lands.
function lobe(p: THREE.Vector3, lx: number, ly: number, lz: number) {
  const F = U.uCarF.value
  const R = U.uCarR.value
  const Up = U.uCarU.value
  const vx = p.x - lx
  const vy = p.y - ly
  const vz = p.z - lz
  const f = vx * F.x + vy * F.y + vz * F.z
  if (f < 0.05) return 0
  const x = (vx * R.x + vy * R.y + vz * R.z) / f
  const y = (vx * Up.x + vy * Up.y + vz * Up.z) / f
  const d2 = vx * vx + vy * vy + vz * vz
  // Signs sit above the cut-off, so use a softer vertical spread than the road gets.
  const flood = Math.max(0, 1 - Math.abs(x) / 0.9) * Math.exp(-Math.max(0, y - 0.02) * 9)
  const fall = 1 / (1 + d2 * 0.0011)
  return flood * fall
}

function beamOn(p: THREE.Vector3) {
  const c = U.uCar.value
  const F = U.uCarF.value
  const Up = U.uCarU.value
  const bx = c.x + F.x * 2.15 + Up.x * 0.66
  const by = c.y + F.y * 2.15 + Up.y * 0.66
  const bz = c.z + F.z * 2.15 + Up.z * 0.66
  return (lobe(p, bx, by, bz) * 2) * U.uLights.value
}

// How a sodium lamp strikes: a stutter of flashes, a dip, then it climbs to full.
function strike(t: number) {
  if (t <= 0) return 0
  if (t < 0.05) return 0.9
  if (t < 0.12) return 0.08
  if (t < 0.16) return 1
  if (t < 0.3) return 0.2
  if (t < 0.34) return 0.75
  return Math.min(1, 0.45 + (t - 0.34) * 1.6)
}

// Each board's lamps come on as the car pulls up to it, one after another, left to right.
function updateLamps(en: Entry) {
  const d = en.def
  const i = boardIndex(d)
  // Just after the board has faded in, so the strike-up is seen, not missed in the approach.
  const a = d.kind === 'project' ? HOLDS[d.slot][0] + 2 : MARKER_VH[d.slot] - 58
  const near = sm(a, a + 7, drive.vh)
  const now = performance.now() / 1000
  if (near > 0.5 && en.struck < 0) en.struck = now
  if (near < 0.15) en.struck = -1
  for (let j = 0; j < 4; j++) {
    const lv = reducedMotion ? near : en.struck < 0 ? 0 : strike(now - en.struck - j * 0.11)
    U.uLamp.value[i * 4 + j] = lv
    const op = lv.toFixed(2)
    if (op !== en.lampOp[j]) {
      en.el.style.setProperty(`--l${j}`, op)
      en.lampOp[j] = op
    }
  }
}

export function updateSigns(cam: THREE.PerspectiveCamera, vw: number, vh: number) {
  entries.forEach((en) => {
    updateLamps(en)
    const { el } = en
    const vis = en.vis(drive.vh) * drive.vis
    // Never show a board from behind or edge-on.
    const facing = tmp.copy(cam.position).sub(en.centre).normalize().dot(en.normal)
    let ok = vis > 0.004 && facing > 0.2
    const q: number[] = []
    if (ok) {
      for (const c of en.corners) {
        v.set(c.x, c.y, c.z, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix)
        if (v.w < 0.5) {
          ok = false
          break
        }
        q.push(((v.x / v.w) * 0.5 + 0.5) * vw, (0.5 - (v.y / v.w) * 0.5) * vh)
      }
    }
    if (!ok) {
      // Opacity, not visibility: a hidden board's link must stay in the tab order, so focusing it
      // can drive the car there.
      if (en.shown) {
        el.style.opacity = '0'
        el.style.pointerEvents = 'none'
        en.shown = false
        en.lastOp = ''
      }
      return
    }
    setHomography(el, en.pxW, en.pxH, q)
    // Retroreflective legend: readable in the dark, flaring when the beam lands on it.
    const lit = Math.min(1, beamOn(tmp.copy(en.centre)) * 1.4)
    const op = vis.toFixed(3)
    if (op !== en.lastOp) {
      el.style.opacity = op
      en.lastOp = op
    }
    el.style.setProperty('--lit', lit.toFixed(3))
    el.style.pointerEvents = vis > 0.7 ? 'auto' : 'none'
    en.shown = true
  })
}
