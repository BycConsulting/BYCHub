import { createClient } from '@/lib/supabase/server'
import type { z } from 'zod'
import type { taskFieldsSchema } from '@/lib/validation'

type Supabase = Awaited<ReturnType<typeof createClient>>
export type TaskFields = z.infer<typeof taskFieldsSchema>

/** Lists the task form needs: clients, projects, active employees, existing tasks (for dependencies). */
export async function loadTaskFormOptions(supabase: Supabase) {
  const [clients, projects, employees, taskRefs] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('projects').select('id, name, client_id').order('name'),
    supabase.from('users').select('id, name').eq('is_active', true).order('name'),
    supabase.from('tasks').select('id, title, status').order('created_at', { ascending: false }),
  ])
  return {
    clients: clients.data ?? [],
    projects: projects.data ?? [],
    employees: employees.data ?? [],
    taskRefs: taskRefs.data ?? [],
  }
}

/** Today as YYYY-MM-DD in the server's local time — default for new tasks' start date. */
export function todayISO() {
  return new Date().toLocaleDateString('en-CA')
}

/** The project must belong to the chosen client (or be internal when none). Returns an error message or null. */
export async function checkProjectMatchesClient(supabase: Supabase, projectId: string, clientId: string | undefined) {
  const { data: project } = await supabase.from('projects').select('client_id').eq('id', projectId).single()
  if (!project) return 'Project not found'
  if ((project.client_id ?? '') !== (clientId ?? '')) return 'Project does not belong to the selected client'
  return null
}

/** Task columns derived from validated form fields; shared by create and update. */
export function taskColumns(f: TaskFields) {
  return {
    title: f.title,
    description: f.description,
    expected_output: f.expectedOutput,
    client_id: f.clientId || null,
    project_id: f.projectId,
    assignee_id: f.assigneeId,
    support_ids: f.noSupport ? [] : f.supportIds,
    no_support_needed: f.noSupport,
    priority: f.priority,
    estimated_hours: f.estimatedHours,
    dependency_task_ids: f.noDependencies ? [] : f.dependencyTaskIds,
    dependency_note: f.noDependencies ? '' : f.dependencyNote,
    start_date: f.startDate,
    due_date: f.endDate,
  }
}
