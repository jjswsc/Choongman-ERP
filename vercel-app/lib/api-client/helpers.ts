/** api-client 내부 공용 헬퍼 (원본 api-client.ts에서 분리) */

/** 목록 API: 비 JSON·HTML 오류·빈 본문 시 빈 배열 */
export async function apiJsonArrayResponse<T>(res: Response): Promise<T[]> {
  if (!res.ok) return []
  try {
    const data = await res.json()
    return Array.isArray(data) ? (data as T[]) : []
  } catch {
    return []
  }
}

/** 오프라인 큐의 가짜 성공(JSON)과 구분 — 관리자 원가 분석 등 “즉시 반영” 저장용 */
export async function parsePosMutationResponse(res: Response): Promise<{ success: boolean; message?: string }> {
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `요청 실패 (${res.status})`)
  }
  if (res.headers.get('X-Offline-Queued') === '1') {
    throw new Error(
      data?.message ||
        '네트워크 오류로 서버에 저장되지 않았습니다. 연결을 확인한 뒤 다시 시도하세요.'
    )
  }
  if (data.success === false) {
    throw new Error(data.message || '저장에 실패했습니다.')
  }
  return data as { success: boolean; message?: string }
}
