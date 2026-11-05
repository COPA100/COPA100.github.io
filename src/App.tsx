import { lazy, Suspense, useEffect, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { low, reducedMotion } from './lib/tier'
import { TRACK_VH } from './world/script'
import { Signs } from './ui/Signs'
import { Cluster, Contact, Hero, TopBar } from './ui/Hud'
import { contact } from './data/content'

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
      <p className="mt-6 flex gap-6">
        <a className="underline" href={`mailto:${contact.email}`}>
          Email
        </a>
        <a className="underline" href={contact.github}>
          GitHub
        </a>
        <a className="underline" href={contact.linkedin}>
          LinkedIn
        </a>
      </p>
    </main>
  )
}
