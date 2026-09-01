import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendPosCatalogTenantFilter,
  isPosCatalogTenantQueryBlocked,
  posMenuCategoriesSettingsKey,
  resolvePosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'
import {
  fallbackPosMenuCategoriesConfig,
  mergePromotionIntoCategoriesConfig,
} from '@/lib/pos-menu-categories'
import {
  computeNextPosMenuCode,
  ensureCodePrefixesForMains,
  supportsPosMenuAutoCode,
} from '@/lib/pos-menu-next-code'

type CategoriesSettingsJson = {
  mainCategories?: string[]
  categoriesByMain?: Record<string, string[]>
  codePrefixByMain?: Record<string, string>
}

/** GET ?mainCategory=Chicken → 다음 코드 C013. 임의·신규 대분류도 접두사 자동 할당 후 발급 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const mainCategory = req.nextUrl.searchParams.get('mainCategory')?.trim()
    if (!mainCategory || !supportsPosMenuAutoCode(mainCategory)) {
      return NextResponse.json({ code: null, message: 'mainCategory 파라미터가 필요합니다.' }, { headers })
    }

    const auth = await getVerifiedAuth(req, { skipSaasGate: true })
    const catalogScope = await resolvePosCatalogTenantScope({ auth })
    if (isPosCatalogTenantQueryBlocked(catalogScope)) {
      return NextResponse.json(
        { code: null, message: '회사(테넌트) 정보가 없어 메뉴 코드를 발급할 수 없습니다.' },
        { status: 403, headers }
      )
    }

    const settingsKey = posMenuCategoriesSettingsKey(catalogScope)
    const settingRows = (await supabaseSelectFilter(
      'system_settings',
      `key=eq.${encodeURIComponent(settingsKey)}`,
      { limit: 1 }
    )) as { key?: string; value_json?: CategoriesSettingsJson }[] | null

    const raw = settingRows?.[0]?.value_json
    const hasSaved =
      raw &&
      typeof raw === 'object' &&
      Array.isArray(raw.mainCategories) &&
      typeof raw.categoriesByMain === 'object'

    const fallback = fallbackPosMenuCategoriesConfig(catalogScope.enforce)
    const baseMains = hasSaved
      ? [...raw!.mainCategories!]
      : [...fallback.mainCategories]
    const categoriesByMain = hasSaved
      ? { ...raw!.categoriesByMain! }
      : { ...fallback.categoriesByMain }
    const existingPrefixes =
      hasSaved && raw!.codePrefixByMain && typeof raw!.codePrefixByMain === 'object'
        ? { ...raw!.codePrefixByMain }
        : {}

    const merged = mergePromotionIntoCategoriesConfig({
      mainCategories: baseMains,
      categoriesByMain,
    })

    const { codePrefixByMain, changed } = ensureCodePrefixesForMains(
      merged.mainCategories,
      existingPrefixes,
      [mainCategory]
    )

    if (changed || !hasSaved) {
      try {
        await supabaseUpsert(
          'system_settings',
          [
            {
              key: settingsKey,
              value_json: {
                mainCategories: merged.mainCategories,
                categoriesByMain: merged.categoriesByMain,
                codePrefixByMain,
              },
              updated_at: new Date().toISOString(),
            },
          ],
          'key'
        )
      } catch (persistErr) {
        console.error('getNextPosMenuCode persist prefixes:', persistErr)
        /* 발급은 계속 — 다음 요청에서 다시 저장 시도 */
      }
    }

    const prefix = codePrefixByMain[mainCategory]
    if (!prefix) {
      return NextResponse.json({ code: null, message: `접두사 할당 실패: ${mainCategory}` }, { status: 500, headers })
    }

    const tenantFilter = appendPosCatalogTenantFilter('', catalogScope)
    const rows = (
      tenantFilter
        ? await supabaseSelectFilter('pos_menus', tenantFilter, {
            select: 'code',
            limit: 10000,
          })
        : await supabaseSelect('pos_menus', {
            select: 'code',
            limit: 10000,
          })
    ) as { code?: string }[] | null

    const nextCode = computeNextPosMenuCode(
      prefix,
      (rows || []).map((r) => String(r?.code ?? ''))
    )

    return NextResponse.json(
      { code: nextCode, prefix, codePrefixByMain },
      { headers }
    )
  } catch (e) {
    console.error('getNextPosMenuCode:', e)
    return NextResponse.json({ code: null, message: String(e) }, { status: 500, headers })
  }
}
