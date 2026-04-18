/**
 * loginCheck 라우트 catch — 스택 노출 없이 원인별 안내 (인터넷 탓으로만 돌리지 않음)
 */

export function loginCheckFailureFromError(e: unknown): { message: string; code?: string } {
  const text = (() => {
    if (e instanceof Error) {
      const c = e.cause instanceof Error ? e.cause.message : ''
      return `${e.message}${c ? `\n${c}` : ''}`
    }
    return String(e)
  })()

  // jwt-auth getSecret — 운영에서 짧거나 없음
  if (/JWT_SECRET|서버 전용 JWT|32자 이상|fallback_secret/i.test(text)) {
    return {
      message:
        '로그인 서버 설정(JWT_SECRET)이 올바르지 않습니다. Vercel 등 배포 환경 변수에 32자 이상의 JWT_SECRET을 넣은 뒤 재배포해 주세요.',
      code: 'JWT_CONFIG',
    }
  }

  if (/supabase|pgrst|postgrest|42703|does not exist|relation .* does not exist|column .* does not exist/i.test(text)) {
    return {
      message:
        '직원·매장 정보를 불러오지 못했습니다. Supabase 연결·테이블(employees 등)·환경 변수를 관리자가 확인해 주세요.',
      code: 'DB_SCHEMA',
    }
  }

  if (/fetch failed|econnrefused|enotfound|etimedout|socket|network|getaddrinfo|timed out/i.test(text)) {
    return {
      message: '데이터 서버에 연결하지 못했습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.',
      code: 'UPSTREAM',
    }
  }

  return {
    message: '로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.',
    code: 'UNKNOWN',
  }
}
