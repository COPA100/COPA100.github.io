import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { U, drive } from '../lib/state'
import { sm } from '../world/road'
import { HOLDS, MARKER_VH } from '../world/script'
import { low, reducedMotion } from '../lib/tier'
import { CLOUD_Y, SUMMIT } from '../world/terrain'
import { COMMON } from './glsl'
import { cloudK } from './Terrain'

// The sea of clouds below the summit. All night it lies in the valleys as a faint grey floor the
// high beams reach out over; at sunrise its tops catch the light. One big plane, shaded as a
// heightfield of soft noise so the low sun can rake across the billows.

const OCTAVES = low ? 4 : 5

const frag = /* glsl */ `
  precision highp float;
  ${COMMON}
  uniform float uDrift, uCloud;
  varying vec3 vP;
  varying float vDist;

  float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < ${OCTAVES}; i++) { v += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }
  // Billows: big rounded heaps with finer curl on top.
  float billow(vec2 p) {
    vec2 q = p + vec2(uDrift, uDrift * 0.4);
    return fbm(q) * 0.75 + fbm(q * 3.1 - uDrift * 0.6) * 0.25;
  }

  void main() {
    vec2 p = vP.xz / 420.0;
    float e = 0.06;
    float hgt = billow(p);
    // Normal from the noise, as if the cloud tops were a surface about 160 m deep.
    float hx = billow(p + vec2(e, 0.0)) - hgt;
    float hz = billow(p + vec2(0.0, e)) - hgt;
    vec3 N = normalize(vec3(-hx * 160.0 / (e * 420.0), 1.0, -hz * 160.0 / (e * 420.0)));

    vec3 S = normalize(uSunDir);
    vec3 view = normalize(vP - cameraPosition);
    vec3 haze = hazeColor(view);
    float toward = pow(max(dot(normalize(vec3(view.x, 0.0, view.z)), normalize(vec3(S.x, 0.0, S.z))), 0.0), 3.0);

    // Night: a dim floor with a little form, and whatever the high beams reach.
    vec3 night = vec3(0.022, 0.024, 0.032) * (0.4 + hgt) + vec3(1.0, 0.97, 0.92) * min(headlights(vP), 2.0) * 0.08;

    // Dawn: shadowed troughs in the sky's cool colour, sunlit crests in the sun's.
    float ndl = clamp(dot(N, normalize(S + vec3(0.0, 0.08, 0.0))) * 0.5 + 0.5, 0.0, 1.0);
    vec3 shade = mix(dawnZenith(uDawn) * 2.2 + dawnHorizon(uDawn) * 0.18, dawnHorizon(uDawn) * 0.55, 0.35);
    vec3 lit = sunColor(uDawn) * 0.95 + dawnHorizon(uDawn) * 0.25;
    vec3 day = mix(shade, lit, pow(ndl, 2.2) * smoothstep(0.25, 0.75, hgt + 0.15));
    // Toward the sun the whole sea glows, brightest along the crests.
    day += sunColor(uDawn) * toward * 0.35 * smoothstep(0.3, 0.8, hgt);

    vec3 col = mix(night, day, smoothstep(0.05, 0.55, uDawn));

    // Far off it melts into the horizon.
    float far = smoothstep(1500.0, 8500.0, vDist);
    col = mix(col, haze, far);

    // Soft holes in the deck, so it reads as cloud, not floor.
    float a = smoothstep(0.24, 0.42, hgt);
    a = mix(a, 1.0, far) * uCloud;
    gl_FragColor = vec4(col * a, a);
  }
`

const vert = /* glsl */ `
  varying vec3 vP;
  varying float vDist;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = w.xyz;
    vec4 mv = viewMatrix * w;
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

export function Clouds() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { ...U, uDrift: { value: 0 }, uCloud: cloudK },
        transparent: true,
        depthWrite: false,
        // Premultiplied: the shader already multiplied colour by alpha.
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    [],
  )

  useFrame(({ clock }) => {
    // The road starts below the cloud line, so the deck only gathers once the car is well above it.
    mat.uniforms.uCloud.value = sm(HOLDS[3][1] + 20, MARKER_VH[0], drive.vh)
    // A slow drift, metres per second rather than anything you would notice moving.
    if (!reducedMotion) mat.uniforms.uDrift.value = clock.elapsedTime * 0.004
  })

  return (
    <mesh material={mat} position={[SUMMIT.x, CLOUD_Y, SUMMIT.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} frustumCulled={false}>
      <planeGeometry args={[18000, 18000, 1, 1]} />
    </mesh>
  )
}
