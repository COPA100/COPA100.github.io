import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { U, drive } from '../lib/state'
import { quality, reducedMotion } from '../lib/tier'

// Hand-rolled post: dual-filter bloom for the lamps, a radial smear at speed on desktop,
// a soft shoulder so the lamps never clip hard, lens falloff and a little grain.

const quadVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const downFrag = /* glsl */ `
precision highp float;
uniform sampler2D tMap; uniform vec2 uTexel; uniform float uPrefilter;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tMap, vUv).rgb * 4.0;
  c += texture2D(tMap, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture2D(tMap, vUv + vec2(o.x, -o.y)).rgb;
  c += texture2D(tMap, vUv + vec2(-o.x, o.y)).rgb;
  c += texture2D(tMap, vUv + vec2(o.x, o.y)).rgb;
  c /= 8.0;
  if (uPrefilter > 0.5) {
    c = min(c, vec3(30.0));
    float l = max(c.r, max(c.g, c.b));
    c *= smoothstep(1.0, 2.6, l);
  }
  gl_FragColor = vec4(c, 1.0);
}`

const upFrag = /* glsl */ `
precision highp float;
uniform sampler2D tMap; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tMap, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(tMap, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  c += texture2D(tMap, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += texture2D(tMap, vUv + vec2(o.x, o.y)).rgb * 2.0;
  c += texture2D(tMap, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(tMap, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  c += texture2D(tMap, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(tMap, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0, 1.0);
}`

const compositeFrag = /* glsl */ `
precision highp float;
uniform sampler2D tScene, tBloom;
uniform float uSpeedFx, uTime, uVis, uAspect;
uniform vec2 uVP;
varying vec2 vUv;
float h12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec3 shoulder(vec3 c) {
  // Linear to 0.8, then rolls off towards 1, so lamps glow instead of clipping.
  vec3 k = max(c - 0.8, 0.0);
  return min(c, 0.8) + 0.2 * (1.0 - exp(-k / 0.2));
}
void main() {
  vec2 uv = vUv;
  vec3 col;
#ifdef RADIAL
  vec2 toVP = uVP - uv;
  float edge = smoothstep(0.1, 0.75, length(toVP * vec2(uAspect, 1.0)));
  float amt = uSpeedFx * 0.09 * edge;
  if (amt > 0.0005) {
    col = vec3(0.0);
    float j = h12(gl_FragCoord.xy) - 0.5;
    for (int i = 0; i < 6; i++) {
      float t = (float(i) + j) / 6.0;
      col += texture2D(tScene, uv + toVP * amt * t).rgb;
    }
    col /= 6.0;
  } else {
    col = texture2D(tScene, uv).rgb;
  }
#else
  col = texture2D(tScene, uv).rgb;
#endif
  col += texture2D(tBloom, uv).rgb * 0.42;
  vec2 c = (uv - 0.5) * vec2(min(uAspect, 1.6), 1.0);
  col *= 1.0 - dot(c, c) * 0.42;
  col = shoulder(col);
  col *= uVis;
  float g = h12(gl_FragCoord.xy + fract(uTime) * 311.0) - 0.5;
  col += g * 0.018;
  gl_FragColor = vec4(col, 1.0);
}`

const tmpDir = new THREE.Vector3()
const tmpP = new THREE.Vector3()

export function Post() {
  const { gl, scene, camera, size, viewport } = useThree()

  const pipe = useMemo(() => {
    const levels = quality.bloom
    const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    const sceneRT = new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, depthBuffer: true, samples: quality.samples })
    const chain = Array.from({ length: levels }, () => new THREE.WebGLRenderTarget(4, 4, rtOpts))
    const tri = new THREE.BufferGeometry()
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>, extra: Partial<THREE.ShaderMaterialParameters> = {}) =>
      new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: frag, depthTest: false, depthWrite: false, uniforms, ...extra })
    const down = mk(downFrag, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 } })
    const up = mk(upFrag, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } }, { transparent: true, blending: THREE.AdditiveBlending })
    const composite = mk(
      compositeFrag,
      {
        tScene: { value: sceneRT.texture },
        tBloom: { value: chain[0].texture },
        uSpeedFx: { value: 0 },
        uTime: U.uTime,
        uVis: { value: 1 },
        uAspect: { value: 1 },
        uVP: { value: new THREE.Vector2(0.5, 0.5) },
      },
      { defines: quality.radial ? { RADIAL: 1 } : {} },
    )
    const quad = new THREE.Mesh(tri, down)
    quad.frustumCulled = false
    const quadScene = new THREE.Scene()
    quadScene.add(quad)
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { sceneRT, chain, down, up, composite, quad, quadScene, ortho }
  }, [])

  useEffect(() => {
    const dpr = viewport.dpr
    const w = Math.floor(size.width * dpr)
    const h = Math.floor(size.height * dpr)
    pipe.sceneRT.setSize(w, h)
    pipe.chain.forEach((rt, i) => {
      const d = 2 ** (i + 1)
      rt.setSize(Math.max(2, Math.floor(w / d)), Math.max(2, Math.floor(h / d)))
    })
    pipe.composite.uniforms.uAspect.value = w / h
  }, [size, viewport.dpr, pipe])

  useFrame(() => {
    const { sceneRT, chain, down, up, composite, quad, quadScene, ortho } = pipe
    gl.autoClear = true
    gl.setRenderTarget(sceneRT)
    gl.render(scene, camera)
    const blit = (src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget, mat: THREE.ShaderMaterial, clear = true) => {
      mat.uniforms.tMap.value = src.texture
      mat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height)
      quad.material = mat
      gl.autoClear = clear
      gl.setRenderTarget(dst)
      gl.render(quadScene, ortho)
    }
    down.uniforms.uPrefilter.value = 1
    blit(sceneRT, chain[0], down)
    down.uniforms.uPrefilter.value = 0
    for (let i = 1; i < chain.length; i++) blit(chain[i - 1], chain[i], down)
    for (let i = chain.length - 1; i > 0; i--) blit(chain[i], chain[i - 1], up, false)

    const u = composite.uniforms
    u.uSpeedFx.value = reducedMotion ? 0 : U.uSpeed.value
    // Black until the mountain is built, then up from black: never the half-built scene.
    const born = drive.ready ? Math.min(1, drive.since / 0.45) : 0
    u.uVis.value = drive.vis * born * born
    camera.getWorldDirection(tmpDir)
    tmpP.copy(camera.position).addScaledVector(tmpDir, 100).project(camera)
    u.uVP.value.set(tmpP.x * 0.5 + 0.5, tmpP.y * 0.5 + 0.5)
    quad.material = composite
    gl.autoClear = true
    gl.setRenderTarget(null)
    gl.render(quadScene, ortho)
  }, 1)

  return null
}
