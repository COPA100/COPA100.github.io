import { useMemo } from 'react'
import * as THREE from 'three'
import { U } from '../lib/state'
import { low } from '../lib/tier'
import { END_S, PARK_S, frame, groundAt, halfLeft, halfRight, nearest, sample } from '../world/road'
import { CLOUD_Y } from '../world/terrain'
import { COMMON } from './glsl'

// The overlook at the top: a guardrail along the drop that wraps across the end of the road, red
// reflector panels where the tarmac stops, a dry-stone wall along the overlook, boulders on the
// edge and a stand of pines on both slopes. At night the beams pick them out; at sunrise they
// stand as silhouettes against the sky and the cloud sea.

const KIND = { rail: 0, reflector: 1, tree: 2, rock: 3, iron: 4, stone: 5 } as const

type Part = { g: THREE.BufferGeometry; k: number }

function merge(parts: Part[]) {
  const pos: number[] = []
  const nor: number[] = []
  const kind: number[] = []
  const idx: number[] = []
  let off = 0
  for (const { g, k } of parts) {
    const p = g.getAttribute('position')
    const n = g.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nor.push(n.getX(i), n.getY(i), n.getZ(i))
      kind.push(k)
    }
    const ix = g.getIndex()
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off)
    else for (let i = 0; i < p.count; i++) idx.push(i + off)
    off += p.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  out.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1))
  out.setIndex(idx)
  return out
}

function build() {
  const parts: Part[] = []
  const f = frame()
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

  const at = (s: number, lat: number) => {
    sample(s, f)
    const x = f.x + f.rx * lat
    const z = f.z + f.rz * lat
    return [x, groundAt(x, z), z] as const
  }
  const box = (w: number, h: number, d: number, k: number, x: number, y: number, z: number, yaw = 0, pitch = 0) => {
    const g = new THREE.BoxGeometry(w, h, d)
    g.rotateZ(pitch)
    g.rotateY(yaw)
    g.translate(x, y, z)
    parts.push({ g, k })
  }
  // A run of guardrail: posts every 2.5 m and a beam between each pair, following the ground.
  const rail = (pts: (readonly [number, number, number])[]) => {
    pts.forEach(([x, y, z]) => box(0.14, 1.0, 0.14, KIND.rail, x, y + 0.35, z))
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay, az] = pts[i]
      const [bx, by, bz] = pts[i + 1]
      const dx = bx - ax
      const dz = bz - az
      const l = Math.hypot(dx, dz)
      const yaw = Math.atan2(-dz, dx)
      const pitch = Math.atan2(by - ay, l)
      box(l + 0.05, 0.3, 0.07, KIND.rail, (ax + bx) / 2, (ay + by) / 2 + 0.62, (az + bz) / 2, yaw, pitch)
    }
  }

  // Guardrail along the drop on the approach, up to where the overlook opens.
  const WALL_S = END_S - 116
  const edge: (readonly [number, number, number])[] = []
  for (let s = END_S - 190; s <= WALL_S + 0.01; s += 2.5) edge.push(at(s, halfRight(s) - 0.35))
  rail(edge)
  // Then square across the end of the road, so the tarmac stops at something.
  const across: (readonly [number, number, number])[] = []
  const wR = halfRight(END_S) - 0.35
  const wL = -(halfLeft(END_S) - 0.35)
  for (let t = 0; t <= 1.0001; t += 1 / 6) across.push(at(END_S + 1.2, wR + (wL - wR) * t))
  rail(across)

  // The overlook itself: a low dry-stone wall along the lip of the pad, block by block.
  // Blocks overlap their neighbours, so the wall stays continuous round the curve.
  for (let s = WALL_S; s <= END_S + 0.6; s += 1.0) {
    sample(s, f)
    const yaw = Math.atan2(-f.tz, f.tx)
    const [x, y, z] = at(s, halfRight(s) + 0.25)
    // Tilted to the grade between its ends, so the courses run smooth instead of stepping.
    const [ax, ay, az] = at(s - 0.75, halfRight(s - 0.75) + 0.25)
    const [bx, by, bz] = at(s + 0.75, halfRight(s + 0.75) + 0.25)
    const pitch = Math.atan2(by - ay, Math.hypot(bx - ax, bz - az))
    const h = 0.66 + rnd() * 0.04
    box(1.5, h, 0.55, KIND.stone, x, y + h / 2 - 0.05, z, yaw, pitch)
    // A coping course on top, slightly proud.
    box(1.5, 0.1, 0.64, KIND.stone, x, y + 0.72, z, yaw, pitch)
  }

  // Red reflector panels on the end barrier, facing back down the road.
  sample(END_S + 1.2, f)
  const back = Math.atan2(-f.rz, f.rx)
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    const [x, y, z] = at(END_S + 1.0, wR + (wL - wR) * t)
    box(0.6, 0.9, 0.05, KIND.reflector, x, y + 1.45, z, back)
    box(0.1, 1.9, 0.1, KIND.rail, x, y + 0.95, z, back)
  }

  // Boulders on the lip, outside the rail.
  for (let i = 0; i < 14; i++) {
    const s = END_S - 130 + rnd() * 135
    const lat = halfRight(s) + 0.8 + rnd() * 5
    const [x, y, z] = at(s, lat)
    const r = 0.35 + rnd() * 0.75
    const g = new THREE.IcosahedronGeometry(r, 1)
    // Lumpy, not faceted slabs: push each vertex in or out a little. Keyed on position, because
    // the faces don't share vertices and a per-vertex random would crack them apart.
    const p = g.getAttribute('position')
    const lump = rnd() * 100
    for (let v = 0; v < p.count; v++) {
      const h = Math.sin(p.getX(v) * 12.9 + p.getY(v) * 78.2 + p.getZ(v) * 37.7 + lump) * 43758.5453
      const j = 0.82 + (h - Math.floor(h)) * 0.3
      p.setXYZ(v, p.getX(v) * j, p.getY(v) * j, p.getZ(v) * j)
    }
    g.computeVertexNormals()
    g.scale(1 + rnd() * 0.35, 0.75 + rnd() * 0.25, 1 + rnd() * 0.3)
    g.rotateY(rnd() * Math.PI)
    g.translate(x, y + r * 0.2, z)
    parts.push({ g, k: KIND.rock })
  }

  const pine = (x: number, y: number, z: number, h: number) => {
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, h * 0.3, 6)
    trunk.translate(x, y + h * 0.15 - 0.2, z)
    parts.push({ g: trunk, k: KIND.iron })
    const tiers = 4
    for (let t = 0; t < tiers; t++) {
      const k = t / tiers
      const r = h * (0.24 - k * 0.045)
      const ch = h * (0.42 - k * 0.05)
      const cone = new THREE.ConeGeometry(r, ch, low ? 6 : 8)
      cone.rotateY(rnd() * Math.PI)
      cone.translate(x, y + h * 0.2 + k * h * 0.22 + ch / 2, z)
      parts.push({ g: cone, k: KIND.tree })
    }
  }

  // Pines: a stand on the slope above the road and a few clinging below the rail.
  const trees = low ? 26 : 44
  for (let i = 0, placed = 0; i < trees * 6 && placed < trees; i++) {
    const s = END_S - 260 + rnd() * 290
    const up = rnd() < 0.62
    const lat = up ? -(halfLeft(s) + 4 + rnd() * 45) : halfRight(s) + 4 + rnd() * 30
    sample(s, f)
    const x = f.x + f.rx * lat
    const z = f.z + f.rz * lat
    // Nothing between the parked car and the view.
    if (!up && s > PARK_S - 90) continue
    // Never on another leg of the road below.
    if (nearest(x, z, 40).d < 7) continue
    const y = groundAt(x, z)
    if (y < CLOUD_Y + 40) continue
    placed++
    pine(x, y, z, 5 + rnd() * 8)
  }

  return merge(parts)
}

const vert = /* glsl */ `
  attribute float aKind;
  varying vec3 vP; varying vec3 vN; varying float vK;
  void main() {
    vK = aKind;
    vN = normal;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const frag = /* glsl */ `
  precision highp float;
  ${COMMON}
  varying vec3 vP; varying vec3 vN; varying float vK;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vP);
    // Props sit a few metres in front of the lamps, so the raw beam would blow them out to white.
    float hl = 1.0 - exp(-headlights(vP) * 0.9);
    bool reflector = vK > 0.5 && vK < 1.5;
    vec3 albedo = vK < 0.5 ? vec3(0.42, 0.42, 0.40)
      : reflector ? ACCENT
      : vK < 2.5 ? vec3(0.035, 0.05, 0.04)
      : vK < 3.5 ? vec3(0.16, 0.15, 0.14)
      : vK < 4.5 ? vec3(0.05, 0.05, 0.05)
      : vec3(0.24, 0.22, 0.2);

    // Night: only what the lamps reach, plus a breath of starlight so shapes don't vanish.
    vec3 col = albedo * (0.02 + hl * (0.35 + 0.65 * abs(dot(N, normalize(uCarF)))));
    // Reflectors and the rail's galvanised face throw the beams straight back.
    if (reflector) col = ACCENT * (0.06 + hl * 1.6) + ACCENT * 0.05 * uTail;
    if (vK < 0.5) col += vec3(0.35) * hl * 0.3;

    // Sunrise: dark shapes against the light, rimmed where they turn toward the sun.
    float day = smoothstep(0.25, 0.85, uDawn);
    vec3 S = normalize(uSunDir);
    vec3 skyFill = (dawnZenith(uDawn) * 1.2 + dawnHorizon(uDawn) * 0.08) * (0.5 + 0.5 * N.y);
    vec3 lit = albedo * (sunColor(uDawn) * max(dot(N, S), 0.0) * 1.6 + skyFill);
    float rim = pow(1.0 - abs(dot(N, V)), 3.0) * max(dot(-V, S), 0.0);
    lit += sunColor(uDawn) * rim * 0.35;
    if (reflector) lit += ACCENT * 0.12;
    col = mix(col, lit, day);

    float fog = fogAmount(length(vP - cameraPosition));
    gl_FragColor = vec4(mix(col, hazeColor(-V), fog), 1.0);
  }
`

export function Props() {
  const { geo, mat } = useMemo(
    () => ({
      geo: build(),
      mat: new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { ...U } }),
    }),
    [],
  )
  return <mesh geometry={geo} material={mat} frustumCulled={false} />
}
