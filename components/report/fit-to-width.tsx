'use client'

import { useEffect, useRef, useState } from 'react'

/** Scales fixed-size content down to fit its container's width (never up), keeping the layout box in sync. */
export function FitToWidth({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [width])

  return (
    <div ref={ref} className="w-full" style={{ height: height * scale }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}
