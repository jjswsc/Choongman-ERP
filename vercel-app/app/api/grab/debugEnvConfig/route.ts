import { NextResponse } from 'next/server'
import {
  GRAB_PORTAL_MERCHANT_ENTRIES,
  formatGrabPortalMerchantMapEnvValue,
  formatGrabStoreMapJsonEnvValue,
} from '@/lib/grab-portal-merchant-map-defaults'
import { parseGrabPortalMerchantMap, parseGrabStoreMap } from '@/lib/grab-store-map-env'
import { resolveGrabMenuNotificationMerchantIDs } from '@/lib/grab-resolve-menu-notification-merchants'

export const dynamic = 'force-dynamic'

const JSON_UTF8_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json; charset=utf-8',
}

/** Vercel Grab env 복사·매장 해석 검증 — `GRAB_PORTAL_MERCHANT_MAP` / `GRAB_STORE_MAP_JSON` */
export async function GET() {
  const headers = new Headers(JSON_UTF8_HEADERS)
  try {
    const effectivePortalMap = parseGrabPortalMerchantMap()
    const effectiveStoreMap = parseGrabStoreMap()
    const resolutionCheck = GRAB_PORTAL_MERCHANT_ENTRIES.map((row) => {
      const resolved = resolveGrabMenuNotificationMerchantIDs(row.partnerMerchantId)
      const ok = resolved.length === 1 && resolved[0] === row.grabMerchantId
      return {
        partnerMerchantId: row.partnerMerchantId,
        expectedGrabMerchantId: row.grabMerchantId,
        resolvedGrabMerchantIds: resolved,
        erpStoreCode: row.erpStoreCode,
        labelEn: row.labelEn,
        ok,
      }
    })

    return NextResponse.json(
      {
        success: true,
        hint:
          'Vercel → Project → Settings → Environment Variables. 붙여넣은 뒤 Redeploy. effective* 는 env+코드 기본값 병합 결과.',
        vercelEnv: {
          GRAB_PORTAL_MERCHANT_MAP: formatGrabPortalMerchantMapEnvValue(),
          GRAB_STORE_MAP_JSON: formatGrabStoreMapJsonEnvValue(),
        },
        stores: GRAB_PORTAL_MERCHANT_ENTRIES,
        effectivePortalMap,
        effectiveStoreMap,
        resolutionCheck,
        allResolved: resolutionCheck.every((r) => r.ok),
      },
      { headers }
    )
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
