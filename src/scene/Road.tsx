import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { quality } from '../lib/tier'
import { U, drive } from '../lib/state'
import { END_S, HALF, START_S, carLateral, frame, halfLeft, halfRight, sample } from '../world/road'
import { COMMON } from './glsl'

// ---- Asphalt and paint ----

const roadVert = /* glsl */ `
  attribute float aS;
  attribute float aT;
  varying float vS;
  varying float vT;
  varying vec3 vP;
  varying float vDist;
  void main() {
    vS = aS; vT = aT; vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const roadFrag = /* glsl */ `
  precision highp float;
  ${COMMON}
  uniform float uAppear, uEndS, uHalf;
  varying float vS;
  varying float vT;
  varying vec3 vP;
  varying float vDist;
  // A painted line of width w, at least a pixel wide on screen and dimmed in proportion when it
  // is thinner than that, so distant paint stays a steady thread instead of shimmering away.
  float band(float x, float c, float w) {
    float d = abs(x - c);
    float fw = max(fwidth(x), 1e-4);
    float hw = max(w * 0.5, fw * 0.75);
    float a = 1.0 - smoothstep(hw - fw * 0.5, hw + fw * 0.5, d);
    return a * min(1.0, w / (2.0 * hw));
  }
  void main() {
    float hl = headlights(vP);
    // Lay-by at the summit: the right edge line breaks into a dashed give-way line across its
    // mouth, and a new solid line follows the lay-by's outer kerb.
    float layby = smoothstep(uEndS - 125.0, uEndS - 118.0, vS);
    float widen = 7.5 * smoothstep(uEndS - 120.0, uEndS - 55.0, vS);
    float mouth = step(fract(vS / 4.0), 0.5);
    float edgeR = band(vT, uHalf - 0.2, 0.14) * mix(1.0, mouth, layby) * (1.0 - smoothstep(uEndS - 22.0, uEndS - 16.0, vS));
    float kerb = band(vT, uHalf + 0.4 + widen, 0.14) * smoothstep(0.6, 2.0, widen);
    float paint = band(vT, -uHalf + 0.2, 0.14) + edgeR + kerb;
    // Centre line, dashed every 9 m, all the way to the top.
    float dash = step(fract(vS / 9.0), 0.36);
    paint += band(vT, 0.0, 0.12) * dash * (1.0 - smoothstep(uEndS - 14.0, uEndS - 10.0, vS));
    paint = clamp(paint, 0.0, 1.0);

    float asphalt = 0.014;
    vec3 col = vec3(asphalt);
    // Asphalt takes the beam as a soft pool; paint is retroreflective and throws it back.
    col += vec3(1.0, 0.965, 0.92) * min(hl, 4.0) * 0.16;
    // Paint holds a faint, steady glow everywhere (starlight on retroreflective beads), so the
    // road reads the whole way up, not only inside the beam.
    col += BONE * paint * ((0.075 + 0.11 * uAmb) * pulseReveal(vP) + min(hl, 4.0) * 0.75 + pulseFront(vP) * 1.6);
    col += ACCENT * tailglow(vP) * (0.9 + paint);
    // Morning: grey asphalt under the sky, paint just paint.
    float day = smoothstep(0.3, 0.9, uDawn);
    col += (vec3(0.05, 0.045, 0.045) + BONE * paint * 0.12) * (dawnZenith(uDawn) * 3.0 + sunColor(uDawn) * 0.25) * day * 2.0;
    float fog = fogAmount(vDist);
    col = mix(col, hazeColor(normalize(vP - cameraPosition)), fog);
    gl_FragColor = vec4(col * uAppear, 1.0);
  }
`

export const roadAppear = { value: 0 }

function roadGeometry() {
  const step = quality.stripStep
  const rows = Math.floor(END_S / step) + 1
  const pos: number[] = []
  const aS: number[] = []
  const aT: number[] = []
  const idx: number[] = []
  const f = frame()
  for (let r = 0; r < rows; r++) {
    const s = Math.min(END_S, r * step)
    sample(s, f)
    const cols = [-halfLeft(s), -HALF, 0, HALF, halfRight(s)]
    cols.forEach((t) => {
      pos.push(f.x + f.rx * t, f.y + 0.03, f.z + f.rz * t)
      aS.push(s)
      aT.push(t)
    })
    if (r < rows - 1) {
      for (let c = 0; c < 4; c++) {
        const a = r * 5 + c
        idx.push(a, a + 1, a + 5, a + 1, a + 6, a + 5)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1))
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1))
  g.setIndex(idx)
  return g
}

// ---- The route: the taillights' long exposure, which becomes the survey line at the end ----

const trailVert = /* glsl */ `
  attribute float aS;
  attribute float aSide;
  attribute vec3 aDir;
  uniform float uPx;
  uniform float uLift;
  varying float vS;
  varying float vDist;
  void main() {
    vec3 p = position;
    p.y += uLift;
    vec4 anchor = modelViewMatrix * vec4(p, 1.0);
    float dist = -anchor.z;
    // At least a pixel and a half wide however far away it is.
    float hw = max(0.05, dist * uPx);
    p += aDir * aSide * hw;
    vS = aS; vDist = dist;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const trailFrag = /* glsl */ `
  precision highp float;
  ${COMMON}
  uniform float uBase, uAhead, uStart;
  varying float vS;
  varying float vDist;
  void main() {
    float behind = uCarS - vS;
    float done = step(0.0, behind) * step(uStart, vS);
    // Hot just behind the car, settling to a thin steady line further back.
    float hot = exp(-max(behind, 0.0) / 70.0) * (0.25 + uSpeed * 1.4);
    float a = done * (uBase + hot);
    // Ahead of the car, in the wide shots: a faint dashed line still to drive.
    float dash = step(0.5, fract(vS / 22.0));
    float ahead = (1.0 - step(0.0, behind)) * step(uStart, vS);
    a += ahead * uAhead * dash * 0.45;
    vec3 c = mix(BONE * 0.8, ACCENT, done);
    float fog = fogAmount(vDist);
    gl_FragColor = vec4(c * a * (1.0 - fog), 1.0);
  }
`

function trailGeometry() {
  const step = 3
  const rows = Math.floor(END_S / step) + 1
  const pos: number[] = []
  const aS: number[] = []
  const side: number[] = []
  const dir: number[] = []
  const idx: number[] = []
  const f = frame()
  for (let r = 0; r < rows; r++) {
    const s = Math.min(END_S, r * step)
    sample(s, f)
    const lat = s < START_S ? 1.85 : carLateral(s)
    for (const k of [-1, 1]) {
      pos.push(f.x + f.rx * lat, f.y, f.z + f.rz * lat)
      aS.push(s)
      side.push(k)
      dir.push(f.rx, 0, f.rz)
    }
    if (r < rows - 1) {
      const a = r * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1))
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
  g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3))
  g.setIndex(idx)
  return g
}

export const trailUniforms = { uBase: { value: 0.2 }, uAhead: { value: 0 }, uLift: { value: 0.55 }, uStart: { value: START_S } }

// ---- Reflector posts: they only exist when a beam finds them ----

const reflVert = /* glsl */ `
  ${COMMON}
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = -mv.z;
    float hl = headlights(position);
    // Retroreflective: bright only back along the beam, so near the car.
    float back = smoothstep(60.0, 8.0, length(cameraPosition - uCar));
    vA = min(1.6, hl * 7.0) * (0.25 + 0.75 * back) + 0.05 * uAmb;
    vA *= 1.0 - fogAmount(d);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(260.0 / max(d, 1.0), 1.5, 9.0) * uDpr;
  }
`
const reflFrag = /* glsl */ `
  precision highp float;
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = (1.0 - smoothstep(0.18, 0.5, r)) * vA;
    gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a, 1.0);
  }
`

function reflectorGeometry() {
  const pos: number[] = []
  const f = frame()
  for (let s = 10; s < END_S - 130; s += quality.reflectorStep) {
    sample(s, f)
    for (const side of [-1, 1]) {
      const t = side * (HALF + 1.1)
      pos.push(f.x + f.rx * t, f.y + 0.95, f.z + f.rz * t)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

export function Road() {
  const parts = useMemo(() => {
    const road = new THREE.ShaderMaterial({
      vertexShader: roadVert,
      fragmentShader: roadFrag,
      uniforms: { ...U, uAppear: roadAppear, uEndS: { value: END_S }, uHalf: { value: HALF } },
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    })
    const trail = new THREE.ShaderMaterial({
      vertexShader: trailVert,
      fragmentShader: trailFrag,
      uniforms: { ...U, ...trailUniforms },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const refl = new THREE.ShaderMaterial({
      vertexShader: reflVert,
      fragmentShader: reflFrag,
      uniforms: { ...U },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { roadG: roadGeometry(), trailG: trailGeometry(), reflG: reflectorGeometry(), road, trail, refl }
  }, [])

  useFrame(() => {
    roadAppear.value = drive.ready ? Math.min(1, roadAppear.value + 0.03) : 0
    // Wide shots show the whole route: driven in the accent, still to come dashed.
    const wide = U.uEmberA.value
    trailUniforms.uLift.value = 0.55 + wide * 3
    trailUniforms.uBase.value = 0.16 + 0.84 * wide
    trailUniforms.uAhead.value = wide
  })

  return (
    <group>
      <mesh geometry={parts.roadG} material={parts.road} frustumCulled={false} />
      <mesh geometry={parts.trailG} material={parts.trail} frustumCulled={false} renderOrder={3} />
      <points geometry={parts.reflG} material={parts.refl} frustumCulled={false} renderOrder={4} />
    </group>
  )
}
