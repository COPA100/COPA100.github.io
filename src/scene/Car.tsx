import { forwardRef, useMemo } from 'react'
import * as THREE from 'three'
import { U } from '../lib/state'
import { low } from '../lib/tier'
import { COMMON } from './glsl'

// A low fastback GT, lofted through smooth cross-sections so the body reads as one continuous
// surface from any angle. Car space: -Z is forward, +X is right, the wheels sit on y = 0.

const LEN = 4.62
const Z0 = -LEN / 2

type Knot = [number, number]
// Piecewise-smooth profile through knots of [u, value], u = 0 at the nose, 1 at the tail.
function profile(knots: Knot[]) {
  return (u: number) => {
    if (u <= knots[0][0]) return knots[0][1]
    for (let i = 0; i < knots.length - 1; i++) {
      const [a, va] = knots[i]
      const [b, vb] = knots[i + 1]
      if (u <= b) {
        const t = (u - a) / (b - a)
        const e = t * t * (3 - 2 * t)
        return va + (vb - va) * e
      }
    }
    return knots[knots.length - 1][1]
  }
}

const halfW = profile([[0, 0.62], [0.025, 0.82], [0.08, 0.9], [0.19, 0.935], [0.32, 0.92], [0.5, 0.905], [0.66, 0.94], [0.8, 0.975], [0.92, 0.95], [0.975, 0.89], [1, 0.8]])
const bot = profile([[0, 0.34], [0.06, 0.24], [0.15, 0.2], [0.85, 0.2], [0.95, 0.28], [1, 0.4]])
const belt = profile([[0, 0.6], [0.08, 0.68], [0.3, 0.75], [0.6, 0.8], [0.85, 0.84], [1, 0.855]])
const top = profile([[0, 0.62], [0.04, 0.72], [0.2, 0.81], [0.335, 0.87], [0.47, 1.27], [0.54, 1.3], [0.62, 1.285], [0.78, 1.12], [0.9, 0.97], [0.965, 0.93], [1, 0.87]])
const cabin = profile([[0.32, 0], [0.42, 1], [0.8, 1], [0.92, 0]])
const roofW = profile([[0.4, 0.66], [0.55, 0.62], [0.8, 0.57], [1, 0.5]])
const windowBand = (u: number) => {
  const sm = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)))
  const ws = sm(0.345, 0.36, u) * (1 - sm(0.455, 0.47, u))
  const bl = sm(0.63, 0.645, u) * (1 - sm(0.84, 0.86, u))
  return Math.max(ws, bl)
}

function section(u: number): { pts: [number, number][]; glass: number[] } {
  const W = halfW(u)
  const b = bot(u)
  const be = belt(u)
  const t = top(u)
  const c = cabin(u)
  const rw = THREE.MathUtils.lerp(W * 0.72, roofW(u), c)
  const pts: [number, number][] = [
    [0, b],
    [W * 0.55, b],
    [W * 0.86, b + 0.012],
    [W * 0.975, b + 0.06],
    [W, b + 0.16],
    [W * 1.008, b + (be - b) * 0.56],
    [W * 0.995, be - 0.05],
    [W * 0.968, be],
    [W * 0.925, be + 0.03],
  ]
  const glass = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  const sx = W * 0.925
  const sy = be + 0.03
  const ex = rw
  const ey = t - 0.05
  for (let k = 1; k <= 5; k++) {
    const q = k / 6
    // Tumblehome: the glass leans in, with a slight outward bow.
    const x = sx + (ex - sx) * q + Math.sin(q * Math.PI) * 0.02
    const y = sy + (ey - sy) * Math.pow(q, 0.85)
    pts.push([x, y])
    glass.push(c > 0.5 && k >= 2 && k <= 5 ? 1 : 0)
  }
  pts.push([ex, ey])
  glass.push(0)
  const wb = windowBand(u)
  pts.push([ex * 0.62, t - 0.014])
  glass.push(wb)
  pts.push([0, t])
  glass.push(wb)
  return { pts, glass }
}

function bodyGeometry() {
  const STATIONS = 110
  const verts: number[] = []
  const glass: number[] = []
  let per = 0
  for (let i = 0; i <= STATIONS; i++) {
    const u = i / STATIONS
    const z = Z0 + u * LEN
    const { pts, glass: g } = section(u)
    const ring = [...pts, ...pts.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number])]
    const gr = [...g, ...g.slice(1, -1).reverse()]
    per = ring.length
    ring.forEach(([x, y], k) => {
      verts.push(x, y, z)
      glass.push(gr[k])
    })
  }
  const idx: number[] = []
  for (let i = 0; i < STATIONS; i++) {
    for (let j = 0; j < per; j++) {
      const a = i * per + j
      const b = i * per + ((j + 1) % per)
      const c = (i + 1) * per + j
      const d = (i + 1) * per + ((j + 1) % per)
      idx.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  g.setAttribute('aGlass', new THREE.Float32BufferAttribute(glass, 1))
  g.setIndex(idx)
  g.computeVertexNormals()

  // Flat end panels, with their own normals so the loft keeps its smooth shading.
  const cap = (u: number, sign: number) => {
    const { pts } = section(u)
    const ring = [...pts, ...pts.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number])]
    const cz = Z0 + u * LEN
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length
    const v: number[] = [0, cy, cz + sign * 0.012]
    const n: number[] = [0, 0, sign]
    ring.forEach(([x, y]) => {
      v.push(x, y, cz)
      n.push(0, 0, sign)
    })
    const ix: number[] = []
    for (let k = 0; k < ring.length; k++) {
      const a = k + 1
      const b = ((k + 1) % ring.length) + 1
      if (sign > 0) ix.push(0, b, a)
      else ix.push(0, a, b)
    }
    const cg = new THREE.BufferGeometry()
    cg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    cg.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3))
    cg.setAttribute('aGlass', new THREE.Float32BufferAttribute(new Array(v.length / 3).fill(0), 1))
    cg.setIndex(ix)
    return cg
  }
  return { body: g, tail: cap(1, 1), nose: cap(0, -1) }
}

const WHEELS: [number, number][] = [
  [-0.83, -1.42],
  [0.83, -1.42],
  [-0.83, 1.42],
  [0.83, 1.42],
]
const WHEEL_R = 0.345

const bodyMat = () =>
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      attribute float aGlass;
      varying vec3 vN; varying vec3 vP; varying vec3 vL; varying float vGlass;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vP = w.xyz; vL = position; vGlass = aGlass;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${COMMON}
      varying vec3 vN; varying vec3 vP; varying vec3 vL; varying float vGlass;
      void main() {
        // Wheel arches: cut the body away around each wheel.
        vec2 wz = vec2(abs(vL.z) - 1.42, vL.y - ${WHEEL_R.toFixed(3)});
        if (abs(vL.x) > 0.62 && length(wz) < 0.43 && vL.y < 0.78) discard;

        if (!gl_FrontFacing) { gl_FragColor = vec4(vec3(0.004), 1.0); return; }
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vP);
        float nv = max(dot(N, V), 0.0);
        vec3 R = reflect(-V, N);
        float glass = smoothstep(0.3, 0.7, vGlass);

        // Clear-coat over near-black paint, reflecting a night sky with a faint horizon.
        float F = mix(0.035, 0.07, glass) + (1.0 - mix(0.035, 0.07, glass)) * pow(1.0 - nv, 5.0);
        float sky = R.y > 0.0 ? mix(0.13, 0.012, smoothstep(0.0, 0.5, R.y)) : 0.006;
        vec3 col = vec3(mix(0.018, 0.005, glass));
        col += vec3(0.85, 0.87, 0.92) * sky * F * 5.5;

        // One soft key from high behind: the highlight that runs along the shoulders and roof.
        vec3 L = normalize(vec3(-0.35, 0.8, 0.5));
        float spec = pow(max(dot(R, L), 0.0), 120.0) * 0.9 + pow(max(dot(R, L), 0.0), 12.0) * 0.09;
        col += BONE * spec * (1.0 - glass * 0.3);
        // A second, cooler kicker from the front so the flanks hold their form.
        vec3 L2 = normalize(vec3(0.6, 0.35, -0.7));
        col += vec3(0.75, 0.8, 0.9) * pow(max(dot(R, L2), 0.0), 50.0) * 0.28;
        // Faint skylight on the upper surfaces, so the shape never drops out entirely.
        col += vec3(0.06, 0.063, 0.07) * max(N.y, 0.0) * (1.0 - glass * 0.5);
        // A whisper of fill from the viewer, so the flanks hold their shape against dark ground.
        col += vec3(0.045) * pow(nv, 2.0) * (1.0 - glass * 0.6);
        // A broad, dim key from above and behind the viewer: enough to model the panels, never a
        // spotlight. Without it the car is a flat cut-out against the lit road.
        vec3 Lk = normalize(V + vec3(0.0, 1.1, 0.0));
        col += vec3(0.1, 0.103, 0.11) * pow(max(dot(N, Lk), 0.0), 2.0) * (1.0 - glass * 0.6);
        // A soft sheen from the camera's side of the sky, so the body holds its curves in any shot.
        vec3 Lc = normalize(V + vec3(0.0, 0.9, 0.0));
        col += vec3(0.8, 0.82, 0.86) * pow(max(dot(R, Lc), 0.0), 18.0) * 0.07 * (1.0 - glass * 0.4);
        // Silhouette.
        col += BONE * pow(1.0 - nv, 3.0) * 0.16;

        // Taillight spill on the rear panel and deck.
        float tail = smoothstep(1.85, 2.32, vL.z) * exp(-abs(vL.y - 0.84) * 5.0);
        col += ACCENT * tail * (0.09 + uBrake * 0.2) * uTail * (0.4 + 0.6 * max(N.z, 0.0));
        // The road pool bouncing up into the nose and sills.
        col += vec3(0.05) * max(-N.y, 0.0) * uLights + vec3(0.03) * smoothstep(-1.5, -2.3, vL.z) * uLights * max(N.y, 0.0);

        // Sills fall to black so the shoulder line draws the shape.
        col *= mix(0.25, 1.0, smoothstep(0.2, 0.55, vL.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })

const wheelMat = () =>
  new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      varying vec3 vL; varying vec3 vN; varying vec3 vP; varying float vSide;
      void main() {
        vL = position; vN = normalize(mat3(modelMatrix) * normal);
        // Each wheel is turned onto its side the opposite way, so its local frame is mirrored
        // relative to the direction of travel: the left one's local x points up, the right one's down.
        vSide = sign(modelMatrix[0].y + 1e-4);
        vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${COMMON}
      varying vec3 vL; varying vec3 vN; varying vec3 vP; varying float vSide;
      void main() {
        float rad = length(vL.xz);
        // Roll forward: the top of the tyre moves toward the nose on both sides.
        float ang = atan(vL.z, vL.x) + vSide * uCarS / ${WHEEL_R.toFixed(3)};
        vec3 col = vec3(0.006);
        vec3 V = normalize(cameraPosition - vP);
        if (abs(vL.y) > 0.11) {
          float blur = clamp(uSpeed * 3.0, 0.0, 1.0);
          float spokes = smoothstep(0.75, 1.0, cos(ang * 5.0));
          float face = smoothstep(0.24, 0.23, rad);
          float lip = smoothstep(0.225, 0.235, rad) * smoothstep(0.25, 0.24, rad);
          col += vec3(0.06) * lip;
          col += vec3(0.035) * face * mix(spokes, 0.3, blur);
        } else {
          // Tread: a faint sheen at the shoulder of the tyre.
          col += vec3(0.02) * pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  })

const glowMat = (kind: 'tail' | 'head') =>
  new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: `varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${COMMON}
      varying vec3 vP;
      void main() {
        ${kind === 'tail'
          ? 'gl_FragColor = vec4(ACCENT * (2.2 + uBrake * 5.0) * uTail, 1.0);'
          : 'float f = dot(normalize(cameraPosition - vP), uCarF); gl_FragColor = vec4(vec3(1.0, 0.98, 0.94) * (0.6 + 9.0 * smoothstep(-0.3, 0.4, f)) * uLights, 1.0);'}
      }`,
  })

const beamMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vP; varying float vK;
      void main() {
        vK = uv.y;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${COMMON}
      varying vec3 vN; varying vec3 vP; varying float vK;
      void main() {
        vec3 V = normalize(cameraPosition - vP);
        // vK runs 0 at the lamp to 1 at the far end. Haze: brightest at the lamp, thinning out.
        // Fade only at the silhouette. A narrow cone seen down its axis has N.V near zero all over,
        // so a plain fresnel term would make the beam vanish from behind the car.
        float soft = smoothstep(0.0, 0.22, abs(dot(normalize(vN), V)));
        float k = clamp(vK, 0.0, 1.0);
        float along = smoothstep(0.0, 0.04, k) * pow(1.0 - k, 1.6);
        float sideOn = 1.0 - abs(dot(V, uCarF));
        float a = soft * along * uLights * (0.35 + uHigh * 1.4) * mix(0.55, 1.0, sideOn);
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a * 0.1, 1.0);
      }`,
  })

const shadowMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uDawn: U.uDawn },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    // By daylight it shrinks to a soft contact shadow; a dark slab under the car would read as an object.
    fragmentShader: `uniform float uDawn; varying vec2 vUv; void main(){ vec2 p = (vUv - 0.5) * 2.0; float d = length(p * (1.0 + uDawn * 0.35)); float a = (1.0 - smoothstep(0.45, 1.0, d)) * mix(0.9, 0.5, smoothstep(0.2, 0.8, uDawn)); gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
  })

export const Car = forwardRef<THREE.Group>(function Car(_, ref) {
  const parts = useMemo(() => {
    const { body, tail, nose } = bodyGeometry()
    // Tyre: a cylinder with rounded shoulders, lathed.
    const prof: THREE.Vector2[] = []
    const w = 0.125
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI
      prof.push(new THREE.Vector2(WHEEL_R - 0.03 + Math.sin(a) * 0.03, -w + (1 - Math.cos(a)) * w))
    }
    const tyre = new THREE.LatheGeometry(prof, low ? 24 : 40)
    const face = new THREE.CircleGeometry(WHEEL_R - 0.02, low ? 24 : 40)
    face.rotateX(-Math.PI / 2)
    face.translate(0, 0.122, 0)
    const bar = new THREE.BoxGeometry(1.46, 0.032, 0.03)
    const barEnd = new THREE.BoxGeometry(0.03, 0.032, 0.16)
    const head = new THREE.BoxGeometry(0.36, 0.026, 0.03)
    // Narrow at the lamp, opening out ahead. Cylinder v runs 1 at the top, so flip it to 0 at the lamp.
    const cone = new THREE.CylinderGeometry(0.12, 14, 120, 28, 12, true)
    const uv = cone.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    cone.rotateX(Math.PI / 2)
    cone.translate(0, 0, -60)
    return {
      body,
      tail,
      nose,
      tyre,
      face,
      bar,
      barEnd,
      head,
      cone,
      bodyM: bodyMat(),
      wheelM: wheelMat(),
      tailM: glowMat('tail'),
      headM: glowMat('head'),
      beamM: beamMat(),
      shadowM: shadowMat(),
    }
  }, [])

  return (
    <group ref={ref}>
      <mesh geometry={parts.body} material={parts.bodyM} />
      <mesh geometry={parts.tail} material={parts.bodyM} />
      <mesh geometry={parts.nose} material={parts.bodyM} />
      {WHEELS.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, WHEEL_R, z]} rotation={[0, 0, x > 0 ? -Math.PI / 2 : Math.PI / 2]}>
          <mesh geometry={parts.tyre} material={parts.wheelM} />
          <mesh geometry={parts.face} material={parts.wheelM} />
        </group>
      ))}
      <mesh geometry={parts.bar} material={parts.tailM} position={[0, 0.84, 2.316]} />
      <mesh geometry={parts.barEnd} material={parts.tailM} position={[-0.75, 0.84, 2.25]} rotation={[0, 0.5, 0]} />
      <mesh geometry={parts.barEnd} material={parts.tailM} position={[0.75, 0.84, 2.25]} rotation={[0, -0.5, 0]} />
      <mesh geometry={parts.head} material={parts.headM} position={[-0.6, 0.64, -2.27]} rotation={[0, 0.3, 0]} />
      <mesh geometry={parts.head} material={parts.headM} position={[0.6, 0.64, -2.27]} rotation={[0, -0.3, 0]} />
      {/* Drawn after the cloud deck, which is transparent and would otherwise paint over the far half. */}
      <mesh geometry={parts.cone} material={parts.beamM} position={[-0.6, 0.64, -2.3]} rotation={[0.02, 0.03, 0]} renderOrder={5} />
      <mesh geometry={parts.cone} material={parts.beamM} position={[0.6, 0.64, -2.3]} rotation={[0.02, -0.03, 0]} renderOrder={5} />
      <mesh material={parts.shadowM} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={1}>
        <planeGeometry args={[2.6, 5.4]} />
      </mesh>
    </group>
  )
})
