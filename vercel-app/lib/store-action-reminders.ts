import 'server-only'

import { addBangkokCalendarDays } from '@/lib/bangkok-time'
import { mapStoreActionItemRow, type StoreActionItemDto, type StoreActionItemRow } from '@/lib/store-action-item-map'
import { STORE_ACTION_OPEN_STATUSES } from '@/lib/store-action-items'
import {
  pushStoreActionNotice,
  resolveStoreActionRecipient,
  type StoreActionRecipient,
} from '@/lib/store-action-server'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

/** 방콕 기준 발송 시각(매일 1회) */
export const STORE_ACTION_REMINDER_HOUR_BANGKOK = 9

const LAST_RUN_KEY = 'store_action_reminder_last_run'

export type StoreActionReminderResult = {
  ran: boolean
  owners: number
  verifiers: number
  skippedReason?: string
}

async function readLastRunDate(): Promise<string> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${LAST_RUN_KEY}`, {
      select: 'value_json',
      limit: 1,
    })) as { value_json?: { date?: string } }[]
    return String(rows?.[0]?.value_json?.date || '')
  } catch {
    return ''
  }
}

async function writeLastRunDate(date: string): Promise<void> {
  await supabaseUpsert(
    'system_settings',
    [{ key: LAST_RUN_KEY, value_json: { date }, updated_at: new Date().toISOString() }],
    'key'
  )
}

function personKey(userId: string, name: string): string {
  return userId ? `id:${userId}` : `name:${name.trim().toLowerCase()}`
}

function lineOf(it: StoreActionItemDto): string {
  return `- ${it.store} · ${it.title} (${it.dueDate || '-'})`
}

/**
 * 개선 과제 아침 알림 — 담당자(기한초과·오늘·내일 마감) + 재확인자(재확인 대기·기한초과 요약).
 * 매시 cron에서 호출되며 방콕 9시에 하루 1회만 발송.
 */
export async function runStoreActionDailyReminders(
  today: string,
  hourBangkok: number
): Promise<StoreActionReminderResult> {
  if (hourBangkok !== STORE_ACTION_REMINDER_HOUR_BANGKOK) {
    return { ran: false, owners: 0, verifiers: 0, skippedReason: 'hour_mismatch' }
  }
  if ((await readLastRunDate()) === today) {
    return { ran: false, owners: 0, verifiers: 0, skippedReason: 'already_sent_today' }
  }

  let rows: StoreActionItemRow[] = []
  try {
    rows = ((await supabaseSelectFilter(
      'store_action_items',
      `status=in.(${STORE_ACTION_OPEN_STATUSES.join(',')})`,
      { order: 'due_date.asc.nullslast,id.asc', limit: 5000 }
    )) || []) as StoreActionItemRow[]
  } catch (e) {
    return {
      ran: false,
      owners: 0,
      verifiers: 0,
      skippedReason: `error:${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const items = rows.map((r) => mapStoreActionItemRow(r, today))
  const tomorrow = addBangkokCalendarDays(today, 1)

  type OwnerBucket = { item: StoreActionItemDto; overdue: StoreActionItemDto[]; dueToday: StoreActionItemDto[]; dueTomorrow: StoreActionItemDto[] }
  const owners = new Map<string, OwnerBucket>()
  type VerifierBucket = { item: StoreActionItemDto; pending: StoreActionItemDto[]; overdue: StoreActionItemDto[] }
  const verifiers = new Map<string, VerifierBucket>()

  for (const it of items) {
    if (it.status !== 'pending_verify' && it.ownerName) {
      const bucketKind = it.overdue
        ? 'overdue'
        : it.dueDate === today
          ? 'dueToday'
          : it.dueDate === tomorrow
            ? 'dueTomorrow'
            : null
      if (bucketKind) {
        const k = personKey(it.ownerUserId, it.ownerName)
        const b = owners.get(k) || { item: it, overdue: [], dueToday: [], dueTomorrow: [] }
        b[bucketKind].push(it)
        owners.set(k, b)
      }
    }
    if (it.verifierName && (it.status === 'pending_verify' || it.overdue)) {
      const k = personKey(it.verifierUserId, it.verifierName)
      const b = verifiers.get(k) || { item: it, pending: [], overdue: [] }
      if (it.status === 'pending_verify') b.pending.push(it)
      else b.overdue.push(it)
      verifiers.set(k, b)
    }
  }

  const recipientCache = new Map<string, StoreActionRecipient | null>()
  const resolve = async (userId: string, name: string, store: string) => {
    const k = personKey(userId, name)
    if (!recipientCache.has(k)) {
      recipientCache.set(k, await resolveStoreActionRecipient({ userId, name, fallbackStore: store }))
    }
    return recipientCache.get(k) || null
  }

  let ownerSent = 0
  for (const b of owners.values()) {
    const r = await resolve(b.item.ownerUserId, b.item.ownerName, b.item.store)
    if (!r) continue
    const head = [
      b.overdue.length ? `기한초과 · เกินกำหนด ${b.overdue.length}` : '',
      b.dueToday.length ? `오늘 마감 · ครบกำหนดวันนี้ ${b.dueToday.length}` : '',
      b.dueTomorrow.length ? `내일 마감 · ครบกำหนดพรุ่งนี้ ${b.dueTomorrow.length}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const lines = [...b.overdue, ...b.dueToday, ...b.dueTomorrow].slice(0, 4).map(lineOf)
    ownerSent += await pushStoreActionNotice({
      title: '[개선 과제] 오늘 처리할 과제 · งานปรับปรุงที่ต้องทำวันนี้ครับ',
      body: [head, ...lines].join('\n'),
      recipients: [r],
    })
  }

  let verifierSent = 0
  for (const b of verifiers.values()) {
    const r = await resolve(b.item.verifierUserId, b.item.verifierName, b.item.store)
    if (!r) continue
    const byStore = new Map<string, number>()
    for (const it of [...b.pending, ...b.overdue]) byStore.set(it.store, (byStore.get(it.store) || 0) + 1)
    const storeLine = [...byStore.entries()]
      .sort((a, c) => c[1] - a[1])
      .slice(0, 6)
      .map(([s, n]) => `${s}(${n})`)
      .join(', ')
    verifierSent += await pushStoreActionNotice({
      title: '[개선 과제] 아침 브리핑 · สรุปงานเช้านี้ครับ',
      body: `재확인 대기 · รอตรวจยืนยัน ${b.pending.length} / 기한초과 · เกินกำหนด ${b.overdue.length}\n매장 · สาขา: ${storeLine}`,
      recipients: [r],
    })
  }

  await writeLastRunDate(today)
  return { ran: true, owners: ownerSent, verifiers: verifierSent }
}
