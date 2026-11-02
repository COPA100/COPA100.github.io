import { lazy, Suspense, useEffect, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { low, reducedMotion } from './lib/tier'
import { TRACK_VH } from './world/script'
import { Signs } from './ui/Signs'
import { Cluster, Contact, Hero, MapLabels, TopBar } from './ui/Hud'

const Scene = lazy(() => import('./scene/Scene'))

gsap.registerPlugin(ScrollTrigger)

const supportsWebGL = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

export default function App() {
  const [portrait, setPortrait] = useState(() => innerHeight > innerWidth)
  const [webgl] = useState(supportsWebGL)

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    if (reducedMotion) document.documentElement.classList.add('reduced')
    const onResize = () => setPortrait(innerHeight > innerWidth)
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])

  // Light smoothing on desktop only. The scroll position itself stays the browser's.
  useEffect(() => {
    if (low || reducedMotion) return
    const lenis = new Lenis({ lerp: 0.14, wheelMultiplier: 1, smoothWheel: true, syncTouch: false })
    ;(window as unknown as { __lenis: Lenis }).__lenis = lenis
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (t: number) => lenis.raf(t * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [])

  if (!webgl) return <NoWebGL />

  return (
    <>
      <Suspense fallback={null}>
        <Scene portrait={portrait} />
      </Suspense>
      <Signs portrait={portrait} />
      <MapLabels />
      <Hero />
      <Cluster />
      <TopBar />
      <Contact />
      <main className="track" style={{ height: `${TRACK_VH}vh` }} aria-hidden />
    </>
  )
}

function NoWebGL() {
  return (
    <main className="p-8 text-[#e9e4d8]">
      <h1 className="text-5xl font-bold">Colin Park</h1>
      <p className="mt-2 text-xl">Software engineer. This site needs WebGL 2 to draw the mountain.</p>
      <p className="mt-6">
        <a className="underline" href="mailto:colinpark100@gmail.com">
          colinpark100@gmail.com
        </a>
      </p>
    </main>
  )
}
