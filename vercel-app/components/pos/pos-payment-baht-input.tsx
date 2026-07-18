'use client'

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
} from 'react'
import { Input } from '@/components/ui/input'
import {
  formatBahtInputDisplay,
  selectionAfterBahtFormat,
} from '@/lib/baht-input-format'
import { cn } from '@/lib/utils'

export type PosPaymentAmountFocusBind = {
  'data-pos-payment-amount': '1'
  onPointerDown: (e: PointerEvent<HTMLInputElement>) => void
  onFocus: (e: FocusEvent<HTMLInputElement>) => void
  onBlur: () => void
}

type PosPaymentBahtInputProps = {
  value: string
  onValueChange: (next: string) => void
  focusBind: PosPaymentAmountFocusBind
  className?: string
  placeholder?: string
  /** 포커스 표시·스캔 락용 (부모 cart-panel) */
  markFocused?: (el: HTMLInputElement) => void
}

/**
 * 결제 모달 바트 금액 입력.
 * - 포커스 중 로컬 state로 부모 리렌더와 분리 (한 글자마다 포커스 끊김 재발 방지)
 * - 콤마 포맷 후 캐럿 복원
 * - memo로 불필요한 재마운트 억제
 */
export const PosPaymentBahtInput = memo(
  forwardRef<HTMLInputElement, PosPaymentBahtInputProps>(function PosPaymentBahtInput(
    { value, onValueChange, focusBind, className, placeholder, markFocused },
    ref
  ) {
    const [local, setLocal] = useState(value)
    const localRef = useRef(local)
    localRef.current = local
    const inputRef = useRef<HTMLInputElement | null>(null)
    const focusedRef = useRef(false)

    const setRefs = useCallback(
      (el: HTMLInputElement | null) => {
        inputRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      },
      [ref]
    )

    // 비포커스: 부모 값(초기화·권종·합계 동기화) 반영 / 포커스 중: 권종 버튼 등 외부 갱신만
    useEffect(() => {
      if (focusedRef.current && value === localRef.current) return
      setLocal(value)
    }, [value])

    const applyFormatted = useCallback(
      (raw: string, el: HTMLInputElement) => {
        markFocused?.(el)
        const caret = el.selectionStart ?? raw.length
        const formatted = formatBahtInputDisplay(raw)
        const nextCaret = selectionAfterBahtFormat(raw, caret, formatted)
        setLocal(formatted)
        onValueChange(formatted)
        window.requestAnimationFrame(() => {
          const node = inputRef.current
          if (!node) return
          if (document.activeElement !== node) {
            node.focus({ preventScroll: true })
          }
          try {
            node.setSelectionRange(nextCaret, nextCaret)
          } catch {
            /* WebView 일부는 selection 미지원 */
          }
        })
      },
      [markFocused, onValueChange]
    )

    return (
      <Input
        ref={setRefs}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={local}
        placeholder={placeholder}
        className={cn(className)}
        data-pos-payment-amount={focusBind['data-pos-payment-amount']}
        onPointerDown={(e) => {
          markFocused?.(e.currentTarget)
          focusBind.onPointerDown(e)
        }}
        onFocus={(e) => {
          focusedRef.current = true
          setLocal(value)
          markFocused?.(e.currentTarget)
          focusBind.onFocus(e)
        }}
        onBlur={() => {
          focusedRef.current = false
          const committed = localRef.current
          if (committed !== value) onValueChange(committed)
          focusBind.onBlur()
        }}
        onChange={(e) => applyFormatted(e.target.value, e.currentTarget)}
      />
    )
  })
)

PosPaymentBahtInput.displayName = 'PosPaymentBahtInput'
