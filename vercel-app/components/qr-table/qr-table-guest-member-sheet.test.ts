/** @vitest-environment jsdom */
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QrTableGuestMemberLoginSheet } from '@/components/qr-table/qr-table-guest-member-sheet'
import { QrTableGuestSwipeSheet } from '@/components/qr-table/qr-table-guest-swipe-sheet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const labels: Record<string, string> = {
  memberLoginTitle: 'เข้าสู่ระบบสมาชิก',
  close: 'ปิด',
  memberLoginHint: 'hint',
  memberPhone: 'เบอร์โทร',
  memberBirthDate: 'วันเกิด',
  memberDay: 'วัน',
  memberMonth: 'เดือน',
  memberYear: 'ปี',
  memberLoginSubmit: 'เข้าสู่ระบบ',
  memberLoginBusy: 'กำลังเข้าสู่ระบบ…',
  memberMissingBirth: 'กรุณาเลือกวันเกิดครับ',
}

function g(key: string) {
  return labels[key] || key
}

function click(el: Element | null | undefined) {
  if (!el) throw new Error('missing element')
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('QR 회원 로그인 생년월일', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.querySelectorAll('[data-birth-menu]').forEach((node) => node.remove())
  })

  function renderSheet(extra?: { error?: string; onSubmit?: (phone: string, birth: string) => void; onClose?: () => void }) {
    const onSubmit = extra?.onSubmit || vi.fn()
    const onClose = extra?.onClose || vi.fn()
    act(() => {
      root.render(
        React.createElement(QrTableGuestMemberLoginSheet, {
          open: true,
          onClose,
          g,
          brandBtn: 'bg-amber-700 text-white',
          error: extra?.error,
          onSubmit,
        })
      )
    })
    return { onSubmit, onClose }
  }

  it('쉬는 시트에는 transform이 없다', () => {
    renderSheet()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.style.transform).toBe('')
    expect(document.body.querySelector('select')).toBeNull()
  })

  it('일·월·년을 눌러 고르고 로그인으로 넘긴다', () => {
    const onSubmit = vi.fn()
    renderSheet({ onSubmit })

    click(document.body.querySelector('[data-birth-part="day"]'))
    const dayMenu = document.body.querySelector('[data-birth-menu="day"]')
    expect(dayMenu).toBeTruthy()
    const dayBtn = Array.from(dayMenu!.querySelectorAll('[role="option"]')).find((el) => el.textContent?.trim() === '15')
    click(dayBtn)
    expect(document.body.querySelector('[data-birth-part="day"]')?.textContent).toContain('15')
    expect(document.body.querySelector('[data-birth-menu="day"]')).toBeNull()

    click(document.body.querySelector('[data-birth-part="month"]'))
    const monthBtn = Array.from(document.body.querySelectorAll('[data-birth-menu="month"] [role="option"]')).find(
      (el) => el.textContent?.trim() === '3'
    )
    click(monthBtn)
    expect(document.body.querySelector('[data-birth-part="month"]')?.textContent).toContain('3')

    click(document.body.querySelector('[data-birth-part="year"]'))
    const yearBtn = Array.from(document.body.querySelectorAll('[data-birth-menu="year"] [role="option"]')).find(
      (el) => el.textContent?.trim() === '1990'
    )
    click(yearBtn)
    expect(document.body.querySelector('[data-birth-part="year"]')?.textContent).toContain('1990')

    const phone = document.body.querySelector('input[type="tel"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(phone, '081-234-5678')
      phone.dispatchEvent(new Event('input', { bubbles: true }))
    })

    click(Array.from(document.body.querySelectorAll('button')).find((el) => el.textContent?.trim() === 'เข้าสู่ระบบ'))
    expect(onSubmit).toHaveBeenCalledWith('0812345678', '1990-03-15')
  })

  it('날짜를 고르지 않으면 빈 생년월일로 제출된다', () => {
    const onSubmit = vi.fn()
    renderSheet({ onSubmit, error: g('memberMissingBirth') })
    click(Array.from(document.body.querySelectorAll('button')).find((el) => el.textContent?.trim() === 'เข้าสู่ระบบ'))
    expect(onSubmit).toHaveBeenCalledWith('', '')
    expect(document.body.textContent).toContain('กรุณาเลือกวันเกิดครับ')
  })

  it('날짜 목록을 연 상태에서도 시트는 닫히지 않는다', () => {
    const onClose = vi.fn()
    renderSheet({ onClose })
    click(document.body.querySelector('[data-birth-part="day"]'))
    const option = Array.from(document.body.querySelectorAll('[data-birth-menu="day"] [role="option"]')).find(
      (el) => el.textContent?.trim() === '1'
    )
    click(option)
    expect(onClose).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy()
  })
})

describe('QR 스와이프 시트', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('열린 직후 transform이 없다', () => {
    act(() => {
      root.render(
        React.createElement(
          QrTableGuestSwipeSheet,
          { open: true, onClose: () => {}, ariaLabel: 'sheet', initialSnap: 'full' },
          React.createElement('p', null, 'body')
        )
      )
    })
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.style.transform).toBe('')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})
