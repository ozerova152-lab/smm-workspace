import { useEffect, useState, type CSSProperties } from 'react'
import { Button } from '@mantine/core'
import { Pause, Play } from 'lucide-react'
import galaxyUrl from './assets/workspace-galaxy.png'

const stars = Array.from({ length: 43 }, (_, index) => ({
  x: ((index * 397 + index ** 2 * 13) % 997) / 10,
  y: ((index * 239 + index ** 2 * 17) % 983) / 10,
  size: index % 8 === 0 ? 2 : 1,
  offset: -(index % 17) / 3,
}))

export function SpaceScene() {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  const MotionIcon = paused ? Play : Pause

  return (
    <div className="space-scene" data-paused={paused || reducedMotion}>
      <div className="space-art" aria-hidden="true">
        <img className="space-backdrop" src={galaxyUrl} alt="" fetchPriority="high" />
        {stars.map(({ x, y, size, offset }, index) => (
          <i key={index} className="space-star" style={{
            left: x + '%', top: y + '%', width: size, height: size,
            '--star-delay': offset + 's',
          } as CSSProperties} />
        ))}
        <div className="meteor meteor-first" />
        <div className="meteor meteor-second" />
      </div>
      {!reducedMotion && (
        <Button
          className="space-control"
          variant="outline"
          size="xs"
          leftSection={<MotionIcon size={14} aria-hidden="true" />}
          onClick={() => setPaused(!paused)}
        >
          {paused ? 'Включить анимацию' : 'Пауза анимации'}
        </Button>
      )}
    </div>
  )
}
