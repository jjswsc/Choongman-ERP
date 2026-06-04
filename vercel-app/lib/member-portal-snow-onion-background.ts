import { supabaseSelectFilter } from '@/lib/supabase-server'

const SNOW_ONION_MENU_CODE = 'C008'

function toText(v: unknown): string {
  return String(v || '').trim()
}

function isHttpImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

type MenuImageRow = { id?: number; code?: string; name?: string; image?: string | null }

/** POS `pos_menus`에 저장된 SNOW ONION(C008) 사진 URL — 회원앱 상단 히어로 음식 */
export async function getMemberPortalSnowOnionBackgroundUrl(): Promise<string> {
  try {
    const byCode = (await supabaseSelectFilter('pos_menus', `code=eq.${SNOW_ONION_MENU_CODE}`, {
      limit: 1,
      select: 'id,code,name,image',
    })) as MenuImageRow[]
    const codeRow = byCode?.[0]
    const codeImage = toText(codeRow?.image)
    if (isHttpImageUrl(codeImage)) return codeImage

    const byName = (await supabaseSelectFilter(
      'pos_menus',
      'name=ilike.*snow*onion*',
      { limit: 5, select: 'id,code,name,image', order: 'id.asc' }
    )) as MenuImageRow[]
    for (const row of byName || []) {
      const image = toText(row.image)
      if (isHttpImageUrl(image)) return image
    }
  } catch {
    /* pos_menus 미배포·조회 실패 */
  }
  return ''
}
