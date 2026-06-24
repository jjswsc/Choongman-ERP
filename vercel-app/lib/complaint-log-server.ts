import 'server-only'

import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'

export const COMPLAINT_VISIT_PATHS = ['홀', '배달', '포장'] as const
export const COMPLAINT_PLATFORMS = ['Grab', 'Lineman', 'Shopee', 'Robinhood', '기타'] as const
export const COMPLAINT_TYPES = ['음식', '서비스', '환경/청결', '가격/결제', '기타'] as const
export const COMPLAINT_SEVERITIES = ['경미', '보통', '심각'] as const
export const COMPLAINT_STATUSES = ['접수', '조사중', '처리완료', '보류', '종료'] as const
export const COMPLAINT_SOURCE_MEMBER_PORTAL = 'member_portal'
export const COMPLAINT_SOURCE_ADMIN = 'admin'
export const MEMBER_PORTAL_COMPLAINT_WRITER = '회원앱'
export const MEMBER_COMPLAINT_DAILY_LIMIT = 5

export type ComplaintLogDbRow = {
  id?: number
  number?: string
  log_date?: string
  log_time?: string
  store_name?: string
  writer?: string
  customer?: string
  contact?: string
  visit_path?: string
  platform?: string
  complaint_type?: string
  menu?: string
  title?: string
  content?: string
  severity?: string
  action?: string
  status?: string
  handler?: string
  done_date?: string
  photo_url?: string
  remark?: string
  member_id?: number | null
  source_channel?: string
  created_at?: string
}

export type ComplaintLogDto = {
  row?: number
  id?: number
  number: string
  date: string
  time: string
  store: string
  writer: string
  customer: string
  contact: string
  visitPath: string
  platform: string
  type: string
  menu: string
  title: string
  content: string
  severity: string
  action: string
  status: string
  handler: string
  doneDate: string
  photoUrl: string
  remark: string
  memberId?: number | null
  sourceChannel?: string
  createdAt?: string
}

export type InsertComplaintLogInput = {
  date?: string
  time?: string
  store?: string
  writer?: string
  customer?: string
  contact?: string
  visitPath?: string
  platform?: string
  type?: string
  menu?: string
  title?: string
  content?: string
  severity?: string
  action?: string
  status?: string
  handler?: string
  doneDate?: string | null
  photoUrl?: string
  remark?: string
  memberId?: number | null
  sourceChannel?: string
}

export function bangkokComplaintDateTimeParts(base: Date = new Date()): { date: string; time: string } {
  const dt = getBangkokDateTimeString(base)
  const [date, timePart] = dt.split(' ')
  return { date: date || '', time: (timePart || '').slice(0, 5) }
}

export async function nextComplaintNumber(dateStr: string): Promise<string> {
  const base = (dateStr || '').replace(/-/g, '')
  if (base.length !== 8) return `${base}-001`
  const list = (await supabaseSelectFilter('complaint_logs', `log_date=eq.${dateStr}`, {
    limit: 500,
  })) as { number?: string }[]
  let max = 0
  for (const row of list || []) {
    const numCell = String(row.number || '')
    if (/^\d{8}-\d{3}$/.test(numCell)) {
      const seq = parseInt(numCell.split('-')[1], 10)
      if (seq > max) max = seq
    }
  }
  return `${base}-${String(max + 1).padStart(3, '0')}`
}

export function mapComplaintLogRowToDto(d: ComplaintLogDbRow): ComplaintLogDto {
  return {
    row: d.id,
    id: d.id,
    number: String(d.number || ''),
    date: d.log_date ? String(d.log_date).slice(0, 10) : '',
    time: String(d.log_time || ''),
    store: String(d.store_name || ''),
    writer: String(d.writer || ''),
    customer: String(d.customer || ''),
    contact: String(d.contact || ''),
    visitPath: String(d.visit_path || ''),
    platform: String(d.platform || ''),
    type: String(d.complaint_type || ''),
    menu: String(d.menu || ''),
    title: String(d.title || ''),
    content: String(d.content || ''),
    severity: String(d.severity || ''),
    action: String(d.action || ''),
    status: String(d.status || ''),
    handler: String(d.handler || ''),
    doneDate: d.done_date ? String(d.done_date).slice(0, 10) : '',
    photoUrl: String(d.photo_url || ''),
    remark: String(d.remark || ''),
    memberId: d.member_id != null ? Number(d.member_id) : null,
    sourceChannel: String(d.source_channel || ''),
    createdAt: d.created_at ? String(d.created_at) : '',
  }
}

export async function insertComplaintLog(input: InsertComplaintLogInput): Promise<{ number: string }> {
  const dateStr = String(input.date || '').trim().slice(0, 10)
  const num = await nextComplaintNumber(dateStr)

  const row: Record<string, unknown> = {
    number: num,
    log_date: dateStr && dateStr.length >= 10 ? dateStr : null,
    log_time: String(input.time || '').trim(),
    store_name: String(input.store || '').trim(),
    writer: String(input.writer || '').trim(),
    customer: String(input.customer || '').trim(),
    contact: String(input.contact || '').trim(),
    visit_path: String(input.visitPath || '').trim(),
    platform: String(input.platform || '').trim(),
    complaint_type: String(input.type || '').trim(),
    menu: String(input.menu || '').trim(),
    title: String(input.title || '').trim(),
    content: String(input.content || '').trim(),
    severity: String(input.severity || '').trim(),
    action: String(input.action || '').trim(),
    status: String(input.status || '접수').trim(),
    handler: String(input.handler || '').trim(),
    done_date: (input.doneDate || '').toString().trim().slice(0, 10) || null,
    photo_url: String(input.photoUrl || '').trim(),
    remark: String(input.remark || '').trim(),
  }

  const memberId = input.memberId != null ? Number(input.memberId) : NaN
  if (Number.isFinite(memberId) && memberId > 0) {
    row.member_id = memberId
  }
  const sourceChannel = String(input.sourceChannel || '').trim()
  if (sourceChannel) {
    row.source_channel = sourceChannel
  }

  await supabaseInsert('complaint_logs', row)

  return { number: num }
}

export function isAllowedComplaintVisitPath(value: string): boolean {
  return (COMPLAINT_VISIT_PATHS as readonly string[]).includes(value)
}

export function isAllowedComplaintType(value: string): boolean {
  return (COMPLAINT_TYPES as readonly string[]).includes(value)
}

export function isAllowedComplaintPlatform(value: string): boolean {
  return !value || (COMPLAINT_PLATFORMS as readonly string[]).includes(value)
}
