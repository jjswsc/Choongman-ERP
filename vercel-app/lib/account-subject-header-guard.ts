import { ACCOUNT_SUBJECT_HEADER_MESSAGE_KO } from '@/lib/account-subject-header-messages'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export { ACCOUNT_SUBJECT_HEADER_MESSAGE_KO }

/**
 * 통장·고정비·카드·미지급 등에 저장되는 account_subject_id가 헤더 계정이면 거부.
 * `is_header` 컬럼이 없는 DB(마이그레이션 전)에서는 조회 실패 시 통과시켜 기존 동작을 유지한다.
 */
export async function assertAccountSubjectNotHeader(
  accountSubjectId: number | null | undefined
): Promise<{ ok: true } | { ok: false; message: string; status: number }> {
  if (accountSubjectId == null || Number.isNaN(Number(accountSubjectId)) || Number(accountSubjectId) <= 0) {
    return { ok: true }
  }
  const id = Number(accountSubjectId)
  try {
    const rows = (await supabaseSelectFilter('account_subjects', `id=eq.${id}`, {
      limit: 1,
      select: 'id,is_header',
    })) as { id?: number; is_header?: boolean | null }[] | null
    const row = rows?.[0]
    if (!row?.id) {
      return { ok: false, message: '존재하지 않는 계정과목입니다.', status: 400 }
    }
    if (row.is_header === true) {
      return { ok: false, message: ACCOUNT_SUBJECT_HEADER_MESSAGE_KO, status: 400 }
    }
  } catch {
    return { ok: true }
  }
  return { ok: true }
}
