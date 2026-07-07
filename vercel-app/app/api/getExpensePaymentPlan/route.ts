import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { expenseAccrualNetPayable } from '@/lib/expense-accrual-net'
import { isAccountingRole, isFranchiseeRole, isManagerRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import { buildExpenseAccrualPlanDateFilters } from '@/lib/expense-accrual-plan-filters'
import { parseExpenseAttachmentUrls } from '@/lib/expense-attachment-urls'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

function canViewExpensePaymentPlan(role: string): boolean {
  return (
    isOfficeRole(role) ||
    isAccountingRole(role) ||
    isManagerRole(role) ||
    isFranchiseeRole(role)
  )
}

function callerSeesAllAccrualStores(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

type ExpenseAccrualRow = {
  id?: number
  payee_code?: string
  payee_name?: string
  amount?: number
  vat_amount?: number | null
  withholding_tax_amount?: number | null
  expense_date?: string
  due_date?: string
  memo?: string
  account_subject_id?: number
  store_name?: string
  status?: string
  created_at?: string
  approved_by?: string
  approved_at?: string
  approval_note?: string
  rejected_by?: string
  rejected_at?: string
  rejection_note?: string
  attachment_urls?: string | null
  invoice_received?: boolean | null
  invoice_no?: string | null
  invoice_photo_url?: string | null
}

function parseAttachmentUrls(raw: string | null | undefined): string[] {
  return parseExpenseAttachmentUrls(raw)
}

type PayableTxRow = {
  id?: number
  vendor_code?: string
  amount?: number
  ref_type?: string
  ref_id?: number
  trans_date?: string
  memo?: string
  expense_accrual_id?: number
}

function decodePayeeCode(raw: string | undefined): { payeeCode: string; withdrawalCategory: string } {
  const src = String(raw || '').trim()
  const marker = '::wm::'
  const idx = src.lastIndexOf(marker)
  if (idx < 0) return { payeeCode: src, withdrawalCategory: 'expense' }
  const payeeCode = src.slice(0, idx).trim()
  const withdrawalCategory = src.slice(idx + marker.length).trim().toLowerCase() || 'expense'
  return { payeeCode, withdrawalCategory }
}

function inRange(dateStr: string | undefined, startStr: string, endStr: string): boolean {
  const d = String(dateStr || '').slice(0, 10)
  if (!d) return false
  return (!startStr || d >= startStr) && (!endStr || d <= endStr)
}

/** 발생일 또는 지급예정일 중 하나라도 기간에 들어오면 포함 (지급예정일만 미래인 건이 발생일 검색에서 누락되지 않도록) */
function accrualMatchesPlanDateRange(
  r: ExpenseAccrualRow,
  startStr: string,
  endStr: string
): boolean {
  if (!startStr && !endStr) return true
  const expOk = inRange(r.expense_date, startStr, endStr)
  const dueOk = inRange(r.due_date, startStr, endStr)
  return expOk || dueOk
}

function isPurchaseWithdrawalCategory(cat: string | undefined): boolean {
  const c = String(cat || '').trim().toLowerCase()
  return c === 'purchase_payment' || c === 'purchase_advance'
}

const ACCRUAL_PLAN_SELECT =
  'id,payee_code,payee_name,amount,vat_amount,withholding_tax_amount,expense_date,due_date,memo,account_subject_id,store_name,status,created_at,approved_by,approved_at,approval_note,rejected_by,rejected_at,rejection_note,attachment_urls,invoice_received,invoice_no,invoice_photo_url'

async function fetchExpenseAccrualsForPlanRange(
  startStr: string,
  endStr: string
): Promise<ExpenseAccrualRow[]> {
  const filters = buildExpenseAccrualPlanDateFilters(startStr, endStr)
  const batches = await Promise.all(
    filters.map((filter) =>
      supabaseSelectFilter('expense_accruals', filter, {
        select: ACCRUAL_PLAN_SELECT,
        order: 'due_date.asc,expense_date.asc,id.desc',
        limit: 5000,
      }) as Promise<ExpenseAccrualRow[]>
    )
  )
  const byId = new Map<number, ExpenseAccrualRow>()
  for (const rows of batches) {
    for (const r of rows || []) {
      const id = Number(r.id || 0)
      if (id > 0) byId.set(id, r)
    }
  }
  return [...byId.values()]
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const { searchParams } = new URL(request.url)
    const startStr = String(searchParams.get('startStr') || '').slice(0, 10)
    const endStr = String(searchParams.get('endStr') || '').slice(0, 10)
    const payeeFilter = String(searchParams.get('payeeFilter') || '').trim().toLowerCase()
    const vendorFilter = String(searchParams.get('vendorFilter') || '').trim().toLowerCase()
    const userRole = String(auth.role || '').trim()
    const callerStore = String(auth.store || '').trim()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(callerStore)
    if (!canViewExpensePaymentPlan(userRole)) {
      return NextResponse.json(
        {
          success: true,
          expensePlans: [],
          purchasePlans: [],
          totals: { expensePlanned: 0, expenseRemaining: 0, logisticsRemaining: 0 },
          logisticsPlans: [],
        },
        { headers }
      )
    }
    const canSeeAllStores = callerSeesAllAccrualStores(userRole)
    const scopedAllowedStores = canSeeAllStores ? [] : allowedStores

    const [accrualRows, payableRows] = await Promise.all([
      fetchExpenseAccrualsForPlanRange(startStr, endStr),
      supabaseSelectFilter('payable_transactions', 'id=gt.0', {
        select: 'id,vendor_code,amount,ref_type,ref_id,trans_date,memo,expense_accrual_id',
        order: 'trans_date.desc',
        limit: 10000,
      }) as Promise<PayableTxRow[]>,
    ])

    const paymentByAccrual = new Map<number, number>()
    for (const tx of payableRows || []) {
      const accrualId = Number(tx.expense_accrual_id || 0)
      if (!accrualId) continue
      const amt = Number(tx.amount || 0)
      if (amt < 0) paymentByAccrual.set(accrualId, (paymentByAccrual.get(accrualId) || 0) + Math.abs(amt))
    }

    const mappedAccrualPlans = (accrualRows || [])
      .filter((r) => {
        if (scopedAllowedStores.length > 0) {
          const sn = String(r.store_name || '').trim()
          const storeAllowed = scopedAllowedStores.some((s) => storesMatchForGradeLookup(s, sn))
          if (!storeAllowed) return false
        }
        if ((startStr || endStr) && !accrualMatchesPlanDateRange(r, startStr, endStr)) return false
        if (payeeFilter || vendorFilter) {
          const decoded = decodePayeeCode(r.payee_code)
          const target = `${decoded.payeeCode || ''} ${r.payee_name || ''} ${decoded.withdrawalCategory}`.toLowerCase()
          if (payeeFilter && !target.includes(payeeFilter)) return false
          if (vendorFilter && !target.includes(vendorFilter)) return false
        }
        return true
      })
      .map((r) => {
        const decoded = decodePayeeCode(r.payee_code)
        const id = Number(r.id || 0)
        const gross = Math.abs(Number(r.amount || 0))
        const vatAmt = Math.max(0, Math.abs(Number(r.vat_amount ?? 0) || 0))
        const whtAmt = Math.max(0, Math.abs(Number(r.withholding_tax_amount ?? 0) || 0))
        const planned = expenseAccrualNetPayable(gross, whtAmt)
        const paid = paymentByAccrual.get(id) || 0
        const remaining = Math.max(0, planned - paid)
        const attachmentUrls = parseAttachmentUrls(r.attachment_urls)
        return {
          id,
          payeeCode: decoded.payeeCode || '',
          payeeName: r.payee_name || r.payee_code || '',
          withdrawalCategory: decoded.withdrawalCategory,
          grossAmount: gross,
          vatAmount: vatAmt,
          withholdingTaxAmount: whtAmt,
          plannedAmount: planned,
          paidAmount: paid,
          remainingAmount: remaining,
          ...(attachmentUrls.length > 0 ? { attachmentUrls } : {}),
          invoiceReceived: Boolean(r.invoice_received),
          ...(String(r.invoice_no || '').trim() ? { invoiceNo: String(r.invoice_no).trim() } : {}),
          ...(String(r.invoice_photo_url || '').trim() ? { invoicePhotoUrl: String(r.invoice_photo_url).trim() } : {}),
          expenseDate: r.expense_date || '',
          dueDate: r.due_date || '',
          memo: r.memo || '',
          accountSubjectId: r.account_subject_id || null,
          status: (() => {
            const status = (() => {
              const raw = String(r.status || '').toLowerCase()
              if (raw === 'done') return 'paid'
              if (raw === 'partial') return 'approved'
              if (['planned', 'approved', 'paid', 'rejected'].includes(raw)) return raw
              return 'planned'
            })()
            if (status === 'rejected') return 'rejected'
            if (remaining <= 0) return 'paid'
            return status === 'approved' ? 'approved' : 'planned'
          })(),
          approvedBy: r.approved_by || null,
          approvedAt: r.approved_at || null,
          approvalNote: r.approval_note || null,
          rejectedBy: r.rejected_by || null,
          rejectedAt: r.rejected_at || null,
          rejectionNote: r.rejection_note || null,
          storeName: r.store_name || '',
        }
      })
      .sort((a, b) => (a.dueDate || a.expenseDate).localeCompare(b.dueDate || b.expenseDate))

    // purchase_* = 지출 등록에서 등록한 물류 지급예정만. payable_transactions(입고/PO)는 미수금 관리에서 확인
    const expensePlans = mappedAccrualPlans.filter((r) => !isPurchaseWithdrawalCategory(r.withdrawalCategory))
    const purchasePlans = mappedAccrualPlans.filter((r) => isPurchaseWithdrawalCategory(r.withdrawalCategory))

    const purchaseRemaining = purchasePlans.reduce((s, r) => s + r.remainingAmount, 0)
    const totals = {
      expensePlanned: expensePlans.reduce((s, r) => s + r.plannedAmount, 0),
      expenseRemaining: expensePlans.reduce((s, r) => s + r.remainingAmount, 0),
      logisticsRemaining: purchaseRemaining,
    }

    return NextResponse.json(
      { success: true, expensePlans, purchasePlans, totals, logisticsPlans: [] },
      { headers }
    )
  } catch (e) {
    console.error('getExpensePaymentPlan:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '조회 실패' },
      { status: 500, headers }
    )
  }
}
