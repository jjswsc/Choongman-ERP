import {
  COMPLAINT_SOURCE_PUBLIC_WEB,
  isAllowedComplaintPlatform,
  isAllowedComplaintType,
  isAllowedComplaintVisitPath,
  PUBLIC_COMPLAINT_DAILY_LIMIT,
  PUBLIC_WEB_COMPLAINT_WRITER,
} from '@/lib/complaint-log-server'

export const PUBLIC_COMPLAINT_TITLE_MAX = 120
export const PUBLIC_COMPLAINT_CONTENT_MAX = 4000
export const PUBLIC_COMPLAINT_MENU_MAX = 80
export const PUBLIC_COMPLAINT_NAME_MAX = 80
export const PUBLIC_COMPLAINT_PHOTO_BUCKET = 'complaint-photos'

export type PublicComplaintBody = {
  store?: string
  visitPath?: string
  platform?: string
  type?: string
  menu?: string
  title?: string
  content?: string
  photoUrl?: string
  customer?: string
  contact?: string
}

export type ParsedPublicComplaint = {
  store: string
  visitPath: string
  platform: string
  type: string
  menu: string
  title: string
  content: string
  photoUrl: string
  customer: string
  contact: string
}

export function normalizePublicComplaintPhone(raw: string): string {
  return String(raw || '').replace(/\D/g, '')
}

export function isAllowedPublicComplaintPhotoUrl(url: string): boolean {
  const v = String(url || '').trim()
  if (!v) return true
  try {
    const parsed = new URL(v)
    return parsed.pathname.includes(`/${PUBLIC_COMPLAINT_PHOTO_BUCKET}/`)
  } catch {
    return false
  }
}

export function parsePublicComplaintBody(
  body: PublicComplaintBody,
  options: { storeDisplayName: string | null }
):
  | { ok: true; data: ParsedPublicComplaint }
  | { ok: false; code: string } {
  const store = options.storeDisplayName
  if (!store) {
    return { ok: false, code: 'invalid_store' }
  }

  const visitPath = String(body.visitPath || '').trim()
  if (!isAllowedComplaintVisitPath(visitPath)) {
    return { ok: false, code: 'invalid_visit_path' }
  }

  const type = String(body.type || '').trim()
  if (!isAllowedComplaintType(type)) {
    return { ok: false, code: 'invalid_type' }
  }

  const platformRaw = String(body.platform || '').trim()
  const platform = platformRaw === '__none__' ? '' : platformRaw
  if (visitPath === '배달' && !platform) {
    return { ok: false, code: 'platform_required' }
  }
  if (platform && !isAllowedComplaintPlatform(platform)) {
    return { ok: false, code: 'invalid_platform' }
  }

  const customer = String(body.customer || '').trim().slice(0, PUBLIC_COMPLAINT_NAME_MAX)
  const contactDigits = normalizePublicComplaintPhone(String(body.contact || ''))
  if (!customer) {
    return { ok: false, code: 'name_required' }
  }
  if (contactDigits.length < 8) {
    return { ok: false, code: 'contact_required' }
  }

  const title = String(body.title || '').trim()
  const content = String(body.content || '').trim()
  if (!title) {
    return { ok: false, code: 'title_required' }
  }
  if (!content) {
    return { ok: false, code: 'content_required' }
  }
  if (title.length > PUBLIC_COMPLAINT_TITLE_MAX || content.length > PUBLIC_COMPLAINT_CONTENT_MAX) {
    return { ok: false, code: 'text_too_long' }
  }

  const menu = String(body.menu || '').trim().slice(0, PUBLIC_COMPLAINT_MENU_MAX)
  const photoUrl = String(body.photoUrl || '').trim()
  if (!isAllowedPublicComplaintPhotoUrl(photoUrl)) {
    return { ok: false, code: 'invalid_photo' }
  }

  return {
    ok: true,
    data: {
      store,
      visitPath,
      platform,
      type,
      menu,
      title,
      content,
      photoUrl,
      customer,
      contact: contactDigits,
    },
  }
}

export {
  COMPLAINT_SOURCE_PUBLIC_WEB,
  PUBLIC_COMPLAINT_DAILY_LIMIT,
  PUBLIC_WEB_COMPLAINT_WRITER,
}
