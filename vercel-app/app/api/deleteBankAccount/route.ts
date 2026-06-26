import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { canDeleteBankAccount } from '@/lib/permissions'
import { writeBankAccountAudit } from '@/lib/bank-account-audit'

/** 통장(계좌) 삭제 — 본사·회계만, 감사 로그 기록 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Content-Type', 'application/json')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const userRole = String(auth.role || '')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: '계좌 ID가 필요합니다.' }, { status: 400, headers })
    }

    const accountRows = (await supabaseSelectFilter('bank_accounts', `id=eq.${id}`, {
      limit: 1,
      select: 'id,name,store,bank_name,opening_balance,opening_balance_date,created_at',
    })) as {
      id?: number
      name?: string
      store?: string
      bank_name?: string
      opening_balance?: number
      opening_balance_date?: string | null
      created_at?: string
    }[] | null
    const account = accountRows?.[0]
    if (!account?.id) {
      return NextResponse.json({ success: false, message: '해당 계좌가 없습니다.' }, { status: 404, headers })
    }

    const txCountRows = (await supabaseSelectFilter('bank_transactions', `account_id=eq.${id}`, {
      limit: 50000,
      select: 'id,trans_date',
      order: 'trans_date.asc',
    })) as { id?: number; trans_date?: string }[] | null
    const txCount = (txCountRows || []).length
    const firstDate = txCountRows?.[0]?.trans_date ? String(txCountRows[0].trans_date).slice(0, 10) : null
    const lastDate =
      txCountRows && txCountRows.length > 0
        ? String(txCountRows[txCountRows.length - 1]?.trans_date || '').slice(0, 10) || null
        : null

    const snapshot = {
      accountId: account.id,
      name: String(account.name || '').trim(),
      store: String(account.store || '').trim(),
      bankName: String(account.bank_name || '').trim(),
      openingBalance: Number(account.opening_balance) || 0,
      openingBalanceDate: account.opening_balance_date
        ? String(account.opening_balance_date).slice(0, 10)
        : null,
      accountCreatedAt: account.created_at ? String(account.created_at) : null,
      transactionCount: txCount,
      firstTransactionDate: firstDate,
      lastTransactionDate: lastDate,
    }

    if (!canDeleteBankAccount(userRole)) {
      await writeBankAccountAudit({
        actionType: 'delete_denied',
        decision: 'deny',
        auth,
        accountId: id,
        accountStore: snapshot.store,
        accountName: snapshot.name,
        bankName: snapshot.bankName,
        reasonCode: 'office_or_accounting_only',
        payload: snapshot,
      })
      return NextResponse.json(
        {
          success: false,
          message: '통장 계좌 삭제는 본사·회계 권한만 가능합니다. 통장 변경 시 「계좌 추가」를 사용하세요.',
        },
        { status: 403, headers }
      )
    }

    await supabaseDeleteByFilter('bank_accounts', `id=eq.${id}`)

    await writeBankAccountAudit({
      actionType: 'delete',
      decision: 'allow',
      auth,
      accountId: id,
      accountStore: snapshot.store,
      accountName: snapshot.name,
      bankName: snapshot.bankName,
      payload: snapshot,
    })

    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteBankAccount:', e)
    try {
      await writeBankAccountAudit({
        actionType: 'delete',
        decision: 'error',
        auth,
        reasonCode: 'exception',
        payload: { error: e instanceof Error ? e.message : String(e) },
      })
    } catch {
      /* ignore audit failure */
    }
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
