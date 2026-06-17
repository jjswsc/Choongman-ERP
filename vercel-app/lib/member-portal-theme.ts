import type { CSSProperties } from 'react'

export const KEY_THEME_TEXT_PRIMARY = 'member_portal_theme_text_primary'
export const KEY_THEME_TEXT_SECONDARY = 'member_portal_theme_text_secondary'
export const KEY_THEME_FONT_SCALE = 'member_portal_theme_font_scale_pct'

export type MemberPortalUiTheme = {
  textPrimaryColor: string
  textSecondaryColor: string
  fontScalePct: number
}

export const DEFAULT_MEMBER_PORTAL_UI_THEME: MemberPortalUiTheme = {
  textPrimaryColor: '#1c1917',
  textSecondaryColor: '#57534e',
  fontScalePct: 100,
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export function normalizeMemberPortalHexColor(raw: unknown, fallback: string): string {
  const v = String(raw || '').trim()
  if (HEX_COLOR.test(v)) return v.toLowerCase()
  return fallback
}

export function normalizeMemberPortalFontScalePct(raw: unknown): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return DEFAULT_MEMBER_PORTAL_UI_THEME.fontScalePct
  return Math.min(130, Math.max(90, n))
}

export function parseMemberPortalUiThemeFromMap(map: Map<string, string>): MemberPortalUiTheme {
  return {
    textPrimaryColor: normalizeMemberPortalHexColor(
      map.get(KEY_THEME_TEXT_PRIMARY),
      DEFAULT_MEMBER_PORTAL_UI_THEME.textPrimaryColor
    ),
    textSecondaryColor: normalizeMemberPortalHexColor(
      map.get(KEY_THEME_TEXT_SECONDARY),
      DEFAULT_MEMBER_PORTAL_UI_THEME.textSecondaryColor
    ),
    fontScalePct: normalizeMemberPortalFontScalePct(map.get(KEY_THEME_FONT_SCALE)),
  }
}

export function memberPortalUiThemeStyle(theme: Partial<MemberPortalUiTheme>): CSSProperties {
  const merged = { ...DEFAULT_MEMBER_PORTAL_UI_THEME, ...theme }
  const scale = merged.fontScalePct / 100
  return {
    ['--mp-text-primary' as string]: merged.textPrimaryColor,
    ['--mp-text-secondary' as string]: merged.textSecondaryColor,
    fontSize: `${scale * 100}%`,
  } as CSSProperties
}
