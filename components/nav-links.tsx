'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Target,
  Building2,
  LayoutGrid,
  CircleUserRound,
  CalendarDays,
  Clock,
  ShieldCheck,
  UserPlus,
  UserMinus,
  Briefcase,
  Settings as SettingsIcon,
} from 'lucide-react'
import type { Module } from '@/types/database'

const NAV_ITEMS: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  module: Module | null
}[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { href: '/leads', label: 'Leads', icon: Target, module: 'leads' },
  { href: '/clients', label: 'Clients', icon: Building2, module: 'clients' },
  { href: '/hrm/directory', label: 'Directory', icon: LayoutGrid, module: 'directory' },
  { href: '/profile', label: 'Profile', icon: CircleUserRound, module: null },
  { href: '/hrm/leave', label: 'Leave', icon: CalendarDays, module: 'leave_attendance' },
  { href: '/hrm/attendance', label: 'Attendance', icon: Clock, module: 'leave_attendance' },
  { href: '/users', label: 'HR', icon: ShieldCheck, module: 'hr' },
  { href: '/hrm/onboarding', label: 'Onboarding', icon: UserPlus, module: 'onboarding' },
  { href: '/hrm/offboarding', label: 'Offboarding', icon: UserMinus, module: 'offboarding' },
  { href: '/hrm/recruitment', label: 'Recruitment', icon: Briefcase, module: 'recruitment' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, module: 'settings' },
]

export function NavLinks({ enabledModules }: { enabledModules: Module[] }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.filter((item) => item.module === null || enabledModules.includes(item.module)).map((item) => {
        const Icon = item.icon
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              active ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
