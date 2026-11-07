'use client'

import { useState } from 'react'
import { FolderPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { createProject, createTask } from './actions'
import { TaskFields, type TaskFieldValues } from './task-fields'

export function NewTaskDialog({
  defaults,
  clients,
  projects,
  employees,
  taskRefs,
  startOpen,
}: {
  defaults: TaskFieldValues
  clients: { id: string; name: string }[]
  projects: { id: string; name: string; client_id: string | null }[]
  employees: { id: string; name: string }[]
  taskRefs: { id: string; title: string }[]
  startOpen: boolean
}) {
  const [open, setOpen] = useState(startOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-lg">New task</DialogTitle>
          <DialogDescription>
            Owner, start date and status are pre-filled. Created-by and created-at are recorded automatically.
          </DialogDescription>
        </DialogHeader>
        <form action={createTask} className="space-y-4">
          <TaskFields
            values={defaults}
            clients={clients}
            projects={projects}
            employees={employees}
            taskRefs={taskRefs}
            showStatus={false}
          />
          <div className="flex justify-end">
            <Button type="submit">Create task</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function NewProjectDialog({ clients }: { clients: { id: string; name: string }[] }) {
  const clientOptions = [{ value: '', label: 'BYC (internal)' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderPlus /> New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg">New project</DialogTitle>
          <DialogDescription>Projects group tasks under a client, or under BYC for internal work.</DialogDescription>
        </DialogHeader>
        <form action={createProject} className="space-y-3">
          <Input name="name" placeholder="Project name, e.g. KLR Website" required />
          <FormSelect name="clientId" options={clientOptions} defaultValue="" />
          <div className="flex justify-end">
            <Button type="submit">Add project</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
