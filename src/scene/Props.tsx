import { useMemo } from 'react'
import * as THREE from 'three'
import { U } from '../lib/state'
import { low } from '../lib/tier'
import { END_S, PARK_S, frame, groundAt, halfLeft, halfRight, nearest, sample } from '../world/road'
import { CLOUD_Y } from '../world/terrain'
import { COMMON } from './glsl'

// The overlook at the top: a guardrail along the drop that wraps across the end of the road, red
// reflector panels where the tarmac stops, boulders on the edge and a stand of pines on both
// slopes. At night the beams pick them out; at sunrise they
// stand as silhouettes against the sky and the cloud sea.

const KIND = { rail: 0, reflector: 1, tree: 2, rock: 3, iron: 4, wood: 5 } as const

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

  // Along the drop: the outer edge of the lay-by, from where it opens to the end of the road.
  const edge: (readonly [number, number, number])[] = []
  for (let s = END_S - 190; s <= END_S + 0.01; s += 2.5) edge.push(at(s, halfRight(s) - 0.35))
  // Then square across the end of the road, so the tarmac stops at something.
  const across: (readonly [number, number, number])[] = []
  const wR = halfRight(END_S) - 0.35
  const wL = -(halfLeft(END_S) - 0.35)
  for (let t = 0; t <= 1.0001; t += 1 / 6) across.push(at(END_S + 1.2, wR + (wL - wR) * t))
  rail([...edge, ...across])

  // Red reflector panels on the end barrier, facing back down the road.
  sample(END_S + 1.2, f)
  const back = Math.atan2(-f.rz, f.rx)
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    const [x, y, z] = at(END_S + 1.0, wR + (wL - wR) * t)
    box(0.6, 0.9, 0.05, KIND.reflector, x, y + 1.45, z, back)
    box(0.1, 1.9, 0.1, KIND.rail, x, y + 0.95, z, back)
  }

  // Posts and a back for the overlook sign (its face is drawn separately, with its lettering).
  {
    const s = END_S - 128
    sample(s, f)
    const yaw = Math.atan2(-f.rz, f.rx) + 0.4
    const [x, y, z] = at(s, halfRight(s) + 1.6)
    box(3.46, 1.76, 0.06, KIND.iron, x - Math.sin(yaw) * 0.04, y + 2.5, z - Math.cos(yaw) * 0.04, yaw)
    for (const t of [-1.1, 1.1]) box(0.1, 3.2, 0.1, KIND.iron, x + Math.cos(yaw) * t, y + 1.4, z - Math.sin(yaw) * t, yaw)
  }

  // A bench at the rail beside the parking spot, facing out over the drop.
  {
    const s = PARK_S + 8
    sample(s, f)
    // Local +x along the road, local +z out over the drop.
    const yaw = Math.atan2(-f.tz, f.tx)
    const lat = halfRight(s) - 1.5
    const [x, y, z] = at(s, lat)
    const put = (w: number, h: number, d: number, k: number, lx: number, ly: number, lz: number, tilt = 0) => {
      const g = new THREE.BoxGeometry(w, h, d)
      g.rotateX(tilt)
      g.translate(lx, ly, lz)
      g.rotateY(yaw)
      g.translate(x, y, z)
      parts.push({ g, k })
    }
    // Slatted seat and back, on two iron frames.
    for (const dz of [-0.2, 0, 0.2]) put(1.9, 0.05, 0.16, KIND.wood, 0, 0.46, dz)
    for (const dy of [0.66, 0.84]) put(1.9, 0.12, 0.04, KIND.wood, 0, dy, -0.33, -0.18)
    for (const dx of [-0.8, 0.8]) {
      put(0.06, 0.46, 0.06, KIND.iron, dx, 0.23, 0.22)
      put(0.06, 0.92, 0.06, KIND.iron, dx, 0.46, -0.28, -0.12)
      put(0.06, 0.05, 0.58, KIND.iron, dx, 0.43, -0.02)
    }
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
      : vec3(0.2, 0.13, 0.08);

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

// The brown recreation sign at the mouth of the lay-by, drawn once onto a canvas.
function signTexture() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#4a2f1c'
  g.fillRect(0, 0, 1024, 512)
  g.strokeStyle = '#efe8da'
  g.lineWidth = 14
  g.beginPath()
  g.roundRect(26, 26, 972, 460, 34)
  g.stroke()
  g.fillStyle = '#efe8da'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = "800 116px 'Overpass Variable', 'Helvetica Neue', Arial, sans-serif"
  g.fillText('SCENIC', 512, 160)
  g.fillText('OVERLOOK', 512, 290)
  g.font = "600 64px 'Overpass Variable', 'Helvetica Neue', Arial, sans-serif"
  g.fillText('ELEV. 5,080 FT', 512, 412)
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 4
  return t
}

const signFrag = /* glsl */ `
  precision highp float;
  ${COMMON}
  uniform sampler2D tMap;
  varying vec2 vUv; varying vec3 vP; varying vec3 vN;
  void main() {
    vec3 tex = texture2D(tMap, vUv).rgb;
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vP);
    // Sign sheeting is retroreflective: the beams come straight back off it.
    float hl = 1.0 - exp(-headlights(vP) * 0.8);
    vec3 col = tex * (0.05 + hl * 2.2 * max(dot(N, V), 0.0));
    float day = smoothstep(0.25, 0.85, uDawn);
    vec3 lit = tex * (sunColor(uDawn) * max(dot(N, normalize(uSunDir)), 0.0) * 1.2 + dawnZenith(uDawn) * 1.5 + dawnHorizon(uDawn) * 0.1);
    col = mix(col, lit, day);
    float fog = fogAmount(length(vP - cameraPosition));
    gl_FragColor = vec4(mix(col, hazeColor(-V), fog), 1.0);
  }
`

function OverlookSign() {
  const { mesh } = useMemo(() => {
    const s = END_S - 128
    const f = sample(s)
    const lat = halfRight(s) + 1.6
    const x = f.x + f.rx * lat
    const z = f.z + f.rz * lat
    const y = groundAt(x, z)
    // Facing back down the road, at the car coming up, turned in a touch.
    const yaw = Math.atan2(-f.rz, f.rx) + 0.4
    // The plane faces +z, which this yaw turns to face back down the road.
    const g = new THREE.PlaneGeometry(3.4, 1.7)
    g.rotateY(yaw)
    g.translate(x, y + 2.5, z)
    const m = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; varying vec3 vP; varying vec3 vN; void main(){ vUv = uv; vN = normal; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: signFrag,
      uniforms: { ...U, tMap: { value: signTexture() } },
    })
    return { mesh: new THREE.Mesh(g, m) }
  }, [])
  return <primitive object={mesh} frustumCulled={false} />
}

export function Props() {
  const { geo, mat } = useMemo(
    () => ({
      geo: build(),
      mat: new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { ...U } }),
    }),
    [],
  )
  return (
    <>
      <mesh geometry={geo} material={mat} frustumCulled={false} />
      <OverlookSign />
    </>
  )
}
