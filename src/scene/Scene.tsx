import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { quality } from '../lib/tier'
import { camRef } from '../ui/Hud'
import { Director } from './Director'
import { Mounts } from './Mounts'
import { Post } from './Post'
import { Road } from './Road'
import { Sky } from './Sky'
import { Terrain } from './Terrain'

// R3F still constructs THREE.Clock internally; three's deprecation notice for it isn't actionable here.
THREE.setConsoleFunction((level, message, ...rest) => {
  if (typeof message === 'string' && message.includes('THREE.Clock')) return
  ;(console as unknown as Record<string, (...a: unknown[]) => void>)[level](message, ...rest)
})

function Share() {
  const { camera, size } = useThree()
  useEffect(() => {
    camRef.cam = camera as THREE.PerspectiveCamera
    camRef.w = size.width
    camRef.h = size.height
  }, [camera, size])
  return null
}

export default function Scene({ portrait }: { portrait: boolean }) {
  return (
    <Canvas
      className="stage"
      dpr={[1, quality.dpr]}
      flat
      linear
      frameloop="always"
      gl={{ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      camera={{ near: 0.3, far: 16000, fov: 40, position: [0, 600, 1500] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping
        gl.setClearColor(0x000000, 1)
      }}
    >
      <Share />
      <Sky />
      <Terrain />
      <Road />
      <Mounts portrait={portrait} />
      <Director />
      <Post />
    </Canvas>
  )
}
