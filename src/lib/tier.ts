export type Tier = 'phone' | 'tablet' | 'desktop'

const params = new URLSearchParams(location.search)
const coarse = matchMedia('(pointer: coarse)').matches
const forced = params.get('q')

export const tier: Tier =
  forced === 'low' ? (innerWidth < 700 ? 'phone' : 'tablet') : forced === 'high' ? 'desktop' : innerWidth < 700 ? 'phone' : innerWidth < 1100 || coarse ? 'tablet' : 'desktop'
export const low = tier !== 'desktop'

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

// Stills only: a screenshot is a stopped frame, so ?speed=0.8 fakes the throttle.
export const forcedSpeed = params.has('speed') ? Number(params.get('speed')) : null
export const debug = params.has('debug')

export const quality = {
  phone: { segments: 260, stripStep: 3, stripCols: 13, dpr: 1.5, samples: 0, bloom: 4, radial: false, stars: 500, reflectorStep: 36 },
  tablet: { segments: 360, stripStep: 2.5, stripCols: 16, dpr: 1.5, samples: 2, bloom: 5, radial: false, stars: 800, reflectorStep: 30 },
  desktop: { segments: 600, stripStep: 2, stripCols: 22, dpr: 1.5, samples: 4, bloom: 6, radial: true, stars: 1400, reflectorStep: 24 },
}[tier]
