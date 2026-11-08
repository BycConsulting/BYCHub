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
  ListTodo,
  Settings as SettingsIcon,
  Wallet,
  MessageSquare,
} from 'lucide-react'
import type { Module } from '@/types/database'

export interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  module: Module | null
  adminOnly?: boolean
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
      { href: '/hrm/tasks', label: 'Tasks', icon: ListTodo, module: 'tasks' },
      { href: '/chat', label: 'Chat', icon: MessageSquare, module: null },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/leads', label: 'Leads', icon: Target, module: 'leads' },
      { href: '/clients', label: 'Clients', icon: Building2, module: 'clients' },
      { href: '/finance', label: 'Finance', icon: Wallet, module: null, adminOnly: true },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/hrm/directory', label: 'Directory', icon: LayoutGrid, module: 'directory' },
      { href: '/hrm/leave', label: 'Leave', icon: CalendarDays, module: 'leave_attendance' },
      { href: '/hrm/attendance', label: 'Attendance', icon: Clock, module: 'leave_attendance' },
      { href: '/hrm/recruitment', label: 'Recruitment', icon: Briefcase, module: 'recruitment' },
      { href: '/hrm/onboarding', label: 'Onboarding', icon: UserPlus, module: 'onboarding' },
      { href: '/hrm/offboarding', label: 'Offboarding', icon: UserMinus, module: 'offboarding' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/profile', label: 'Profile', icon: CircleUserRound, module: null },
      { href: '/users', label: 'HR admin', icon: ShieldCheck, module: 'hr' },
      { href: '/settings', label: 'Settings', icon: SettingsIcon, module: 'settings' },
    ],
  },
]

/** Groups with only the items this user may see; empty groups are dropped. */
export function visibleNavGroups(enabledModules: Module[], isAdmin: boolean) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => (item.module === null || enabledModules.includes(item.module)) && (!item.adminOnly || isAdmin)
    ),
  })).filter((group) => group.items.length > 0)
}
