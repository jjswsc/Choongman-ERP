import { NextRequest, NextResponse } from 'next/server'
import {
  savePosDeliveryPolicyBundle,
  type DeliveryAppCode,
  type PosDeliveryCategoryOrder,
  type PosDeliveryMenuPolicy,
} from '@/lib/pos-delivery-policy'
import { triggerGrabMenuNotification } from '@/lib/grab-menu-sync-trigger'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as {
      storeCode?: string
      appCode?: DeliveryAppCode
      appPolicy?: {
        enabled?: boolean
        orderAcceptanceMode?: 'manual' | 'auto'
        autoAcceptEnabled?: boolean
      }
      menuPolicies?: PosDeliveryMenuPolicy[]
      categoryOrders?: PosDeliveryCategoryOrder[]
    }
    const storeCode = String(body.storeCode ?? '').trim()
    const appCode = String(body.appCode ?? '').trim().toLowerCase() as DeliveryAppCode
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode_required' }, { status: 400, headers })
    }
    await savePosDeliveryPolicyBundle({
      storeCode,
      appCode,
      appPolicy: body.appPolicy,
      menuPolicies: Array.isArray(body.menuPolicies) ? body.menuPolicies : undefined,
      categoryOrders: Array.isArray(body.categoryOrders) ? body.categoryOrders : undefined,
    })
    if (appCode === 'grab') {
      void triggerGrabMenuNotification({
        reason: 'delivery_policy_updated',
        partnerMerchantID: storeCode,
      })
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: String(e ?? 'unknown_error') },
      { status: 500, headers }
    )
  }
}
