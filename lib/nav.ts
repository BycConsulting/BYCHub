import {
  LayoutDashboard,
  Megaphone,
  Target,
  ListTodo,
  Users,
  Wallet,
  ShieldCheck,
} from 'lucide-react'
import type { Module } from '@/types/database'

export interface NavItem {
  href: string
  label: string
  module: Module | null
  adminOnly?: boolean
  /** Extra paths that belong to this item (e.g. report pages that live under /clients). */
  match?: RegExp
}

export interface NavSection {
  label: string
  icon: typeof LayoutDashboard
  items: NavItem[]
}

export type VisibleSection = NavSection & { href: string }

/** Top menu sections; each section's items are the tabs shown under the top menu. */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    items: [{ href: '/dashboard', label: 'Dashboard', module: 'dashboard' }],
  },
  {
    label: 'Marketing',
    icon: Megaphone,
    items: [
      { href: '/marketing/meta', label: 'Meta reports', module: 'clients', match: /^\/clients\/[^/]+\/reports/ },
      { href: '/marketing/ad-accounts', label: 'Ad accounts', module: 'clients' },
      { href: '/marketing/metrics', label: 'Client metrics', module: 'clients', match: /^\/clients\/[^/]+\/dashboard/ },
    ],
  },
  {
    label: 'Sales',
    icon: Target,
    items: [
      { href: '/leads', label: 'Leads', module: 'leads' },
      { href: '/clients', label: 'Clients', module: 'clients' },
    ],
  },
  {
    label: 'Tasks',
    icon: ListTodo,
    items: [{ href: '/hrm/tasks', label: 'Board', module: 'tasks' }],
  },
  {
    label: 'People',
    icon: Users,
    items: [
      { href: '/hrm/directory', label: 'Directory', module: 'directory' },
      { href: '/hrm/leave', label: 'Leave', module: 'leave_attendance' },
      { href: '/hrm/attendance', label: 'Attendance', module: 'leave_attendance' },
      { href: '/hrm/recruitment', label: 'Recruitment', module: 'recruitment' },
      { href: '/hrm/onboarding', label: 'Onboarding', module: 'onboarding' },
      { href: '/hrm/offboarding', label: 'Offboarding', module: 'offboarding' },
    ],
  },
  {
    label: 'Finance',
    icon: Wallet,
    items: [
      { href: '/finance', label: 'Transactions', module: null, adminOnly: true },
      { href: '/finance/categories', label: 'Categories', module: null, adminOnly: true },
    ],
  },
  {
    label: 'Admin',
    icon: ShieldCheck,
    items: [
      { href: '/users', label: 'HR admin', module: 'hr' },
      { href: '/users/config', label: 'HR config', module: 'hr' },
      { href: '/settings', label: 'Settings', module: 'settings' },
      { href: '/settings/permissions', label: 'Permissions', module: 'settings' },
    ],
  },
]

/** Sections with only the items this user may see; empty sections are dropped. */
export function visibleSections(enabledModules: Module[], isAdmin: boolean): VisibleSection[] {
  return NAV_SECTIONS.flatMap((section) => {
    const items = section.items.filter(
      (item) => (item.module === null || enabledModules.includes(item.module)) && (!item.adminOnly || isAdmin)
    )
    return items.length > 0 ? [{ ...section, items, href: items[0].href }] : []
  })
}

function score(item: NavItem, pathname: string): number {
  if (item.match?.test(pathname)) return 10_000
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.href.length
  return 0
}

/** The best-matching item across all sections: a custom match wins, otherwise the longest href. */
function bestMatch(sections: VisibleSection[], pathname: string): { section: VisibleSection; item: NavItem } | undefined {
  let best: { section: VisibleSection; item: NavItem; score: number } | undefined
  for (const section of sections) {
    for (const item of section.items) {
      const s = score(item, pathname)
      if (s > 0 && (!best || s > best.score)) best = { section, item, score: s }
    }
  }
  return best
}

export function activeSection(sections: VisibleSection[], pathname: string): VisibleSection | undefined {
  return bestMatch(sections, pathname)?.section
}

export function activeItem(section: VisibleSection, pathname: string): NavItem | undefined {
  const best = bestMatch([section], pathname)
  return best?.item
}
