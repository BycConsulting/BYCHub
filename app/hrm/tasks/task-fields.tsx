'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormSelect } from '@/components/ui/form-select'
import type { TaskPriority, TaskStatus } from '@/types/database'

export interface TaskFieldValues {
  clientId: string
  projectId: string
  title: string
  description: string
  expectedOutput: string
  assigneeId: string
  supportIds: string[]
  noSupport: boolean
  priority: TaskPriority
  estimatedHours: string
  dependencyTaskIds: string[]
  dependencyNote: string
  noDependencies: boolean
  startDate: string
  endDate: string
  status: TaskStatus
  blockerReason: string
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  started: 'Started',
  in_progress: 'In Progress',
  blocked: 'Blocked / Waiting',
  done: 'Completed',
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const STATUS_OPTIONS = (Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((value) => ({
  value,
  label: TASK_STATUS_LABELS[value],
}))

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  )
}

function CheckList({
  name,
  items,
  defaultChecked,
  disabled,
}: {
  name: string
  items: { id: string; label: string }[]
  defaultChecked: string[]
  disabled?: boolean
}) {
  return (
    <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name={name}
            value={item.id}
            defaultChecked={defaultChecked.includes(item.id)}
            disabled={disabled}
          />
          {item.label}
        </label>
      ))}
      {items.length === 0 && <p className="text-sm text-slate-400">Nothing to pick yet.</p>}
    </div>
  )
}

/**
 * All task parameters in one form body, shared by "new task" and the
 * detail page's edit form. Project choices follow the selected client
 * ("BYC (internal)" = no client).
 */
export function TaskFields({
  values,
  clients,
  projects,
  employees,
  taskRefs,
  showStatus,
}: {
  values: TaskFieldValues
  clients: { id: string; name: string }[]
  projects: { id: string; name: string; client_id: string | null }[]
  employees: { id: string; name: string }[]
  taskRefs: { id: string; title: string }[]
  showStatus: boolean
}) {
  const [clientId, setClientId] = useState(values.clientId)
  const [noSupport, setNoSupport] = useState(values.noSupport)
  const [noDeps, setNoDeps] = useState(values.noDependencies)

  const clientOptions = [{ value: '', label: 'BYC (internal)' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]
  const projectOptions = projects
    .filter((p) => (p.client_id ?? '') === clientId)
    .map((p) => ({ value: p.id, label: p.name }))
  const employeeOptions = employees.map((e) => ({ value: e.id, label: e.name }))

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <Field label="Client / Internal *">
        <FormSelect name="clientId" options={clientOptions} defaultValue={values.clientId} onValueChange={setClientId} />
      </Field>
      <Field label="Project *" className="md:col-span-1">
        <FormSelect
          key={clientId}
          name="projectId"
          options={projectOptions}
          defaultValue={clientId === values.clientId ? values.projectId : ''}
          placeholder={projectOptions.length ? 'Select project' : 'No projects — add one first'}
        />
      </Field>
      <Field label="Task title *" className="md:col-span-2">
        <Input name="title" defaultValue={values.title} placeholder="Specific action" required />
      </Field>

      <Field label="Description / brief *" className="md:col-span-2">
        <Textarea
          name="description"
          defaultValue={values.description}
          placeholder="Scope, context, instructions and references"
          required
        />
      </Field>
      <Field label="Expected output *" className="md:col-span-2">
        <Textarea
          name="expectedOutput"
          defaultValue={values.expectedOutput}
          placeholder="Deliverable, and when the task counts as complete"
          required
        />
      </Field>

      <Field label="Task owner *">
        <FormSelect name="assigneeId" options={employeeOptions} defaultValue={values.assigneeId} placeholder="Select owner" />
      </Field>
      <Field label="Support *" className="md:col-span-2">
        <CheckList
          name="supportIds"
          items={employees.map((e) => ({ id: e.id, label: e.name }))}
          defaultChecked={values.supportIds}
          disabled={noSupport}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="noSupport"
            defaultChecked={values.noSupport}
            onChange={(e) => setNoSupport(e.target.checked)}
          />
          No support needed
        </label>
      </Field>
      <Field label="Priority *">
        <FormSelect name="priority" options={PRIORITY_OPTIONS} defaultValue={values.priority} />
      </Field>

      <Field label="Estimated effort (hours) *">
        <Input name="estimatedHours" type="number" min="0.25" step="0.25" defaultValue={values.estimatedHours} required />
      </Field>
      <Field label="Start date *">
        <Input name="startDate" type="date" defaultValue={values.startDate} required />
      </Field>
      <Field label="End date (deadline) *">
        <Input name="endDate" type="date" defaultValue={values.endDate} required />
      </Field>
      {showStatus ? (
        <Field label="Status *">
          <FormSelect name="status" options={STATUS_OPTIONS} defaultValue={values.status} />
        </Field>
      ) : (
        <div />
      )}

      <Field label="Dependencies *" className="md:col-span-2">
        <CheckList
          name="dependencyTaskIds"
          items={taskRefs.map((t) => ({ id: t.id, label: t.title }))}
          defaultChecked={values.dependencyTaskIds}
          disabled={noDeps}
        />
        <Input
          name="dependencyNote"
          defaultValue={values.dependencyNote}
          placeholder="Other inputs needed (e.g. client logo, access)"
          disabled={noDeps}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="noDependencies"
            defaultChecked={values.noDependencies}
            onChange={(e) => setNoDeps(e.target.checked)}
          />
          No dependencies
        </label>
      </Field>
      <Field label="Blocker / waiting reason" className="md:col-span-2">
        <Textarea
          name="blockerReason"
          defaultValue={values.blockerReason}
          placeholder="Required when status is Blocked / Waiting: what is pending and who needs to act"
        />
      </Field>
    </div>
  )
}
