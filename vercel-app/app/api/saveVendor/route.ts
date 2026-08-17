import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { clearDirectSettlementCache } from '@/lib/direct-settlement-server'
import {
  appendInventoryTenantFilter,
  assertInventoryTenantWritable,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
  stampInventoryTenantId,
} from '@/lib/inventory-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { mapVendorTypeToDb } from '@/lib/vendor-type'

function mapTypeToDb(type: string): string {
  return mapVendorTypeToDb(type)
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const scope = await resolveInventoryTenantScope({ auth })
    const writeBlock = assertInventoryTenantWritable(scope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { headers })
    }

    const body = (await request.json()) as {
      code?: string
      name?: string
      gps_name?: string
      sales_outlet?: string
      contact?: string
      phone?: string
      email?: string
      address?: string
      tax_no?: string
      type?: string
      memo?: string
      editingCode?: string
      direct_settlement?: boolean
      bank_account_no?: string
      bank_name?: string
      bankAccountNo?: string
      bankName?: string
    }

    const code = String(body.code || '').trim()
    const name = String(body.name || '').trim()
    const gpsName = String(body.gps_name || '').trim()
    const salesOutlet = String(body.sales_outlet || '').trim() || null
    const editingCode = body.editingCode ? String(body.editingCode).trim() : null
    if (!code || !name) {
      return NextResponse.json({ success: false, message: '코드와 거래처명이 필요합니다.' }, { headers })
    }

    const bankAccountNo = String(body.bank_account_no ?? body.bankAccountNo ?? '').trim()
    const bankName = String(body.bank_name ?? body.bankName ?? '').trim()

    const row: Record<string, unknown> = {
      code,
      name,
      gps_name: gpsName || null,
      sales_outlet: salesOutlet,
      type: mapTypeToDb(body.type || 'purchase'),
      manager: String(body.contact || '').trim(),
      phone: String(body.phone || '').trim(),
      addr: String(body.address || '').trim(),
      tax_id: String(body.tax_no || '').trim() || null,
      memo: String(body.memo || '').trim(),
      direct_settlement: Boolean(body.direct_settlement),
      bank_account_no: bankAccountNo || null,
      bank_name: bankName || null,
    }

    const filterCode = editingCode || code
    const isHqVendor = filterCode.toUpperCase() === 'HQ'
    // 본사 행(saveHeadOfficeInfo): type=본사 유지. 거래처 폼 저장만 하면 mapTypeToDb가 purchase로 덮어 출퇴근 본사 GPS 폴백이 깨짐.
    const rowForDb = isHqVendor ? { ...row, type: '본사' } : row

    const codeFilter = appendInventoryTenantFilter(
      `code=eq.${encodeURIComponent(filterCode)}`,
      scope
    )
    let existing: { id?: number }[] | null
    try {
      existing = (await supabaseSelectFilter('vendors', codeFilter)) as { id?: number }[] | null
    } catch (err) {
      if (isMissingInventoryTenantIdColumnError(err)) {
        markInventoryTenantIdColumnMissing()
        return NextResponse.json(
          {
            success: false,
            message: 'vendors tenant_id 스키마가 없습니다. sql/inventory_tenant_id.sql 을 실행해 주세요.',
          },
          { headers }
        )
      }
      throw err
    }

    if (existing && existing.length > 0) {
      try {
        await supabaseUpdateByFilter('vendors', codeFilter, rowForDb)
      } catch (updErr) {
        const msg = updErr instanceof Error ? updErr.message : String(updErr)
        if (/bank_account_no|bank_name|column/i.test(msg)) {
          const { bank_account_no: _a, bank_name: _b, ...rest } = rowForDb as Record<string, unknown>
          await supabaseUpdateByFilter('vendors', codeFilter, rest)
        } else {
          throw updErr
        }
      }
      clearDirectSettlementCache()
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    try {
      await supabaseInsert('vendors', stampInventoryTenantId(rowForDb, scope))
    } catch (insErr) {
      const msg = insErr instanceof Error ? insErr.message : String(insErr)
      if (/bank_account_no|bank_name|column/i.test(msg)) {
        const { bank_account_no: _a, bank_name: _b, ...rest } = rowForDb as Record<string, unknown>
        await supabaseInsert('vendors', stampInventoryTenantId(rest, scope))
      } else {
        throw insErr
      }
    }
    clearDirectSettlementCache()
    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveVendor:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
