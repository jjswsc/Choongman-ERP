import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { deleteJournalEntriesBySource, postJournalEntry } from '@/lib/accounting-posting'
import { accountLine } from '@/lib/chart-of-accounts-mapping'
import { requireAuth } from '@/lib/verify-auth'
import { hasOfficeStaffScope } from '@/lib/permissions'
import { resolveSaasTenantScope } from '@/lib/saas-tenant-scope'
import {
  createExpenseAccrualForFixedAsset,
  deletePlannedAccrualForFixedAssetIfSafe,
  findExpenseAccrualIdForFixedAsset,
} from '@/lib/fixed-asset-expense-accrual'

function normalizeAccountCode(v: unknown, fallback: string): string {
  const code = String(v || '')
    .trim()
    .toUpperCase()
  return code || fallback
}

function isMissingAccountColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('42703') ||
    msg.includes('asset_account_code') ||
    msg.includes('accumulated_depreciation_account_code') ||
    msg.includes('depreciation_expense_account_code')
  )
}

function stripAccountColumns<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload }
  delete next.asset_account_code
  delete next.accumulated_depreciation_account_code
  delete next.depreciation_expense_account_code
  return next
}

function isMissingDisposalColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('42703') ||
    msg.includes('disposed_proceeds') ||
    msg.includes('disposal_gain_loss_amount') ||
    msg.includes('disposal_journal_entry_id')
  )
}

function stripDisposalColumns<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload }
  delete next.disposed_proceeds
  delete next.disposal_gain_loss_amount
  delete next.disposal_journal_entry_id
  return next
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const authRole = authResult.auth.role || ''
  const authStore = authResult.auth.store || ''

  try {
    const body = await request.json()
    const action = String(body.action || '').trim().toLowerCase()
    const id = body.id != null ? Number(body.id) : null
    const assetCode = String(body.assetCode || body.asset_code || '').trim()
    const name = String(body.name || '').trim()
    const storeName = String(body.storeName || body.store_name || 'All').trim()
    const acquisitionDate = String(body.acquisitionDate || body.acquisition_date || '').slice(0, 10)
    const acquisitionCost = Number(body.acquisitionCost || body.acquisition_cost) || 0
    const residualRate = Math.min(100, Math.max(0, Number(body.residualRate || body.residual_rate) || 0))
    const usefulLifeMonths = Math.max(1, Number(body.usefulLifeMonths || body.useful_life_months) || 60)
    const depreciationMethod = ['straight_line', 'declining_balance'].includes(
      String(body.depreciationMethod || body.depreciation_method || 'straight_line')
    )
      ? String(body.depreciationMethod || body.depreciation_method)
      : 'straight_line'
    const memo = String(body.memo || '').trim() || null
    const disposedAtInput = String(body.disposedAt || body.disposed_at || '').trim().slice(0, 10)
    const assetAccountCode = normalizeAccountCode(body.assetAccountCode || body.asset_account_code, '1460')
    const accumulatedDepreciationAccountCode = normalizeAccountCode(
      body.accumulatedDepreciationAccountCode || body.accumulated_depreciation_account_code,
      '1470'
    )
    const depreciationExpenseAccountCode = normalizeAccountCode(
      body.depreciationExpenseAccountCode || body.depreciation_expense_account_code,
      '5500'
    )

    if (action === 'delete') {
      if (!hasOfficeStaffScope(authRole, authStore)) {
        return NextResponse.json(
          { success: false, message: '본사·회계만 자산을 삭제할 수 있습니다.' },
          { status: 403, headers }
        )
      }
      if (!id || id <= 0) {
        return NextResponse.json({ success: false, message: '자산 ID가 필요합니다.' }, { status: 400, headers })
      }
      const existing = (await supabaseSelectFilter('fixed_assets', `id=eq.${id}`, { select: '*', limit: 1 })) as
        | Record<string, unknown>[]
        | null
      if (!existing?.length) {
        return NextResponse.json({ success: false, message: '해당 자산이 없습니다.' }, { status: 404, headers })
      }
      const row = existing[0] || {}
      const status = String(row.status || '').trim().toLowerCase()
      if (status === 'disposed') {
        return NextResponse.json(
          { success: false, message: '처분된 자산은 삭제할 수 없습니다. 복구 후 삭제하거나 처분 상태를 유지하세요.' },
          { status: 400, headers }
        )
      }
      const depRows = (await supabaseSelectFilter(
        'depreciation_entries',
        `fixed_asset_id=eq.${id}`,
        { select: 'id', limit: 1 }
      )) as { id?: number }[] | null
      if (depRows?.length) {
        return NextResponse.json(
          { success: false, message: '감가상각 실적이 있는 자산은 삭제할 수 없습니다. 처분을 사용하세요.' },
          { status: 400, headers }
        )
      }
      try {
        await deletePlannedAccrualForFixedAssetIfSafe(
          id,
          row.expense_accrual_id != null ? Number(row.expense_accrual_id) : null
        )
      } catch (accrualDelErr) {
        console.warn('saveFixedAsset delete accrual:', accrualDelErr)
      }
      try {
        await supabaseUpdateByFilter('bank_transactions', `fixed_asset_id=eq.${id}`, { fixed_asset_id: null })
      } catch (unlinkErr) {
        console.warn('saveFixedAsset delete unlink bank:', unlinkErr)
      }
      await supabaseDeleteByFilter('fixed_assets', `id=eq.${id}`)
      return NextResponse.json({ success: true, message: '자산이 삭제되었습니다.' }, { headers })
    }

    if (action === 'create_payment_plan' || action === 'createpaymentplan') {
      if (!hasOfficeStaffScope(authRole, authStore)) {
        return NextResponse.json(
          { success: false, message: '본사·회계만 지급예정을 만들 수 있습니다.' },
          { status: 403, headers }
        )
      }
      if (!id || id <= 0) {
        return NextResponse.json({ success: false, message: '자산 ID가 필요합니다.' }, { status: 400, headers })
      }
      const existing = (await supabaseSelectFilter('fixed_assets', `id=eq.${id}`, { select: '*', limit: 1 })) as
        | Record<string, unknown>[]
        | null
      if (!existing?.length) {
        return NextResponse.json({ success: false, message: '해당 자산이 없습니다.' }, { status: 404, headers })
      }
      const row = existing[0] || {}
      const status = String(row.status || '').trim().toLowerCase()
      if (status === 'disposed') {
        return NextResponse.json(
          { success: false, message: '처분된 자산에는 지급예정을 만들 수 없습니다.' },
          { status: 400, headers }
        )
      }
      const already = await findExpenseAccrualIdForFixedAsset({
        fixedAssetId: id,
        expenseAccrualIdOnAsset: row.expense_accrual_id != null ? Number(row.expense_accrual_id) : null,
      })
      if (already) {
        return NextResponse.json(
          {
            success: true,
            message: '이미 지급예정이 연결되어 있습니다. 통장 → 지출관리 연결에서 선택하세요.',
            expenseAccrualId: already,
          },
          { headers }
        )
      }
      const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
      const created = await createExpenseAccrualForFixedAsset({
        fixedAssetId: id,
        assetCode: String(row.asset_code || '').trim(),
        assetName: String(row.name || '').trim(),
        storeName: String(row.store_name || '').trim(),
        acquisitionDate: String(row.acquisition_date || '').slice(0, 10),
        acquisitionCost: Number(row.acquisition_cost || 0) || 0,
        assetAccountCode: String(row.asset_account_code || '').trim() || null,
        memo: String(row.memo || '').trim() || null,
        createdBy: authResult.auth.name || null,
        tenantScope,
      })
      if (!created.ok) {
        return NextResponse.json({ success: false, message: created.message }, { status: 400, headers })
      }
      return NextResponse.json(
        {
          success: true,
          message: '지급예정이 생성되었습니다. 통장 → 지출관리 연결에서 같은 금액·매장으로 연결하세요.',
          expenseAccrualId: created.expenseAccrualId,
        },
        { headers }
      )
    }

    if (action === 'dispose' || action === 'restore') {
      if (!id || id <= 0) {
        return NextResponse.json({ success: false, message: '자산 ID가 필요합니다.' }, { status: 400, headers })
      }
      const existing = (await supabaseSelectFilter('fixed_assets', `id=eq.${id}`, { select: '*', limit: 1 })) as
        | Record<string, unknown>[]
        | null
      if (!existing?.length) {
        return NextResponse.json({ success: false, message: '해당 자산이 없습니다.' }, { status: 404, headers })
      }
      const row = existing[0] || {}
      const disposeYmd = /^\d{4}-\d{2}-\d{2}$/.test(disposedAtInput)
        ? disposedAtInput
        : new Date().toISOString().slice(0, 10)
      const acquisitionCost = Math.max(0, Number(row.acquisition_cost || 0) || 0)
      const storeNameRaw = String(row.store_name || '').trim() || 'All'
      const assetNameRaw = String(row.name || '').trim() || `자산#${id}`
      const assetAccountCodeForDisposal = normalizeAccountCode(row.asset_account_code, '1460')
      const accumDepAccountCodeForDisposal = normalizeAccountCode(
        row.accumulated_depreciation_account_code,
        '1470'
      )
      const gainAccountCode = normalizeAccountCode(
        body.disposalGainAccountCode || body.disposal_gain_account_code,
        '4110'
      )
      const lossAccountCode = normalizeAccountCode(
        body.disposalLossAccountCode || body.disposal_loss_account_code,
        '5520'
      )
      const proceeds = Math.max(0, Number(body.disposalProceeds || body.disposal_proceeds || 0) || 0)
      const autoMemo = `[AUTO:ASSET_DISPOSAL:${id}] ${assetNameRaw} 처분 (${disposeYmd})`

      if (action === 'dispose') {
        const depRows = (await supabaseSelectFilter(
          'depreciation_entries',
          `fixed_asset_id=eq.${id}&accounting_date=lte.${disposeYmd}`,
          { select: 'amount', limit: 5000 }
        )) as { amount?: number | null }[] | null
        const accumulated = Math.min(
          acquisitionCost,
          (depRows || []).reduce((sum, r) => sum + (Number(r.amount || 0) || 0), 0)
        )
        const netBookValue = Math.max(0, acquisitionCost - accumulated)
        const gainLoss = Math.round((proceeds - netBookValue) * 100) / 100

        await deleteJournalEntriesBySource('fixed_asset_disposal', id, {
          memoIncludes: ['[AUTO:ASSET_DISPOSAL:'],
        })

        const lines: {
          accountCode: string
          accountName: string
          side: 'debit' | 'credit'
          amount: number
        }[] = []
        if (accumulated > 0) {
          const acc = accountLine(accumDepAccountCodeForDisposal)
          lines.push({ accountCode: acc.accountCode, accountName: acc.accountName, side: 'debit', amount: accumulated })
        }
        if (proceeds > 0) {
          const cash = accountLine('1010')
          lines.push({ accountCode: cash.accountCode, accountName: cash.accountName, side: 'debit', amount: proceeds })
        }
        if (gainLoss < 0) {
          const loss = accountLine(lossAccountCode)
          lines.push({ accountCode: loss.accountCode, accountName: loss.accountName, side: 'debit', amount: Math.abs(gainLoss) })
        }
        const assetAcc = accountLine(assetAccountCodeForDisposal)
        lines.push({ accountCode: assetAcc.accountCode, accountName: assetAcc.accountName, side: 'credit', amount: acquisitionCost })
        if (gainLoss > 0) {
          const gain = accountLine(gainAccountCode)
          lines.push({ accountCode: gain.accountCode, accountName: gain.accountName, side: 'credit', amount: gainLoss })
        }

        const disposalJeId = await postJournalEntry({
          accountingDate: disposeYmd,
          sourceType: 'fixed_asset_disposal',
          sourceId: id,
          storeName: storeNameRaw,
          memo: memo || autoMemo,
          lines,
        })

        try {
          await supabaseUpdate('fixed_assets', id, {
            status: 'disposed',
            disposed_at: disposeYmd,
            disposed_proceeds: proceeds,
            disposal_gain_loss_amount: gainLoss,
            disposal_journal_entry_id: disposalJeId || null,
            memo,
            updated_at: new Date().toISOString(),
          })
        } catch (e) {
          if (!isMissingDisposalColumnError(e)) throw e
          await supabaseUpdate(
            'fixed_assets',
            id,
            stripDisposalColumns({
              status: 'disposed',
              disposed_at: disposeYmd,
              disposed_proceeds: proceeds,
              disposal_gain_loss_amount: gainLoss,
              disposal_journal_entry_id: disposalJeId || null,
              memo,
              updated_at: new Date().toISOString(),
            })
          )
        }
      } else {
        await deleteJournalEntriesBySource('fixed_asset_disposal', id, {
          memoIncludes: ['[AUTO:ASSET_DISPOSAL:'],
        })
        try {
          await supabaseUpdate('fixed_assets', id, {
            status: 'active',
            disposed_at: null,
            disposed_proceeds: 0,
            disposal_gain_loss_amount: null,
            disposal_journal_entry_id: null,
            memo,
            updated_at: new Date().toISOString(),
          })
        } catch (e) {
          if (!isMissingDisposalColumnError(e)) throw e
          await supabaseUpdate(
            'fixed_assets',
            id,
            stripDisposalColumns({
              status: 'active',
              disposed_at: null,
              disposed_proceeds: 0,
              disposal_gain_loss_amount: null,
              disposal_journal_entry_id: null,
              memo,
              updated_at: new Date().toISOString(),
            })
          )
        }
      }
      return NextResponse.json(
        { success: true, message: action === 'dispose' ? '자산이 처분 처리되었습니다.' : '자산이 복구되었습니다.' },
        { headers }
      )
    }

    if (!name) {
      return NextResponse.json({ success: false, message: '자산명을 입력하세요.' }, { status: 400, headers })
    }
    if (!acquisitionDate || !/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)) {
      return NextResponse.json({ success: false, message: '취득일을 입력하세요.' }, { status: 400, headers })
    }
    if (acquisitionCost < 0) {
      return NextResponse.json({ success: false, message: '취득가를 입력하세요.' }, { status: 400, headers })
    }

    const code = assetCode || `FA-${Date.now()}`

    if (id && id > 0) {
      const existing = (await supabaseSelectFilter('fixed_assets', `id=eq.${id}`, { limit: 1 })) as { id?: number }[]
      if (!existing?.length) {
        return NextResponse.json({ success: false, message: '해당 자산이 없습니다.' }, { status: 404, headers })
      }
      try {
        await supabaseUpdate('fixed_assets', id, {
          asset_code: code,
          name,
          store_name: storeName,
          acquisition_date: acquisitionDate,
          acquisition_cost: acquisitionCost,
          residual_rate: residualRate,
          useful_life_months: usefulLifeMonths,
          depreciation_method: depreciationMethod,
          memo,
          asset_account_code: assetAccountCode,
          accumulated_depreciation_account_code: accumulatedDepreciationAccountCode,
          depreciation_expense_account_code: depreciationExpenseAccountCode,
          updated_at: new Date().toISOString(),
        })
      } catch (e) {
        if (!isMissingAccountColumnError(e)) throw e
        await supabaseUpdate(
          'fixed_assets',
          id,
          stripAccountColumns({
            asset_code: code,
            name,
            store_name: storeName,
            acquisition_date: acquisitionDate,
            acquisition_cost: acquisitionCost,
            residual_rate: residualRate,
            useful_life_months: usefulLifeMonths,
            depreciation_method: depreciationMethod,
            memo,
            asset_account_code: assetAccountCode,
            accumulated_depreciation_account_code: accumulatedDepreciationAccountCode,
            depreciation_expense_account_code: depreciationExpenseAccountCode,
            updated_at: new Date().toISOString(),
          })
        )
      }
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    if (!hasOfficeStaffScope(authRole, authStore)) {
      return NextResponse.json(
        {
          success: false,
          message:
            '고정자산 신규 등록은 지출 관리 → 발생등록(유형: 고정자산)에서 하세요. 본사·회계만 예외 등록(기초잔액 등)이 가능합니다.',
        },
        { status: 403, headers }
      )
    }

    const existingCode = (await supabaseSelectFilter('fixed_assets', `asset_code=eq.${encodeURIComponent(code)}`, { limit: 1 })) as unknown[]
    if (existingCode?.length) {
      return NextResponse.json({ success: false, message: '동일한 자산코드가 이미 있습니다.' }, { status: 400, headers })
    }

    const openingBalanceOnly =
      body.openingBalanceOnly === true ||
      body.opening_balance_only === true ||
      body.skipPaymentPlan === true ||
      body.skip_payment_plan === true

    let insertedId = 0
    try {
      const inserted = (await supabaseInsert('fixed_assets', {
        asset_code: code,
        name,
        store_name: storeName,
        acquisition_date: acquisitionDate,
        acquisition_cost: acquisitionCost,
        residual_rate: residualRate,
        useful_life_months: usefulLifeMonths,
        depreciation_method: depreciationMethod,
        status: 'active',
        memo,
        asset_account_code: assetAccountCode,
        accumulated_depreciation_account_code: accumulatedDepreciationAccountCode,
        depreciation_expense_account_code: depreciationExpenseAccountCode,
      })) as { id?: number }[]
      insertedId = Number(inserted?.[0]?.id || 0)
    } catch (e) {
      if (!isMissingAccountColumnError(e)) throw e
      const inserted = (await supabaseInsert(
        'fixed_assets',
        stripAccountColumns({
          asset_code: code,
          name,
          store_name: storeName,
          acquisition_date: acquisitionDate,
          acquisition_cost: acquisitionCost,
          residual_rate: residualRate,
          useful_life_months: usefulLifeMonths,
          depreciation_method: depreciationMethod,
          status: 'active',
          memo,
          asset_account_code: assetAccountCode,
          accumulated_depreciation_account_code: accumulatedDepreciationAccountCode,
          depreciation_expense_account_code: depreciationExpenseAccountCode,
        })
      )) as { id?: number }[]
      insertedId = Number(inserted?.[0]?.id || 0)
    }

    if (!insertedId) {
      const again = (await supabaseSelectFilter(
        'fixed_assets',
        `asset_code=eq.${encodeURIComponent(code)}`,
        { select: 'id', limit: 1 }
      )) as { id?: number }[] | null
      insertedId = Number(again?.[0]?.id || 0)
    }

    let expenseAccrualId: number | null = null
    let paymentPlanMessage = ''
    if (!openingBalanceOnly && insertedId > 0) {
      const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
      const created = await createExpenseAccrualForFixedAsset({
        fixedAssetId: insertedId,
        assetCode: code,
        assetName: name,
        storeName,
        acquisitionDate,
        acquisitionCost,
        assetAccountCode,
        memo,
        createdBy: authResult.auth.name || null,
        tenantScope,
      })
      if (created.ok) {
        expenseAccrualId = created.expenseAccrualId
        paymentPlanMessage = ' 지급예정이 함께 생성되었습니다. 통장 → 지출관리 연결에서 연결하세요.'
      } else {
        paymentPlanMessage = ` 자산은 등록됐으나 지급예정 생성 실패: ${created.message}`
      }
    } else if (openingBalanceOnly) {
      paymentPlanMessage = ' (기초잔액 전용 — 지급예정 없음)'
    }

    return NextResponse.json(
      {
        success: true,
        message: `등록되었습니다.${paymentPlanMessage}`,
        id: insertedId || undefined,
        expenseAccrualId,
      },
      { headers }
    )
  } catch (e) {
    console.error('saveFixedAsset:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
