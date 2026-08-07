import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { recordPriceChanges } from '@/lib/price-history'
import { roundErp3 } from '@/lib/utils'
import {
  appendInventoryTenantFilter,
  assertInventoryTenantWritable,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
  stampInventoryTenantId,
} from '@/lib/inventory-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'

function taxTypeToDb(taxType: string): string {
  if (taxType === 'exempt') return '면세'
  if (taxType === 'zero') return '영세율'
  return '과세'
}

function normalizeKey(v: string): string {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, '')
}

function isPackingCategory(category: string): boolean {
  const c = normalizeKey(category)
  if (!c) return false
  return /packing|package|packaging|pkg|포장|패킹|포장재|포장자재|포장부자재|부자재/.test(c)
}

async function resolveDefaultItemAccountSubjectIdFromRules(category: string): Promise<number | null> {
  try {
    const rows = (await supabaseSelectFilter(
      'item_account_subject_rules',
      'is_active=eq.true',
      {
        select: 'rule_type,keyword,match_mode,account_subject_id,priority',
        order: 'priority.asc,id.asc',
        limit: 500,
      }
    )) as
      | {
          rule_type?: string
          keyword?: string | null
          match_mode?: string | null
          account_subject_id?: number | null
          priority?: number
        }[]
      | null
    const list = rows || []
    if (!list.length) return null
    const categoryNorm = normalizeKey(category)
    for (const r of list) {
      const ruleType = String(r.rule_type || '').trim().toLowerCase()
      if (ruleType !== 'keyword') continue
      const sid = Number(r.account_subject_id)
      if (!Number.isFinite(sid) || sid <= 0) continue
      const keywordNorm = normalizeKey(String(r.keyword || ''))
      if (!keywordNorm) continue
      const mode = String(r.match_mode || 'contains').trim().toLowerCase()
      const matched = mode === 'exact' ? categoryNorm === keywordNorm : categoryNorm.includes(keywordNorm)
      if (matched) return sid
    }
    const defaultRule = list.find((r) => String(r.rule_type || '').trim().toLowerCase() === 'default')
    const defaultSid = Number(defaultRule?.account_subject_id)
    if (Number.isFinite(defaultSid) && defaultSid > 0) return defaultSid
    return null
  } catch {
    // 테이블 미배포/조회 실패 시 fallback
    return null
  }
}

async function resolveDefaultItemAccountSubjectId(category: string): Promise<number | null> {
  const fromRules = await resolveDefaultItemAccountSubjectIdFromRules(category)
  if (fromRules != null && Number.isFinite(fromRules) && fromRules > 0) return fromRules
  try {
    const rows = (await supabaseSelectFilter(
      'account_subjects',
      'type=eq.expense&p_and_l_section=eq.cost',
      { select: 'id,code,name,name_en', limit: 2000 }
    )) as { id?: number; code?: string; name?: string; name_en?: string }[] | null
    const list = rows || []
    const findByKeywords = (keywords: string[]) => {
      const ks = keywords.map(normalizeKey).filter(Boolean)
      for (const r of list) {
        const merged = [r.name || '', r.name_en || '', r.code || ''].map(normalizeKey).join(' ')
        if (!merged) continue
        if (ks.some((k) => merged.includes(k))) {
          const id = Number(r.id)
          if (Number.isFinite(id) && id > 0) return id
        }
      }
      return null
    }
    const packagingId = findByKeywords(['포장재', 'packaging', 'packingmaterial'])
    const foodRawId = findByKeywords(['식품원재료', '식품원재료비', 'foodrawmaterial', 'ingredientrawmaterial'])
    if (isPackingCategory(category)) return packagingId ?? foodRawId
    return foodRawId ?? packagingId
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  let code = ''

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantScope = await resolveInventoryTenantScope({ auth })
    const writeBlock = assertInventoryTenantWritable(tenantScope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { headers })
    }

    const body = (await request.json()) as {
      code?: string
      name?: string
      category?: string
      vendor?: string
      outboundLocation?: string
      spec?: string
      unit?: string
      price?: number
      cost?: number
      totalQuantity?: number | null
      taxType?: string
      imageUrl?: string
      description?: string
      editingCode?: string
      purchaseSource?: 'hq' | 'store'
      stockBaseUnit?: string
      stockUnitOptions?: { unit: string; factor: number }[]
      standardUnits?: { unit: string; totalQuantity: number }[]
      accountSubjectId?: number | null
    }

    code = String(body.code || '').trim()
    const name = String(body.name || '').trim()
    const editingCode = body.editingCode ? String(body.editingCode).trim() : null
    if (!code || !name) {
      return NextResponse.json({ success: false, message: '코드와 품목명이 필요합니다.' }, { headers })
    }

    const tax = taxTypeToDb(body.taxType || 'taxable')
    const purchaseSource = (body.purchaseSource || 'hq') === 'store' ? 'store' : 'hq'
    const categoryRaw = String(body.category || '').trim()
    const category = purchaseSource === 'store' && !categoryRaw ? 'Store Only' : categoryRaw
    const stockUnitOpts = Array.isArray(body.stockUnitOptions)
      ? body.stockUnitOptions
          .filter((x) => x && String(x.unit || '').trim())
          .map((x) => ({ unit: String(x.unit).trim(), factor: Number(x.factor) || 1 }))
      : []
    const standardUnitsDb = Array.isArray(body.standardUnits)
      ? body.standardUnits
          .filter((x) => x && String(x.unit || '').trim() && Number(x.totalQuantity) > 0)
          .map((x) => ({ unit: String(x.unit).trim(), total_quantity: Number(x.totalQuantity) || 1 }))
      : []
    const accountSubjectIdRaw =
      body.accountSubjectId != null && !Number.isNaN(Number(body.accountSubjectId))
        ? Number(body.accountSubjectId)
        : null
    const accountSubjectIdEff =
      accountSubjectIdRaw != null && Number.isFinite(accountSubjectIdRaw) && accountSubjectIdRaw > 0
        ? accountSubjectIdRaw
        : await resolveDefaultItemAccountSubjectId(category)
    const row = {
      code,
      name,
      category,
      vendor: String(body.vendor || '').trim(),
      outbound_location: String(body.outboundLocation || '').trim(),
      spec: String(body.spec || '').trim(),
      unit: String(body.unit || '').trim(),
      price: roundErp3(Number(body.price) || 0),
      cost: roundErp3(Number(body.cost) || 0),
      total_quantity: body.totalQuantity != null && body.totalQuantity > 0 ? Number(body.totalQuantity) : null,
      image: String(body.imageUrl || '').trim(),
      description: String(body.description || '').trim() || null,
      tax,
      purchase_source: purchaseSource,
      stock_base_unit: String(body.stockBaseUnit || '').trim(),
      stock_unit_options: stockUnitOpts,
      standard_units: standardUnitsDb,
      account_subject_id:
        accountSubjectIdEff != null && Number.isFinite(accountSubjectIdEff) && accountSubjectIdEff > 0
          ? accountSubjectIdEff
          : null,
    }

    const filterCode = editingCode || code
    const itemFilter = appendInventoryTenantFilter(
      `code=eq.${encodeURIComponent(filterCode)}`,
      tenantScope
    )
    let existing: { id?: number; price?: number; cost?: number; name?: string; category?: string; image?: string }[] | null
    try {
      existing = (await supabaseSelectFilter('items', itemFilter, {
        limit: 1,
      })) as { id?: number; price?: number; cost?: number; name?: string; category?: string; image?: string }[] | null
    } catch (err) {
      if (isMissingInventoryTenantIdColumnError(err)) {
        markInventoryTenantIdColumnMissing()
        return NextResponse.json(
          {
            success: false,
            message: 'items tenant_id 스키마가 없습니다. sql/inventory_tenant_id.sql 을 실행해 주세요.',
          },
          { headers }
        )
      }
      throw err
    }

    // 수정 시 폼 리셋/오류로 빈 값이 오면 기존 값 유지 (이미지·분류 누락 방지)
    if (existing && existing.length > 0) {
      const prev = existing[0] as { image?: string; category?: string }
      const incomingImage = String(body.imageUrl || '').trim()
      if (!incomingImage && prev.image != null && String(prev.image).trim()) {
        ;(row as Record<string, unknown>).image = String(prev.image).trim()
      }
      const incomingCategory = String(body.category || '').trim()
      if (!incomingCategory && prev.category != null && String(prev.category).trim()) {
        row.category = String(prev.category).trim()
      }
    }

    if (existing && existing.length > 0) {
      const prev = existing[0] as { price?: number; cost?: number; name?: string; category?: string }
      const cat = (prev.category || row.category || '').trim()
      const changes: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
      if (Number(prev.price) !== row.price) {
        changes.push({ fieldName: 'price', oldValue: prev.price ?? null, newValue: row.price as number })
      }
      if (Number(prev.cost) !== row.cost) {
        changes.push({ fieldName: 'cost', oldValue: prev.cost ?? null, newValue: row.cost as number })
      }
      if (changes.length > 0) {
        recordPriceChanges({
          entityType: 'item',
          entityId: filterCode,
          entityDisplayName: prev.name ?? name,
          changes,
          changedBy: String(auth?.name || '').trim() || String(auth?.employeeCode || '').trim() || undefined,
          category: cat || undefined,
        }).catch(() => {})
      }
    }

    const tryWrite = async (payload: Record<string, unknown>) => {
      if (existing && existing.length > 0) {
        await supabaseUpdateByFilter('items', itemFilter, payload)
      } else {
        await supabaseInsert('items', stampInventoryTenantId(payload, tenantScope))
        const price = Number(row.price) || 0
        const cost = Number(row.cost) || 0
        recordPriceChanges({
          entityType: 'item',
          entityId: filterCode,
          entityDisplayName: name,
          changes: [
            { fieldName: 'price', oldValue: null, newValue: price },
            { fieldName: 'cost', oldValue: null, newValue: cost },
          ],
          changedBy: String(auth?.name || '').trim() || String(auth?.employeeCode || '').trim() || undefined,
          category: (row.category as string || '').trim() || undefined,
        }).catch(() => {})
      }
    }
    try {
      await tryWrite(row)
    } catch (colErr) {
      const errMsg = colErr instanceof Error ? colErr.message : String(colErr)
      if (
        /stock_base_unit|stock_unit_options|account_subject_id|column.*does not exist/i.test(errMsg)
      ) {
        const {
          stock_base_unit: _sbu,
          stock_unit_options: _suo,
          account_subject_id: _asid,
          ...rowWithoutCompatCols
        } = row
        const rowWithoutStock = rowWithoutCompatCols
        await tryWrite(rowWithoutStock)
      } else {
        throw colErr
      }
    }
    return NextResponse.json({ success: true, message: existing?.length ? '수정되었습니다.' : '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveItem:', e)
    const errMsg = e instanceof Error ? e.message : String(e)
    const isDuplicateCode =
      errMsg.includes('23505') ||
      /duplicate key|unique constraint|items_code/i.test(errMsg)
    const message = isDuplicateCode
      ? `품목 코드 "${code || '(입력값)'}"가 이미 사용 중입니다. 다른 코드를 입력해 주세요.`
      : errMsg || '저장 실패'
    return NextResponse.json({ success: false, message }, { headers })
  }
}
