'use client'

import * as React from 'react'
import { splitPromoChoiceGroups } from '@/lib/pos-promo-choice'
import type { QrGuestPromoLine, QrPromoPick } from '@/lib/qr-table-promo'

type Props = {
  open: boolean
  menuName: string
  lines: QrGuestPromoLine[]
  t: (key: string) => string
  onClose: () => void
  onPick: (picks: QrPromoPick[]) => void
}

function slotLabel(key: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    main: 'setSlotMain',
    side: 'setSlotSide',
    drink: 'setSlotDrink',
    sauce: 'setSlotSauce',
  }
  const i18nKey = map[String(key || '').trim().toLowerCase()]
  if (!i18nKey) return key
  const label = t(i18nKey)
  return label && label !== i18nKey ? label : key
}

function lineLabel(line: { menuName?: string; optionName?: string; quantity?: number }): string {
  const name = String(line.menuName || '').trim() || '—'
  const opt = String(line.optionName || '').trim()
  const qty = Math.max(1, Math.floor(Number(line.quantity) || 1))
  const base = opt ? `${name} (${opt})` : name
  return qty > 1 ? `${base} ×${qty}` : base
}

export function QrTableGuestSetSheet({ open, menuName, lines, t, onClose, onPick }: Props) {
  const [selected, setSelected] = React.useState<Record<string, string[]>>({})

  const { fixedItems, groups } = React.useMemo(() => {
    return splitPromoChoiceGroups(
      (lines || []).map((line) => ({
        menuId: String(line.menuId),
        optionId: line.optionId != null && Number(line.optionId) > 0 ? String(line.optionId) : null,
        optionCode: line.optionCode || null,
        quantity: Math.max(1, Number(line.quantity) || 1),
        choiceGroup: line.choiceGroup,
        choicePickCount: line.choicePickCount,
        menuName: line.menuName,
        optionName: line.optionName,
      }))
    )
  }, [lines])

  const signature = (lines || [])
    .map((line) => `${line.menuId}:${line.optionId || ''}:${line.choiceGroup || ''}:${line.quantity}`)
    .join('|')
  React.useEffect(() => {
    if (!open) return
    const next: Record<string, string[]> = {}
    for (const group of groups) next[group.key] = []
    setSelected(next)
    // groups는 signature와 같이 바뀐다. 시트가 닫혀 있을 때 빈 배열이 매 렌더 새로 생겨도 선택 상태를 리셋하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signature])

  if (!open) return null

  const ready = groups.every((group) => (selected[group.key] || []).length === group.pickCount)

  function toggle(groupKey: string, rowKey: string, pickCount: number) {
    setSelected((prev) => {
      const current = prev[groupKey] || []
      const exists = current.includes(rowKey)
      let next = exists ? current.filter((key) => key !== rowKey) : [...current, rowKey]
      if (next.length > pickCount) next = next.slice(next.length - pickCount)
      return { ...prev, [groupKey]: next }
    })
  }

  function confirm() {
    if (!ready) return
    const picks: QrPromoPick[] = []
    for (const group of groups) {
      const keys = new Set(selected[group.key] || [])
      for (const row of group.lines) {
        if (!keys.has(row.rowKey)) continue
        const menuId = Math.floor(Number(row.menuId) || 0)
        if (!menuId) continue
        const optionId = Math.floor(Number(row.optionId) || 0)
        picks.push({
          menuId,
          optionId: optionId > 0 ? optionId : null,
          quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)),
        })
      }
    }
    onPick(picks)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45" role="presentation" onClick={onClose}>
      <div
        className="flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1.5 w-10 rounded-full bg-stone-200" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-1">
          <div className="min-w-0">
            <p className="text-base font-semibold">{menuName}</p>
            <p className="text-xs text-stone-500">{t('setChoose')}</p>
          </div>
          <button
            type="button"
            className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700"
            onClick={onClose}
          >
            {t('close')}
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {fixedItems.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{t('setIncluded')}</p>
              <ul className="space-y-1">
                {fixedItems.map((line, index) => (
                  <li key={`fixed-${line.menuId}-${index}`} className="text-sm text-stone-800">
                    {lineLabel(line as { menuName?: string; optionName?: string; quantity?: number })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {groups.map((group) => {
            const picked = selected[group.key] || []
            return (
              <div key={group.key}>
                <p className="mb-1.5 text-sm font-semibold text-stone-800">
                  {slotLabel(group.key, t)}
                  <span className="ml-1 font-medium text-stone-500">
                    {t('setPick').replace('{n}', String(group.pickCount))}
                  </span>
                </p>
                <div className="grid gap-2">
                  {group.lines.map((line) => {
                    const on = picked.includes(line.rowKey)
                    return (
                      <button
                        key={line.rowKey}
                        type="button"
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium ${
                          on
                            ? 'border-[var(--qr-brand,#b45309)] bg-[var(--qr-brand,#b45309)]/10 text-stone-900'
                            : 'border-stone-200 bg-stone-50 text-stone-800'
                        }`}
                        onClick={() => toggle(group.key, line.rowKey, group.pickCount)}
                      >
                        {lineLabel(line as { menuName?: string; optionName?: string; quantity?: number })}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="border-t border-stone-100 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            disabled={!ready}
            className="w-full rounded-2xl bg-[var(--qr-brand,#b45309)] py-3.5 text-[15px] font-semibold text-white disabled:opacity-40"
            onClick={confirm}
          >
            {t('setAdd')}
          </button>
        </div>
      </div>
    </div>
  )
}
