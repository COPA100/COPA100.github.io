import { buildCoarse, buildStrip } from '../src/world/build.ts'
let t = performance.now()
const s = buildStrip(2, 22)
console.log('strip verts', s.position.length / 3, (performance.now() - t).toFixed(0), 'ms')
t = performance.now()
const c = buildCoarse(Number(process.argv[2] ?? 600))
console.log('coarse verts', c.position.length / 3, (performance.now() - t).toFixed(0), 'ms')
