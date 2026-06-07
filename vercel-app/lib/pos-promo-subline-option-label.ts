import type { PosMenuOption } from '@/lib/api-client'
import { isChickenMenu } from '@/lib/pos-menu-categories'
import { resolveChickenDefaultOptionDisplayName } from '@/lib/pos-chicken-option-inference'

export type PosPromoSublineOrderChannel = 'dine-in' | 'takeout' | 'delivery'

function channelSellAllowed(o: PosMenuOption, channel: PosPromoSublineOrderChannel): boolean {
  const key = channel === 'dine-in' ? 'sellHall' : channel === 'delivery' ? 'sellDelivery' : 'sellPackaging'
  return o[key as keyof PosMenuOption] !== false
}

function pickFirstBySortOrder(rows: PosMenuOption[]): PosMenuOption | null {
  if (rows.length === 0) return null
  if (rows.length === 1) return rows[0]
  return [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0]
}

function optionStepSizeUpper(o: PosMenuOption): string {
  const v = o.optionStepValues
  if (!v || typeof v !== 'object') return ''
  for (const [k, val] of Object.entries(v)) {
    if (String(k).toLowerCase() === 'size') return String(val ?? '').trim().toUpperCase()
  }
  return ''
}

/** 옵션 표시명이 세트 기본 S(순살/본리스 등)로 보이는지 — optionStepValues 없는 레거시 행 보조 */
export function looksLikePromoImplicitSizeSOptionName(name: string | undefined): boolean {
  const n = String(name ?? '').trim()
  if (!n) return false
  if (/^S\s*[-]?\s*순살\s*$/i.test(n) || n === 'S 순살' || n === 'S - 순살' || n === 'S-순살') return true
  if (/^S\s*[-]?\s*Boneless\s*$/i.test(n) || n === 'S Boneless' || n === 'S - Boneless' || n === 'S-Boneless')
    return true
  if (/^S\s*[\s\-–—]/i.test(n)) return true
  // 영문·태국어 UI 등 "S Boneless" (S 뒤 공백만 있고 하이픈 없음) — 기존 클래스는 'B'에서 걸림
  if (/^S\b/i.test(n)) return true
  return false
}

/**
 * 프로모 세트 구성 줄 표시용 옵션명.
 * DB `pos_promo_items.option_id`가 비어 있어도, 해당 메뉴의 치킨 치환 옵션 중 기본 S를 골라
 * 단품 `메뉴 (M - …)`와 같은 괄호 형식으로 맞춘다.
 */
export function resolvePromoSublineOptionDisplayName(params: {
  optionId: string | null | undefined
  optionCode?: string | null | undefined
  optionById: Map<string, PosMenuOption>
  optionByCode?: Map<string, PosMenuOption>
  menuOptions: PosMenuOption[] | undefined
  orderChannel: PosPromoSublineOrderChannel
  menuCode?: string | null
}): string {
  const { optionId, optionCode, optionById, optionByCode, menuOptions, orderChannel, menuCode } = params
  const code = optionCode != null && String(optionCode).trim() ? String(optionCode).trim() : ''
  if (code && optionByCode) {
    const hitByCode = optionByCode.get(code)?.name?.trim()
    if (hitByCode) return hitByCode
  }
  const id = optionId != null && String(optionId).trim() ? String(optionId).trim() : ''
  if (id) {
    const hit = optionById.get(id)?.name?.trim()
    if (hit) return hit
  }

  if (!id && isChickenMenu(menuCode ?? undefined)) {
    return resolveChickenDefaultOptionDisplayName(menuOptions || [])
  }

  const opts = (menuOptions || []).filter((o) => channelSellAllowed(o, orderChannel))
  if (opts.length === 0) return ''

  if (opts.length === 1) {
    return opts[0].name?.trim() || ''
  }

  const subst = opts.filter((o) => o.optionType === 'substitution' || o.optionType == null)
  const pool = subst.length > 0 ? subst : opts

  const stepS = pool.filter((o) => optionStepSizeUpper(o) === 'S')
  const fromStep = pickFirstBySortOrder(stepS)
  if (fromStep) return fromStep.name?.trim() || ''

  const nameS = pool.filter((o) => looksLikePromoImplicitSizeSOptionName(o.name))
  const fromName = pickFirstBySortOrder(nameS)
  if (fromName) return fromName.name?.trim() || ''

  return ''
}
