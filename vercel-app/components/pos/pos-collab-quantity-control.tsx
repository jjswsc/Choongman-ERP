'use client'

import { Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function clampCollabQty(n: number, max: number): number {
  const cap = Math.max(1, Math.trunc(max) || 1)
  const v = Math.trunc(n)
  if (!Number.isFinite(v) || v < 1) return 1
  return Math.min(cap, v)
}

export type PosCollabQuantityControlProps = {
  value: number
  onChange: (next: number) => void
  max: number
  className?: string
  inputClassName?: string
  size?: 'sm' | 'md'
}

/** 협업 정액 할인 적용 장수 — POS 터치·직접 입력 모두 지원 */
export function PosCollabQuantityControl({
  value,
  onChange,
  max,
  className,
  inputClassName,
  size = 'sm',
}: PosCollabQuantityControlProps) {
  const cap = Math.max(1, Math.trunc(max) || 1)
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commitDraft = (raw: string) => {
    const parsed = parseInt(raw.replace(/\D/g, ''), 10)
    const next = clampCollabQty(Number.isFinite(parsed) ? parsed : 1, cap)
    onChange(next)
    setDraft(String(next))
  }

  const bump = (delta: number) => {
    const next = clampCollabQty(value + delta, cap)
    onChange(next)
    setDraft(String(next))
  }

  const btnSize = size === 'md' ? 'h-9 w-9' : 'h-8 w-8'
  const inputH = size === 'md' ? 'h-9' : 'h-8'

  return (
    <div className={cn('flex items-center rounded-xl border border-border bg-background', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(btnSize, 'shrink-0 rounded-l-xl')}
        disabled={value <= 1}
        onClick={() => bump(-1)}
        aria-label="-"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={cn(
          inputH,
          'w-12 min-w-[2.5rem] rounded-none border-0 border-x border-border bg-transparent text-center text-sm font-semibold tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
          inputClassName
        )}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={() => commitDraft(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitDraft(draft)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(btnSize, 'shrink-0 rounded-r-xl')}
        disabled={value >= cap}
        onClick={() => bump(1)}
        aria-label="+"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
