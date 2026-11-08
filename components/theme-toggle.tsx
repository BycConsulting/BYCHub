'use client'

import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {}
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  )
}
