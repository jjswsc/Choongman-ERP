import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { writeBankAccountAudit } from '@/lib/bank-account-audit'

function allowedStoresForAuth(auth: { store?: string; allowedStores?: string[] }): string[] {
  const userStore = String(auth.store || '').trim()
  return (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .concat(userStore)
}

function canAccessAccountStore(
  auth: { store?: string; allowedStores?: string[]; role?: string },
  accountStore: string
): boolean {
  const role = String(auth.role || '')
  if (isOfficeRole(role) || isAccountingRole(role)) return true
  const store = String(accountStore || '').trim()
  if (!store) return false
  return allowedStoresForAuth(auth).some((s) => storesMatchForGradeLookup(s, store))
}

/** 통장(계좌) 추가 또는 기초잔액 수정 — 감사 로그 기록 */
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

  try {
    const body = await request.json()
    const id = body.id ? Number(body.id) : null
    const name = String(body.name || '').trim()
    const store = String(body.store || '').trim()
    const bankName = String(body.bankName ?? body.bank_name ?? '').trim()
    const openingBalance = Number(body.openingBalance ?? body.opening_balance ?? 0)
    const openingBalanceDate = body.openingBalanceDate || body.opening_balance_date
      ? String(body.openingBalanceDate || body.opening_balance_date).slice(0, 10)
      : null

    if (!name) {
      return NextResponse.json({ success: false, message: '계좌명을 입력하세요.' }, { status: 400, headers })
    }

    if (id) {
      const existingRows = (await supabaseSelectFilter('bank_accounts', `id=eq.${id}`, {
        limit: 1,
        select: 'id,name,store,bank_name,opening_balance,opening_balance_date',
      })) as {
        id?: number
        name?: string
        store?: string
        bank_name?: string
        opening_balance?: number
        opening_balance_date?: string | null
      }[] | null
      const existing = existingRows?.[0]
      if (!existing?.id) {
        return NextResponse.json({ success: false, message: '해당 계좌가 없습니다.' }, { status: 404, headers })
      }

      const targetStore = store || String(existing.store || '').trim()
      if (!canAccessAccountStore(auth, targetStore)) {
        await writeBankAccountAudit({
          actionType: 'update',
          decision: 'deny',
          auth,
          accountId: id,
          accountStore: targetStore,
          accountName: name,
          bankName,
          reasonCode: 'store_scope',
        })
        return NextResponse.json(
          { success: false, message: '해당 매장 통장만 수정할 수 있습니다.' },
          { status: 403, headers }
        )
      }

      const before = {
        name: String(existing.name || '').trim(),
        store: String(existing.store || '').trim(),
        bankName: String(existing.bank_name || '').trim(),
        openingBalance: Number(existing.opening_balance) || 0,
        openingBalanceDate: existing.opening_balance_date
          ? String(existing.opening_balance_date).slice(0, 10)
          : null,
      }
      const after = {
        name,
        store: targetStore || null,
        bankName: bankName || null,
        openingBalance,
        openingBalanceDate,
      }

      await supabaseUpdate('bank_accounts', id, {
        name,
        store: targetStore || null,
        bank_name: bankName || null,
        opening_balance: openingBalance,
        opening_balance_date: openingBalanceDate,
      })

      await writeBankAccountAudit({
        actionType: 'update',
        decision: 'allow',
        auth,
        accountId: id,
        accountStore: targetStore,
        accountName: name,
        bankName,
        payload: { before, after },
      })

      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const effectiveStore = store || String(auth.store || '').trim()
    if (!effectiveStore) {
      return NextResponse.json({ success: false, message: '매장 정보가 필요합니다.' }, { status: 400, headers })
    }
    if (!canAccessAccountStore(auth, effectiveStore)) {
      await writeBankAccountAudit({
        actionType: 'create',
        decision: 'deny',
        auth,
        accountStore: effectiveStore,
        accountName: name,
        bankName,
        reasonCode: 'store_scope',
      })
      return NextResponse.json(
        { success: false, message: '해당 매장 통장만 등록할 수 있습니다.' },
        { status: 403, headers }
      )
    }

    const inserted = (await supabaseInsert('bank_accounts', {
      name,
      store: effectiveStore || null,
      bank_name: bankName || null,
      opening_balance: openingBalance,
      opening_balance_date: openingBalanceDate,
    })) as { id?: number }[]
    const newId = Array.isArray(inserted) && inserted[0]?.id != null ? inserted[0].id : null

    await writeBankAccountAudit({
      actionType: 'create',
      decision: 'allow',
      auth,
      accountId: newId,
      accountStore: effectiveStore,
      accountName: name,
      bankName,
      payload: {
        openingBalance,
        openingBalanceDate,
      },
    })

    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveBankAccount:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
