// Per-frame state, deliberately outside React. The Director writes it; shaders and the DOM read it.
import * as THREE from 'three'

export const drive = {
  vh: 0, // scroll position in viewport heights
  s: 0, // car position along the road, metres
  v: 0, // m/s along the road
  speed: 0, // 0..1 throttle feel
  mph: 0,
  feet: 0,
  climb: 0, // 0..1 from trailhead to overlook
  map: 0, // 0..1 how far into the survey map we are
  ready: false,
  vis: 1,
  high: 0,
  highTarget: 0,
}

// Uniforms shared by reference across every lit material.
export const U = {
  uCar: { value: new THREE.Vector3() },
  uCarF: { value: new THREE.Vector3(0, 0, -1) },
  uCarR: { value: new THREE.Vector3(1, 0, 0) },
  uCarU: { value: new THREE.Vector3(0, 1, 0) },
  uCarS: { value: 0 },
  uSpeed: { value: 0 },
  uBrake: { value: 0.6 },
  uTime: { value: 0 },
  uLights: { value: 0 },
  uTail: { value: 0 },
  uHigh: { value: 0 },
  uAmb: { value: 0 },
  uMap: { value: 0 },
  uEmberY: { value: 0 },
  uEmberA: { value: 0 },
  uFogN: { value: 600 },
  uFogF: { value: 2600 },
  uDpr: { value: 1 },
  uPx: { value: 0.001 },
}

// Colours are written straight to the display, with no output conversion.
export const BONE = new THREE.Color(0.913, 0.894, 0.847)
export const ACCENT = new THREE.Color(1.0, 0.23, 0.13)
