import { useMemo } from 'react'
import * as THREE from 'three'
import { U } from '../lib/state'
import { signDefs } from '../world/signs'
import { COMMON } from './glsl'

// Posts and a back panel for every sign, so the HTML faces stand on something lit by the beams.
export function Mounts({ portrait }: { portrait: boolean }) {
  const { geo, mat } = useMemo(() => {
    const boxes: THREE.BufferGeometry[] = []
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, rot: number) => {
      const b = new THREE.BoxGeometry(w, h, d)
      b.rotateY(rot)
      b.translate(x, y, z)
      boxes.push(b)
    }
    for (const s of signDefs(portrait)) {
      const rot = Math.atan2(-s.right[2], s.right[0])
      const nx = -s.right[2]
      const nz = s.right[0]
      const bottom = s.c[1] - s.h / 2
      // Back panel, set a hair behind the face.
      add(s.w + 0.1, s.h + 0.1, 0.12, s.c[0] - nx * 0.1, s.c[1], s.c[2] - nz * 0.1, rot)
      const legs = s.kind === 'project' ? [-0.32, 0.32] : [-0.36, 0.36]
      for (const t of legs) {
        const x = s.c[0] + s.right[0] * s.w * t - nx * 0.25
        const z = s.c[2] + s.right[2] * s.w * t - nz * 0.25
        const base = Math.min(s.ground, bottom) - 3
        add(0.22, bottom - base + 0.3, 0.22, x, (bottom + base) / 2 + 0.15, z, rot)
      }
    }
    const merged = mergeBoxes(boxes)
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: `varying vec3 vP; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        ${COMMON}
        varying vec3 vP; varying vec3 vN;
        void main() {
          float hl = headlights(vP);
          vec3 col = vec3(0.012) + vec3(0.16) * min(hl, 2.0) * (0.4 + 0.6 * abs(vN.x + vN.z));
          float fog = fogAmount(length(vP - cameraPosition));
          gl_FragColor = vec4(mix(col, hazeColor(normalize(vP - cameraPosition)), fog), 1.0);
        }`,
    })
    return { geo: merged, mat }
  }, [portrait])
  return <mesh geometry={geo} material={mat} frustumCulled={false} />
}

function mergeBoxes(list: THREE.BufferGeometry[]) {
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  let off = 0
  for (const g of list) {
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nor.push(n.getX(i), n.getY(i), n.getZ(i))
    }
    const ix = g.getIndex()!
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off)
    off += p.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setIndex(idx)
  return out
}
