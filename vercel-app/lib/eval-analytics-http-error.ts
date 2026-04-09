/**
 * getEvaluationAnalytics / summarizeEvaluationAnalytics 등 평가 분석 API의 HTTP 오류를
 * 사용자용 문구로 바꾸고, 재로그인 유도 여부를 판별합니다.
 */

export type EvalAnalyticsHttpErrorResult = {
  message: string
  /** true면 알림 후 관리자 로그인으로 이동 */
  redirectToAdminLogin: boolean
}

export function parseEvalAnalyticsErrorResponse(
  status: number,
  bodyText: string
): EvalAnalyticsHttpErrorResult {
  let apiError = ''
  try {
    const j = JSON.parse(bodyText) as { error?: string }
    if (j?.error && typeof j.error === 'string') apiError = j.error.trim()
  } catch {
    //
  }

  if (status === 401) {
    return {
      message:
        '세션이 만료되었거나 로그인이 필요합니다. 확인을 누르면 로그인 화면으로 이동합니다.',
      redirectToAdminLogin: true,
    }
  }

  if (status === 403) {
    if (apiError === 'Missing store scope') {
      return {
        message: '매장 정보가 없어 이 기능을 사용할 수 없습니다. 다시 로그인해 주세요.',
        redirectToAdminLogin: true,
      }
    }
    return {
      message: '이 기능을 사용할 권한이 없습니다.',
      redirectToAdminLogin: false,
    }
  }

  if (status === 400 && apiError === 'Invalid date range') {
    return { message: '평가 기간(시작일·종료일)을 확인해 주세요.', redirectToAdminLogin: false }
  }

  if (status === 429) {
    return {
      message: '요약 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
      redirectToAdminLogin: false,
    }
  }

  if (status === 503 && apiError.includes('OPENAI_API_KEY')) {
    return {
      message: 'AI 요약 기능이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.',
      redirectToAdminLogin: false,
    }
  }

  if (apiError === 'OpenAI request failed') {
    return {
      message: 'AI 요약 서버 응답에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      redirectToAdminLogin: false,
    }
  }

  const fallback =
    bodyText && bodyText.length < 400 && !bodyText.trim().startsWith('{')
      ? bodyText.trim()
      : status >= 500
        ? '서버 오류로 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        : '요청을 처리하지 못했습니다.'

  return { message: fallback, redirectToAdminLogin: false }
}

/** api-client에서 throw 시 컴포넌트가 재로그인 이동 여부를 판별 */
export function attachEvalAnalyticsRedirectFlag(
  err: Error,
  redirect: boolean
): Error & { redirectToAdminLogin?: boolean } {
  const e = err as Error & { redirectToAdminLogin?: boolean }
  e.redirectToAdminLogin = redirect
  return e
}

export function shouldRedirectToAdminLoginAfterEvalAnalyticsError(e: unknown): boolean {
  return (
    e != null &&
    typeof e === 'object' &&
    'redirectToAdminLogin' in e &&
    (e as { redirectToAdminLogin?: boolean }).redirectToAdminLogin === true
  )
}
