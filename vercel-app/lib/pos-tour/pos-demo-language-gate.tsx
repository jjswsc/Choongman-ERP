'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Languages } from 'lucide-react'
import { usePosTour } from './pos-tour-context'
import { useT } from '@/lib/i18n'
import { ADMIN_UI_LANG_OPTIONS, useLang } from '@/lib/lang-context'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const OVERLAY_Z = 100
const TOOLTIP_Z = OVERLAY_Z + 1

/** 데모 투어: 스텝 설명과 동일(오른쪽 상단) 위치 — 먼저 언어 선택 + 가이드 시작 */
export function PosDemoLanguageGate() {
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const { completePreTourLanguage, endTour } = usePosTour()

  const content = (
    <div
      className="pointer-events-auto fixed inset-0 bg-black/55"
      style={{ zIndex: OVERLAY_Z }}
      role="dialog"
      aria-modal="true"
      aria-label={t('posDemoLanguageGateAria')}
    >
      <div
        className={cn(
          'pointer-events-auto absolute max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl',
          'left-1/2 top-[72px] w-[min(100vw-1.5rem,22rem)] -translate-x-1/2',
          'sm:bottom-8 sm:left-auto sm:right-8 sm:top-auto sm:translate-x-0'
        )}
        style={{ zIndex: TOOLTIP_Z }}
      >
        <p className="text-xs text-muted-foreground">
          {t('posDemoLanguageGateKicker')}
        </p>
        <p className="mt-1 text-base font-semibold leading-tight">
          {t('posDemoLanguageGateTitle')}
        </p>
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-foreground" id="pos-demo-lang-label">
            {t('posLanguage')}
          </p>
          <Select
            value={lang}
            onValueChange={(v) => {
              if (v) setLang(v as typeof lang)
            }}
            aria-labelledby="pos-demo-lang-label"
          >
            <SelectTrigger className="h-10 w-full gap-2" aria-label={t('posLanguage')}>
              <Languages className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_UI_LANG_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-auto"
            onClick={endTour}
          >
            {t('posTourEnd')}
          </Button>
          <Button type="button" size="sm" onClick={completePreTourLanguage}>
            {t('posDemoLanguageGateStart')}
          </Button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
