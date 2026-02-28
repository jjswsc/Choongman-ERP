import { NextResponse } from 'next/server'
import { supabaseSelect, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** 공백 정규화: 다중 공백→단일, trim */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** (mainCategory, subCategory) 반환. 매칭 없으면 null */
function mapCategory(cat: string, catMain: string): { main: string; sub: string } | null {
  const c = normalize(cat).toLowerCase()
  const m = normalize(catMain).toLowerCase()

  if (!c) return null

  // Chicken (치킨 시리즈)
  if (c === 'triple chicken') return { main: 'Chicken', sub: 'Triple Chicken' }
  if (c.includes('snow')) return { main: 'Chicken', sub: 'SNOW' }
  if ((c.includes('original') && c.includes('series')) || c === 'original series') return { main: 'Chicken', sub: 'ORIGINAL' }
  if (c === 'dosirak') return { main: 'Chicken', sub: 'Dosirak' }
  if (c.includes('bar.b.q') || c.includes('barbq') || c.includes('bbq fried') || c.includes('bar.b.q fried chicken')) return { main: 'Chicken', sub: 'Bar.B.Q' }
  if (c === 'banban') return { main: 'Chicken', sub: 'Banban' }
  if (c.includes('specialties') || c === 'specialties series') return { main: 'Chicken', sub: 'SPECIALTIES' }

  // Korean (한식)
  if (c.includes('tteokbokki') || c.includes('떡볶이')) return { main: 'Korean', sub: 'Tteokbokki' }
  if (c === 'korean soup' || c.includes('korean soup')) return { main: 'Korean', sub: 'KOREAN SOUP' }
  if (c.includes('korean food')) return { main: 'Korean', sub: 'KOREAN FOOD' }

  // Side (사이드)
  if (c === 'side menu' || (c.includes('side') && c.includes('menu'))) return { main: 'Side', sub: 'SIDE MENU' }
  if (c === 'side dish' || (c.includes('side') && c.includes('dish'))) return { main: 'Side', sub: 'SIDE DISH' }
  if (c === 'salad' || c.includes('salad')) return { main: 'Side', sub: 'salad' }

  // Drinks (음료)
  if (c.startsWith('drinks') || c.includes('drinks') || c.includes('เครื่องดื่ม')) return { main: 'Drinks', sub: 'DRINKS' }

  // 한글 대분류 → 영어
  if (m === '치킨') return { main: 'Chicken', sub: (cat || '').trim() || 'Chicken' }
  if (m === '한식') return { main: 'Korean', sub: (cat || '').trim() || 'Korean' }
  if (m === '사이드') return { main: 'Side', sub: (cat || '').trim() || 'Side' }
  if (m === '음료') return { main: 'Drinks', sub: (cat || '').trim() || 'Drinks' }

  return null
}

/** GET/POST: 기존 메뉴를 대분류·소분류 프리셋에 맞게 일괄 매핑 */
export async function POST() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('pos_menus', {
      select: 'id,category_main,category',
      limit: 10000,
    })) as { id: string; category_main?: string; category?: string }[]

    let updated = 0
    for (const row of rows || []) {
      const cat = String(row.category ?? '').trim()
      const catMain = String(row.category_main ?? '').trim()
      const mapped = mapCategory(cat, catMain)
      if (mapped) {
        const needUpdate =
          (row.category_main ?? '') !== mapped.main ||
          (row.category ?? '') !== mapped.sub
        if (needUpdate) {
          await supabaseUpdateByFilter(
            'pos_menus',
            `id=eq.${encodeURIComponent(row.id)}`,
            { category_main: mapped.main, category: mapped.sub }
          )
          updated++
        }
      }
    }

    return NextResponse.json(
      { success: true, updated, total: rows?.length ?? 0 },
      { headers }
    )
  } catch (e) {
    console.error('applyPosMenuCategoryPresets:', e)
    return NextResponse.json(
      { success: false, message: String(e), updated: 0 },
      { status: 500, headers }
    )
  }
}
