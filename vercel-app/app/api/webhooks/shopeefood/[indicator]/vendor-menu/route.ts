import { NextRequest, NextResponse } from 'next/server'
import {
  logShopeeFoodWebhook,
  shopeeFoodBearerUnauthorized,
  shopeeFoodIndicatorDenied,
} from '@/lib/shopeefood-webhook'
import { shopeeFoodStubVendorMenuPayload } from '@/lib/shopeefood-vendor-menu-stub'

export const dynamic = 'force-dynamic'

/**
 * ShopeeFood → 벤더: Get Vendor Menu (GET, store_id 쿼리)
 * Shopee 콘솔에 등록하는 URL 예:
 * https://&lt;host&gt;/api/webhooks/shopeefood/&lt;indicator&gt;/vendor-menu?store_id=...
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ indicator: string }> }
) {
  const { indicator } = await context.params
  const indDenied = shopeeFoodIndicatorDenied(req, indicator)
  if (indDenied) return indDenied
  const auth = shopeeFoodBearerUnauthorized(req, 'get_vendor_menu', indicator)
  if (auth) return auth

  const storeId = req.nextUrl.searchParams.get('store_id')?.trim() ?? ''
  if (!storeId) {
    logShopeeFoodWebhook('get_vendor_menu', req, indicator, { error: 'missing_store_id' })
    return NextResponse.json({ code: 1000, msg: 'store_id required' }, { status: 400 })
  }

  logShopeeFoodWebhook('get_vendor_menu', req, indicator, { store_id: storeId })
  return NextResponse.json(shopeeFoodStubVendorMenuPayload())
}
