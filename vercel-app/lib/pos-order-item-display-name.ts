import type { PosMenu, PosPromoWithItems } from '@/lib/api-client'
import { parseGrabPartnerItemMenuRef, looksLikeGrabCampaignSku } from '@/lib/grab-pos-order-enrich'

type ItemLike = { id: string; name: string; menuId?: string; promoId?: string; promoCode?: string }

function looksLikeMachineToken(v: string): boolean {
  const s = String(v || '').trim()
  if (!s) return false
  if (/\s/.test(s)) return false
  if (/^[a-z]+:\w+/i.test(s)) return true
  if (/^item-\d+-/i.test(s)) return true
  if (/^[a-z]+-\d+-[a-z0-9_-]+$/i.test(s)) return true
  return false
}

function extractCodeToken(value: string): string {
  const s = String(value || '').trim()
  if (!s) return ''
  const afterColon = s.includes(':') ? s.split(':').pop() || s : s
  const itemPattern = /^item-\d+-([a-z][a-z0-9_-]*)$/i.exec(afterColon)
  if (itemPattern?.[1]) return itemPattern[1]
  const parts = afterColon.split('-').filter(Boolean)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (/^[a-z][a-z0-9_]{1,}$/i.test(last)) return last
  }
  return afterColon
}

function resolvePromoDisplayName(
  item: ItemLike,
  promos: PosPromoWithItems[] | undefined
): string | null {
  const list = promos ?? []
  const promoId = String(item.promoId ?? '').trim()
  if (promoId) {
    const hit = list.find((p) => String(p.id ?? '').trim() === promoId)
    if (hit?.name?.trim()) return hit.name.trim()
  }
  const raw = String(item.name || '').trim()
  if (!raw || !looksLikeGrabCampaignSku(raw)) return null
  const codeKey = raw.toLowerCase()
  const byCode = list.find((p) => String(p.code ?? '').trim().toLowerCase() === codeKey)
  if (byCode?.name?.trim()) return byCode.name.trim()
  const byContains = list.find((p) => {
    const code = String(p.code ?? '').trim().toLowerCase()
    return code && (codeKey.includes(code) || code.includes(codeKey))
  })
  if (byContains?.name?.trim()) return byContains.name.trim()
  return null
}

/** 배달/외부 주문에서 `name`이 메뉴 코드로만 온 경우, POS 메뉴 카탈로그로 표시명을 복원 */
export function resolvePosOrderItemMenuDisplayName(
  item: ItemLike,
  menus: PosMenu[] | undefined,
  promos?: PosPromoWithItems[]
): string {
  const list = menus ?? []
  const raw = String(item.name || '').trim()
  const mid = String(item.menuId || '').trim()
  const promoName = resolvePromoDisplayName(item, promos)
  if (promoName) return promoName
  if (mid) {
    const byId = list.find((m) => m.id === mid)
    if (byId?.name?.trim()) {
      const baseName = byId.name.trim()
      if (raw) {
        const rawNormalized = raw.replace(/\s+/g, ' ').trim()
        const rawLower = rawNormalized.toLowerCase()
        const baseLower = baseName.toLowerCase()
        const decoratedFromBase =
          rawLower !== baseLower &&
          (
            rawLower.startsWith(`${baseLower} (`) ||
            rawLower.startsWith(`${baseLower} -`) ||
            rawLower.includes(' / ') ||
            /[()·]/.test(rawNormalized)
          )
        if (decoratedFromBase) return rawNormalized
      }
      return baseName
    }
  }
  if (raw) {
    const byCode = list.find((m) => String(m.code || '').trim() && String(m.code).trim() === raw)
    if (byCode?.name?.trim()) return byCode.name.trim()
    const low = raw.toLowerCase()
    const byCodeI = list.find(
      (m) => String(m.code || '').trim() && String(m.code).trim().toLowerCase() === low
    )
    if (byCodeI?.name?.trim()) return byCodeI.name.trim()
    if (looksLikeMachineToken(raw)) {
      const codeToken = extractCodeToken(raw)
      const byToken = list.find(
        (m) => String(m.code || '').trim() && String(m.code).trim().toLowerCase() === codeToken.toLowerCase()
      )
      if (byToken?.name?.trim()) return byToken.name.trim()
    }
  }
  const rawId = String(item.id || '').trim()
  if (rawId) {
    const grabRef = parseGrabPartnerItemMenuRef(rawId)
    if (grabRef) {
      const byGrabMenuId = list.find((m) => String(m.id ?? '') === String(grabRef.menuId))
      if (byGrabMenuId?.name?.trim()) return byGrabMenuId.name.trim()
    }
    const idToken = extractCodeToken(rawId)
    const byCodeFromId = list.find(
      (m) => String(m.code || '').trim() && String(m.code).trim() === idToken
    )
    if (byCodeFromId?.name?.trim()) return byCodeFromId.name.trim()
    const lowId = idToken.toLowerCase()
    const byCodeFromIdI = list.find(
      (m) => String(m.code || '').trim() && String(m.code).trim().toLowerCase() === lowId
    )
    if (byCodeFromIdI?.name?.trim()) return byCodeFromIdI.name.trim()
  }
  return raw
}
