'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatPosQueueNo, isPosQueueTicketActive, type PosQueueTicketPublic } from '@/lib/pos-queue-ticket'

const REFRESH_MS = 15_000

type LoadState = 'loading' | 'ready' | 'not_found' | 'error'

function statusCopy(t: PosQueueTicketPublic): { th: string; en: string; tone: string } {
  switch (t.status) {
    case 'called':
      return {
        th: 'ถึงคิวของคุณแล้วครับ กรุณามาที่หน้าร้าน',
        en: "It's your turn — please come to the counter",
        tone: 'bg-emerald-600 text-white',
      }
    case 'seated':
      return { th: 'ได้ที่นั่งแล้ว ขอบคุณครับ', en: 'Seated — thank you', tone: 'bg-slate-200 text-slate-800' }
    case 'cancelled':
    case 'no_show':
      return { th: 'คิวนี้ปิดแล้วครับ', en: 'This queue ticket is closed', tone: 'bg-slate-200 text-slate-800' }
    default:
      return {
        th: t.teamsAhead > 0 ? `รออีก ${t.teamsAhead} คิวครับ` : 'คิวถัดไปคือคุณครับ',
        en: t.teamsAhead > 0 ? `${t.teamsAhead} ahead of you` : 'You are next',
        tone: 'bg-amber-100 text-amber-900',
      }
  }
}

export function PosQueuePublicView(props: { token: string; brandName: string; lineOfficialUrl: string }) {
  const { token, brandName, lineOfficialUrl } = props
  const [state, setState] = useState<LoadState>('loading')
  const [ticket, setTicket] = useState<PosQueueTicketPublic | null>(null)
  const prevStatusRef = useRef<string>('')
  const [linkResult, setLinkResult] = useState('')

  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get('linked') || ''
    if (!linked) return
    setLinkResult(linked)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pos/queue-public/${encodeURIComponent(token)}`, { cache: 'no-store' })
      if (res.status === 404) {
        setState('not_found')
        return
      }
      const json = (await res.json().catch(() => null)) as { success?: boolean; ticket?: PosQueueTicketPublic } | null
      if (!res.ok || !json?.success || !json.ticket) {
        setState((s) => (s === 'ready' ? s : 'error'))
        return
      }
      const next = json.ticket
      if (prevStatusRef.current && prevStatusRef.current !== 'called' && next.status === 'called') {
        try {
          navigator.vibrate?.([300, 150, 300])
        } catch {
          /* ignore */
        }
      }
      prevStatusRef.current = next.status
      setTicket(next)
      setState('ready')
    } catch {
      setState((s) => (s === 'ready' ? s : 'error'))
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const active = ticket ? isPosQueueTicketActive(ticket.status) : true
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active, load])

  return (
    <main className="min-h-dvh bg-amber-50 px-4 py-8 text-slate-900">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-5 text-center">
        <p className="text-sm font-bold tracking-wide text-amber-800">{brandName}</p>
        {state === 'loading' ? <p className="text-slate-500">กำลังโหลด… · Loading…</p> : null}
        {state === 'not_found' ? (
          <p className="text-slate-600">ไม่พบคิวนี้ครับ · Queue ticket not found</p>
        ) : null}
        {state === 'error' ? (
          <p className="text-slate-600">เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งครับ · Please try again</p>
        ) : null}
        {state === 'ready' && ticket ? (
          <>
            <p className="text-sm text-slate-600">สาขา {ticket.storeLabel}</p>
            <div className="w-full rounded-2xl bg-white p-6 shadow">
              <p className="text-xs font-extrabold tracking-[0.15em] text-slate-500">คิว · QUEUE</p>
              <p className="my-1 text-6xl font-black tracking-wider">{formatPosQueueNo(ticket.queueNo)}</p>
              <p className="text-base font-bold">
                {ticket.partySize} ท่าน · {ticket.partySize} {ticket.partySize === 1 ? 'person' : 'people'}
              </p>
            </div>
            {(() => {
              const copy = statusCopy(ticket)
              return (
                <div className={`w-full rounded-2xl px-4 py-4 ${copy.tone}`}>
                  <p className="text-lg font-extrabold">{copy.th}</p>
                  <p className="text-sm font-semibold opacity-90">{copy.en}</p>
                </div>
              )
            })()}
            {active ? (
              <p className="text-xs text-slate-500">อัปเดตอัตโนมัติทุก 15 วินาที · Auto refresh</p>
            ) : null}
          </>
        ) : null}
        <div className="mt-2 w-full space-y-2 rounded-2xl border border-emerald-200 bg-white p-4 text-left">
          <p className="text-sm font-bold">รับแจ้งเตือนทาง LINE ครับ</p>
          {linkResult === '0' ? (
            <p className="text-xs font-semibold text-amber-700">
              เชื่อม LINE กับคิวนี้ไม่ได้ครับ กรุณาแจ้งพนักงาน · Could not link — please ask staff
            </p>
          ) : null}
          {ticket?.memberLinked ? (
            <p className="text-sm font-semibold text-emerald-700">
              ✓ เชื่อม LINE แล้ว จะได้รับข้อความเมื่อถึงคิวครับ · LINE alerts on
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              เข้าสู่ระบบด้วย LINE เพื่อรับข้อความเมื่อถึงคิวครับ · Log in with LINE to get a message when called.
            </p>
          )}
          <div className="flex flex-col gap-2 pt-1">
            {ticket && !ticket.memberLinked && active ? (
              <a
                href={`/api/pos/queue-public/${encodeURIComponent(token)}/line-link`}
                className="rounded-xl bg-[#06C755] px-4 py-3 text-center text-sm font-bold text-white"
              >
                รับแจ้งเตือนทาง LINE · Get LINE alerts
              </a>
            ) : null}
            {lineOfficialUrl ? (
              <a
                href={lineOfficialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-[#06C755] px-4 py-3 text-center text-sm font-bold text-[#06C755]"
              >
                เพิ่มเพื่อน LINE · Add LINE friend
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
