import { NextRequest, NextResponse } from 'next/server'
import { grabJsonRequest } from '@/lib/grab-openapi'
import { parseGrabMenuNotificationMerchantBulkInput } from '@/lib/grab-menu-notification-input-parse'
import {
  listAllGrabFoodMerchantIdsFromStoreMap,
  resolveGrabMenuNotificationMerchantIDs,
} from '@/lib/grab-resolve-menu-notification-merchants'

type UpdateMenuNotificationBody = {
  /**
   * 단일 값이거나, 쉼표로 구분한 여러 값(예: `GFSBPOS-a,GFSBPOS-b`).
   * JSON은 같은 키를 두 번 쓸 수 없으므로 여러 개는 쉼표 또는 `merchantIDs` 배열을 사용.
   */
  merchantID?: string
  /** 여러 매장·코드 한 번에 (각 항목은 `merchantID`와 동일 규칙으로 해석·중복 제거 후 Grab 호출) */
  merchantIDs?: unknown
  /** true면 `GRAB_STORE_MAP_JSON`의 모든 `GFSBPOS-…` 키에 대해 호출 */
  all?: unknown
}

function coerceMerchantIdInputs(body: UpdateMenuNotificationBody): string[] {
  if (body.all === true || body.all === 'true' || body.all === 1) {
    return listAllGrabFoodMerchantIdsFromStoreMap()
  }
  const arr = body.merchantIDs
  if (Array.isArray(arr)) {
    return arr.map((x) => String(x ?? '').trim()).filter(Boolean)
  }
  const single = String(body.merchantID || '').trim()
  if (!single) return []
  return parseGrabMenuNotificationMerchantBulkInput(single)
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as UpdateMenuNotificationBody
    const rawInputs = coerceMerchantIdInputs(body)
    if (rawInputs.length === 0) {
      return NextResponse.json(
        { success: false, message: 'merchantID_or_merchantIDs_or_all_required' },
        { status: 400, headers }
      )
    }

    const toNotify = new Set<string>()
    const unresolvedInputs: string[] = []
    for (const raw of rawInputs) {
      const resolved = resolveGrabMenuNotificationMerchantIDs(raw)
      if (!resolved.length) unresolvedInputs.push(raw)
      else resolved.forEach((id) => toNotify.add(id))
    }

    if (toNotify.size === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'grab_menu_notification_merchant_unresolved',
          unresolvedInputs,
        },
        { status: 400, headers }
      )
    }

    const failures: { merchantID: string; message: string }[] = []
    for (const merchantID of toNotify) {
      try {
        await grabJsonRequest({
          path: '/partner/v1/merchant/menu/notification',
          method: 'POST',
          body: { merchantID },
        })
      } catch (e) {
        failures.push({ merchantID, message: String(e) })
      }
    }

    const success = failures.length === 0
    const failedSet = new Set(failures.map((f) => f.merchantID))
    const succeededMerchantIDs = Array.from(toNotify).filter((id) => !failedSet.has(id))
    return NextResponse.json(
      {
        success,
        notifiedMerchantIDs: Array.from(toNotify),
        ...(failures.length ? { succeededMerchantIDs } : {}),
        ...(unresolvedInputs.length ? { unresolvedInputs } : {}),
        ...(failures.length ? { failures } : {}),
      },
      { status: success ? 200 : 500, headers }
    )
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

