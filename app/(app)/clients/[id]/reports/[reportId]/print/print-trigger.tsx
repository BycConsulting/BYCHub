'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Forces the light theme (so the PDF never prints dark) and opens the print dialog once charts have drawn. */
export function PrintTrigger() {
  useEffect(() => {
    const root = document.documentElement
    const wasDark = root.classList.contains('dark')
    root.classList.remove('dark')
    const timer = window.setTimeout(() => window.print(), 1200)
    return () => {
      window.clearTimeout(timer)
      if (wasDark) root.classList.add('dark')
    }
  }, [])

  return (
    <div className="mb-4 flex items-center gap-3 print:hidden">
      <Button onClick={() => window.print()}>
        <Printer /> Print / Save as PDF
      </Button>
      <span className="text-sm text-muted-foreground">Choose “Save as PDF” as the destination. Margins: none.</span>
    </div>
  )
}
