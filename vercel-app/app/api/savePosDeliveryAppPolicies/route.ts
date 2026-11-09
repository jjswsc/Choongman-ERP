import { NextRequest, NextResponse } from 'next/server'
import {
  loadGrabMenuPoliciesForStore,
  syncGrabDeliveryPolicySave,
} from '@/lib/grab-menu-availability-sync'
import {
  savePosDeliveryPolicyBundle,
  type DeliveryAppCode,
  type PosDeliveryCategoryOrder,
  type PosDeliveryMenuPolicy,
} from '@/lib/pos-delivery-policy'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    const menuPolicies = Array.isArray(body.menuPolicies) ? body.menuPolicies : undefined
    const previousGrabPolicies =
      appCode === 'grab' && menuPolicies ? await loadGrabMenuPoliciesForStore(storeCode) : []
    await savePosDeliveryPolicyBundle({
      storeCode,
      appCode,
      appPolicy: body.appPolicy,
      menuPolicies,
      categoryOrders: Array.isArray(body.categoryOrders) ? body.categoryOrders : undefined,
    })
    let grabSync: Awaited<ReturnType<typeof syncGrabDeliveryPolicySave>> | undefined
    if (appCode === 'grab') {
      try {
        grabSync = await syncGrabDeliveryPolicySave({
          storeCode,
          previous: previousGrabPolicies,
          next: menuPolicies ?? null,
        })
      } catch (error) {
        console.error('savePosDeliveryAppPolicies grab sync:', error)
        grabSync = {
          notificationSent: 0,
          notificationFailed: 1,
          itemsUpdated: 0,
          itemsFailed: menuPolicies?.length ?? 1,
          itemErrors: [String(error instanceof Error ? error.message : error).slice(0, 180)],
          notificationErrors: [String(error instanceof Error ? error.message : error).slice(0, 180)],
        }
      }
    }
    return NextResponse.json({ success: true, grabSync }, { headers })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: String(e ?? 'unknown_error') },
      { status: 500, headers }
    )
  }
}
