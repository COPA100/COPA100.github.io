import { useMemo } from 'react'
import * as THREE from 'three'
import { U } from '../lib/state'
import { HALF, nearest } from '../world/road'
import { signDefs, type SignDef } from '../world/signs'
import { COMMON } from './glsl'

// The structure behind every HTML sign face. Project boards are real billboards: a steel frame,
// I-beam posts, a catwalk with a railing, and four gooseneck lamps along the top that strike up
// as the car arrives (their levels come from signSync, through U.uLamp). Experience markers keep
// a plain back panel on two posts.

export const LAMPS_PER_BOARD = 4

// lamp: which lens this is (-1 for structure). board: whose lamps light it. spill: how much of
// their light reaches it, highest right under the lamps.
type Box = { g: THREE.BufferGeometry; lamp: number; board: number; spill: number }

function build(portrait: boolean) {
  const boxes: Box[] = []
  for (const s of signDefs(portrait)) {
    const rot = Math.atan2(-s.right[2], s.right[0])
    const n = [-s.right[2], s.right[0]] as const // out of the face, toward the road
    // lx: along the board, ly: world height, ln: out of the face.
    const board = s.kind === 'project' ? s.slot : -1
    const top = s.c[1] + s.h / 2
    const put = (w: number, h: number, d: number, lx: number, ly: number, ln: number, lamp = -1) => {
      const g = new THREE.BoxGeometry(w, h, d)
      g.rotateY(rot)
      g.translate(s.c[0] + s.right[0] * lx + n[0] * ln, ly, s.c[2] + s.right[2] * lx + n[1] * ln)
      // Falls off with distance down from the lamps; anything behind the cabinet gets little.
      const spill = Math.max(0, 1 - Math.max(0, top + 1 - ly) / (s.h + 6)) * (ln < -0.5 ? 0.35 : 1)
      boxes.push({ g, lamp, board, spill })
    }
    if (s.kind === 'project') billboard(s, put)
    else marker(s, put)
  }
  return merge(boxes)
}

type Put = (w: number, h: number, d: number, lx: number, ly: number, ln: number, lamp?: number) => void

function marker(s: SignDef, put: Put) {
  const bottom = s.c[1] - s.h / 2
  put(s.w + 0.1, s.h + 0.1, 0.12, 0, s.c[1], -0.1)
  for (const t of [-0.36, 0.36]) {
    const base = Math.min(s.ground, bottom) - 3
    put(0.22, bottom - base + 0.3, 0.22, s.w * t, (bottom + base) / 2 + 0.15, -0.25)
  }
}

function billboard(s: SignDef, put: Put) {
  const top = s.c[1] + s.h / 2
  const bottom = s.c[1] - s.h / 2
  const base = Math.min(s.ground, bottom) - 4

  // The cabinet: a deep steel box a little larger than the face, and a lip round the edge.
  put(s.w + 0.5, s.h + 0.5, 0.4, 0, s.c[1], -0.3)
  put(s.w + 0.7, 0.12, 0.7, 0, top + 0.3, -0.15)
  put(s.w + 0.7, 0.12, 0.7, 0, bottom - 0.3, -0.15)

  // Two I-beam posts behind the cabinet. If one would land on a road below, it steps back
  // until it's clear; nothing stands on the tarmac.
  const nx = -s.right[2]
  const nz = s.right[0]
  for (const t of [-0.28, 0.28]) {
    let back = 0.75
    for (let k = 0; k < 12; k++) {
      const x = s.c[0] + s.right[0] * s.w * t - nx * back
      const z = s.c[2] + s.right[2] * s.w * t - nz * back
      if (nearest(x, z, 20).d > HALF + 2.2) break
      back += 1.5
    }
    const h = s.c[1] + s.h * 0.25 - base
    const y = base + h / 2
    const lx = s.w * t
    put(0.5, h, 0.07, lx, y, -back + 0.22) // front flange
    put(0.5, h, 0.07, lx, y, -back - 0.22) // back flange
    put(0.07, h, 0.44, lx, y, -back) // web
  }
  // Cross bracing between the posts.
  put(s.w * 0.56, 0.16, 0.16, 0, s.c[1] - s.h * 0.15, -0.95)
  put(s.w * 0.56, 0.16, 0.16, 0, bottom - 1.6, -0.95)

  // The catwalk: a ledge just under the face on brackets, the way crews reach the board. (A
  // railing would stand in front of the face, where the HTML board covers it, so there isn't one.)
  const walkY = bottom - 0.42
  put(s.w + 0.6, 0.09, 1.1, 0, walkY, 0.45)
  put(s.w + 0.6, 0.16, 0.06, 0, walkY + 0.02, 1.0)
  for (let x = -s.w / 2; x <= s.w / 2 + 0.01; x += s.w / 5) {
    put(0.08, 0.08, 1.0, x, walkY - 0.1, 0.42)
    put(0.08, 0.5, 0.08, x, walkY - 0.32, -0.05)
  }

  // Gooseneck lamps on the top lip, reaching out over the face.
  for (let j = 0; j < LAMPS_PER_BOARD; j++) {
    const lx = (-0.375 + j * 0.25) * s.w
    const id = s.slot * LAMPS_PER_BOARD + j
    put(0.09, 0.7, 0.09, lx, top + 0.7, -0.05)
    put(0.09, 0.09, 1.35, lx, top + 1.03, 0.6)
    put(0.6, 0.2, 0.42, lx, top + 0.95, 1.3)
    put(0.5, 0.04, 0.32, lx, top + 0.84, 1.3, id) // the lens, which glows
  }
}

function merge(list: Box[]) {
  const pos: number[] = []
  const nor: number[] = []
  const lamp: number[] = []
  const board: number[] = []
  const spill: number[] = []
  const idx: number[] = []
  let off = 0
  for (const { g, lamp: l, board: b, spill: sp } of list) {
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nor.push(n.getX(i), n.getY(i), n.getZ(i))
      lamp.push(l)
      board.push(b)
      spill.push(sp)
    }
    const ix = g.getIndex()!
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off)
    off += p.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setAttribute('aLamp', new THREE.Float32BufferAttribute(lamp, 1))
  out.setAttribute('aBoard', new THREE.Float32BufferAttribute(board, 1))
  out.setAttribute('aSpill', new THREE.Float32BufferAttribute(spill, 1))
  out.setIndex(idx)
  return out
}

export function Mounts({ portrait }: { portrait: boolean }) {
  const { geo, mat } = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: /* glsl */ `
        attribute float aLamp, aBoard, aSpill;
        varying vec3 vP; varying vec3 vN; varying float vLamp, vBoard, vSpill;
        void main(){ vLamp = aLamp; vBoard = aBoard; vSpill = aSpill; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        ${COMMON}
        uniform float uLamp[${LAMPS_PER_BOARD * 4}];
        varying vec3 vP; varying vec3 vN; varying float vLamp, vBoard, vSpill;
        void main() {
          float hl = headlights(vP);
          vec3 N = normalize(vN);
          vec3 col = vec3(0.012) + vec3(0.16) * min(hl, 2.0) * (0.4 + 0.6 * abs(N.x + N.z));
          if (vBoard > -0.5) {
            int b = int(vBoard + 0.5) * ${LAMPS_PER_BOARD};
            float lv = (uLamp[b] + uLamp[b + 1] + uLamp[b + 2] + uLamp[b + 3]) * 0.25;
            // Lamp spill on painted steel: tops catch most, faces some.
            float face = 0.45 + 0.55 * max(N.y, 0.0);
            col += vec3(0.5, 0.39, 0.26) * lv * vSpill * face;
          }
          if (vLamp > -0.5) {
            float lv = uLamp[int(vLamp + 0.5)];
            // A sodium-warm lens: dark glass when off, hot when struck.
            col = vec3(0.02) + vec3(1.0, 0.78, 0.5) * lv * 3.2;
          }
          float fog = fogAmount(length(vP - cameraPosition));
          gl_FragColor = vec4(mix(col, hazeColor(normalize(vP - cameraPosition)), fog), 1.0);
        }`,
    })
    return { geo: build(portrait), mat }
  }, [portrait])
  return <mesh geometry={geo} material={mat} frustumCulled={false} />
}
