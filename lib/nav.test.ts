import { describe, expect, it } from 'vitest'
import { activeItem, activeSection, visibleSections } from './nav'
import type { Module } from '@/types/database'

const ALL: Module[] = [
  'dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding', 'recruitment', 'tasks',
]

describe('visibleSections', () => {
  it('shows every section to an admin with all modules', () => {
    expect(visibleSections(ALL, true).map((s) => s.label)).toEqual([
      'Dashboard', 'Marketing', 'Sales', 'Tasks', 'People', 'Finance', 'Admin',
    ])
  })
  it('hides Finance from non-admins', () => {
    expect(visibleSections(ALL, false).map((s) => s.label)).not.toContain('Finance')
  })
  it('drops items for modules the role does not have, and empty sections', () => {
    const sections = visibleSections(['dashboard', 'tasks'], false)
    expect(sections.map((s) => s.label)).toEqual(['Dashboard', 'Tasks'])
  })
  it('never lists Chat in the menu', () => {
    const labels = visibleSections(ALL, true).flatMap((s) => s.items.map((i) => i.label))
    expect(labels).not.toContain('Chat')
  })
  it('gives each section a landing href equal to its first item', () => {
    for (const s of visibleSections(ALL, true)) expect(s.href).toBe(s.items[0].href)
  })
})

describe('activeItem / activeSection', () => {
  const sections = visibleSections(ALL, true)

  it('picks the longest matching href so /users/config does not also light up HR admin', () => {
    const section = activeSection(sections, '/users/config')!
    expect(section.label).toBe('Admin')
    expect(activeItem(section, '/users/config')?.label).toBe('HR config')
  })
  it('treats a client report page as Marketing > Meta reports', () => {
    const path = '/clients/11111111-1111-4111-8111-111111111111/reports/22222222-2222-4222-8222-222222222222/edit'
    const section = activeSection(sections, path)!
    expect(section.label).toBe('Marketing')
    expect(activeItem(section, path)?.label).toBe('Meta reports')
  })
  it('treats a plain client page as Sales > Clients', () => {
    const section = activeSection(sections, '/clients/11111111-1111-4111-8111-111111111111')!
    expect(section.label).toBe('Sales')
    expect(activeItem(section, '/clients/11111111-1111-4111-8111-111111111111')?.label).toBe('Clients')
  })
  it('returns undefined for a path outside the menu', () => {
    expect(activeSection(sections, '/nowhere')).toBeUndefined()
  })
})
