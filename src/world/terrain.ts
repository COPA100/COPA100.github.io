// Natural ground, in metres. The Ascent's procedural massif, scaled up so a car fits on it.
import { heightAt } from './ascentTerrain.ts'

export const SCALE = 2
export const natural = (x: number, z: number) => SCALE * heightAt(x / SCALE, z / SCALE)
export const SUMMIT = { x: 106.2, z: 83.8, h: 988 }
// The top of the sea of clouds that fills the valleys at sunrise, in metres. The car parks at about 816.
export const CLOUD_Y = 455
