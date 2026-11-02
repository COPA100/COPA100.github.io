import { heightAt, findSummit, TP } from '../src/world/ascentTerrain.ts'
Object.assign(TP, JSON.parse(process.argv[2] ?? '{}'))
const s = findSummit()
console.log('summit', s.x.toFixed(1), s.z.toFixed(1), s.h.toFixed(0))
for (let a = 0; a < 360; a += 30) {
  const row = []
  for (let r = 0; r <= 500; r += 50) {
    const x = s.x + Math.sin(a * Math.PI / 180) * r, z = s.z + Math.cos(a * Math.PI / 180) * r
    row.push(heightAt(x, z).toFixed(0).padStart(4))
  }
  console.log(String(a).padStart(3), row.join(' '))
}
