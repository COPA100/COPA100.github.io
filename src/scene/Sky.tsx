import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { quality, reducedMotion } from '../lib/tier'
import { sm } from '../world/road'
import { U, drive } from '../lib/state'
import { COMMON } from './glsl'

// Where the meteor runs, fixed relative to the camera the moment it starts.
const meteor = {
  uMA: { value: new THREE.Vector3() },
  uMB: { value: new THREE.Vector3() },
  uMT: { value: 0 },
  uMI: { value: 0 },
}
const M_START = 2.35
const M_LEN = 0.85
const fwd = new THREE.Vector3()
const right = new THREE.Vector3()
const up = new THREE.Vector3(0, 1, 0)

// A dome with a barely-there horizon, and a seeded field of stars that opens up as you climb.
// At the summit it carries the sunrise: the gradient, the sun, and the far ranges above the clouds.
export function Sky() {
  const { dome, stars } = useMemo(() => {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(9000, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: { ...U, ...meteor },
        vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
        fragmentShader: /* glsl */ `precision highp float;
          ${COMMON}
          varying vec3 vD;
          uniform vec3 uMA, uMB;
          uniform float uMT, uMI;

          float h1(float n) { return fract(sin(n) * 43758.5453); }
          float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
          // A ridgeline as a function of bearing: a few octaves of 1D noise.
          float ridge(float a, float seed) {
            float r = 0.0, amp = 0.5, fr = 1.0;
            for (int i = 0; i < 4; i++) { r += n1(a * fr + seed) * amp; fr *= 2.2; amp *= 0.5; }
            return r;
          }

          void main(){
            vec3 d = normalize(vD);
            float h = d.y;
            float night = 1.0 - smoothstep(0.0, 0.35, uDawn);
            vec3 nightCol = mix(vec3(0.028, 0.03, 0.036), vec3(0.0), smoothstep(-0.02, 0.32, h));

            // Gradient from the horizon up, pulled up toward the sun.
            float sd = dot(d, normalize(uSunDir));
            float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
            float lift = mix(0.18, 0.42, pow(toward, 3.0)) * mix(0.6, 1.0, uDawn);
            vec3 hor = dawnHorizon(uDawn) * (0.5 + 0.5 * pow(toward, 2.0));
            vec3 sky = mix(hor, dawnZenith(uDawn), smoothstep(-0.02, lift, h));
            // A band of warm light hugging the horizon around the sun.
            sky += sunColor(uDawn) * pow(toward, 6.0) * exp(-max(h, 0.0) * 14.0) * 0.45;
            // The sun: a hot disc and a wide halo, both mostly above the line.
            float disc = smoothstep(0.99962, 0.9998, sd);
            float halo = pow(max(sd, 0.0), 900.0) * 0.5 + pow(max(sd, 0.0), 60.0) * 0.16 + pow(max(sd, 0.0), 8.0) * 0.08;
            sky += vec3(1.0, 0.88, 0.7) * disc * 2.6 * smoothstep(0.35, 0.6, uDawn);
            sky += sunColor(uDawn) * halo;

            vec3 col = mix(sky, nightCol, night);
            // Before any of that, past the last markers: one thin dark-red line along the horizon.
            float hint = smoothstep(0.0, 0.12, uDawn) * (1.0 - smoothstep(0.2, 0.45, uDawn));
            col += vec3(0.22, 0.04, 0.03) * hint * (0.35 + 0.65 * toward) * exp(-abs(h - 0.004) * 70.0);

            // The opening's meteor: a hot head and a tapering tail, along an arc from uMA to uMB.
            if (uMI > 0.0) {
              vec3 head = normalize(mix(uMA, uMB, uMT));
              vec3 tail = normalize(mix(uMA, uMB, max(uMT - 0.3, 0.0)));
              vec3 ab = head - tail;
              float t = clamp(dot(d - tail, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
              float dist = length(d - (tail + ab * t));
              float fade = pow(t, 1.4);
              float core = exp(-dist / 0.0013) * fade;
              float glow = exp(-dist / 0.007) * fade * 0.35;
              float tip = exp(-length(d - head) / 0.003);
              // A cool trail behind a white-hot head.
              col += (vec3(0.75, 0.82, 1.0) * (core * 2.4 + glow) + vec3(1.0, 0.95, 0.88) * tip * 2.4) * uMI;
            }

            // Far ranges standing out of the cloud sea, layered with distance, hazier the further.
            float a = atan(d.z, d.x) * 9.0;
            // Peaky rather than rolling: square the noise so most of the line sits low.
            float q1 = ridge(a * 0.55, 3.0);
            float q2 = ridge(a * 1.1, 17.0);
            float r1 = -0.004 + q1 * q1 * 0.075;
            float r2 = -0.012 + q2 * q2 * 0.05;
            vec3 haze = hazeColor(d);
            vec3 far1 = mix(haze, vec3(0.16, 0.10, 0.14), 0.35) * mix(0.2, 1.0, uDawn);
            vec3 far2 = mix(haze, vec3(0.10, 0.06, 0.09), 0.55) * mix(0.15, 1.0, uDawn);
            // Sunlit rims on the near range.
            far2 += sunColor(uDawn) * pow(toward, 4.0) * 0.18 * smoothstep(0.004, 0.0, abs(h - r2));
            // Their feet sink into haze where they meet the cloud sea.
            float foot = 1.0 - smoothstep(-0.014, 0.014, h);
            col = mix(col, mix(far1, haze, foot * 0.85), step(h, r1));
            col = mix(col, mix(far2, haze, foot * 0.7), step(h, r2));
            // Below the line: the haze the cloud deck melts into at its far edge, so the two meet without a seam.
            col = mix(col, haze, step(h, -0.012));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    )
    dome.frustumCulled = false
    dome.renderOrder = -10

    const n = quality.stars
    const pos = new Float32Array(n * 3)
    const size = new Float32Array(n)
    let seed = 91
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2
      const e = Math.pow(rnd(), 0.75) * 1.45 + 0.03
      pos.set([Math.cos(a) * Math.cos(e) * 8000, Math.sin(e) * 8000, Math.sin(a) * Math.cos(e) * 8000], i * 3)
      size[i] = 0.5 + Math.pow(rnd(), 5) * 2.2
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    const m = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uDpr: U.uDpr },
      vertexShader: `attribute float aSize; uniform float uDpr; varying float vB;
        void main(){ vB = aSize; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; gl_PointSize = max(1.2, aSize * uDpr * 1.4); }`,
      fragmentShader: `precision highp float; uniform float uOpacity; varying float vB;
        void main(){ float a = 1.0 - smoothstep(0.2, 0.5, length(gl_PointCoord - 0.5)); a *= uOpacity * min(1.0, vB * 0.7); gl_FragColor = vec4(vec3(0.9, 0.89, 0.86) * a, 1.0); }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    const stars = new THREE.Points(g, m)
    stars.frustumCulled = false
    stars.renderOrder = -9
    return { dome, stars }
  }, [])

  useFrame(({ camera }) => {
    // Once, on arrival, a meteor crosses from high on the right to low on the left, behind the ridges.
    const t = (drive.since - M_START) / M_LEN
    if (reducedMotion || t < 0 || t > 1 || drive.vh > 30) meteor.uMI.value = 0
    else {
      if (meteor.uMI.value === 0) {
        camera.getWorldDirection(fwd)
        right.crossVectors(fwd, up).normalize()
        meteor.uMA.value.copy(fwd).addScaledVector(right, 0.62).addScaledVector(up, 0.42).normalize()
        meteor.uMB.value.copy(fwd).addScaledVector(right, -0.5).addScaledVector(up, 0.06).normalize()
      }
      // Fast in, a long fade: it burns out rather than stopping.
      meteor.uMT.value = 1 - Math.pow(1 - t, 1.6)
      meteor.uMI.value = Math.max(0.001, Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1 - t * 0.4))
    }
    dome.position.copy(camera.position)
    stars.position.copy(camera.position)
    ;(stars.material as THREE.ShaderMaterial).uniforms.uOpacity.value = (0.35 + 0.65 * drive.climb) * (1 - sm(0.12, 0.6, drive.dawn)) * (drive.ready ? 1 : 0.4)
  })

  return (
    <>
      <primitive object={dome} />
      <primitive object={stars} />
    </>
  )
}
