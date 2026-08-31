'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface FormSelectOption {
  value: string
  label: string
  disabled?: boolean
}

/**
 * Bridges shadcn's Radix-based Select (which doesn't participate in native
 * form submission) to a plain <form action={serverAction}> FormData post —
 * a hidden input mirrors the selected value under `name`.
 */
export function FormSelect({
  name,
  options,
  defaultValue = '',
  placeholder,
  className,
}: {
  name: string
  options: FormSelectOption[]
  defaultValue?: string
  placeholder?: string
  className?: string
}) {
  const [value, setValue] = useState(defaultValue)

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className={cn('w-full', className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
