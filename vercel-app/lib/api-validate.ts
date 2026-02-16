/**
 * API 입력 검증 (Zod)
 * 각 라우트에서 스키마 정의 후 parseOr400으로 검증
 */
import { z } from 'zod'
import { NextResponse } from 'next/server'

/** 400 에러 응답 헬퍼 */
export function badRequest(
  message: string,
  details?: Record<string, string[]>,
  headers?: Headers
): NextResponse {
  const res = NextResponse.json(
    { success: false, message, msg: message, ...(details ? { details } : {}) },
    { status: 400 }
  )
  if (headers) {
    headers.forEach((v, k) => res.headers.set(k, v))
  }
  return res
}

/**
 * Zod 스키마로 파싱, 실패 시 400 반환
 * @returns { parsed, errorResponse } - 성공 시 parsed, 실패 시 errorResponse
 */
export function parseOr400<T>(
  schema: z.ZodType<T>,
  data: unknown,
  headers?: Headers
): { parsed: T; errorResponse: null } | { parsed: null; errorResponse: NextResponse } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { parsed: result.data, errorResponse: null }
  }
  const issues = result.error.flatten()
  const details = issues.fieldErrors as Record<string, string[]>
  const msg = Object.values(details).flat().join(' ') || '입력값이 올바르지 않습니다.'
  return {
    parsed: null,
    errorResponse: badRequest(msg, details, headers),
  }
}

// ─── 공통 스키마 ───

/** store, name (필수) */
export const loginSchema = z.object({
  store: z.string().trim().min(1, '매장을 선택해 주세요.'),
  name: z.string().trim().min(1, '이름을 선택해 주세요.'),
  pw: z.string().min(1, '비밀번호를 입력해 주세요.'),
  isAdminPage: z.boolean().optional().default(true),
})

export type LoginInput = z.infer<typeof loginSchema>

/** 비밀번호 변경 */
export const changePasswordSchema = z.object({
  store: z.string().trim().min(1, '매장이 필요합니다.'),
  name: z.string().trim().min(1, '이름이 필요합니다.'),
  oldPw: z.string().min(1, '현재 비밀번호를 입력해 주세요.'),
  newPw: z.string().min(1, '새 비밀번호를 입력해 주세요.').max(100, '비밀번호는 100자 이하여야 합니다.'),
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/** 급여 저장 (월, 목록) - month 또는 monthStr 허용 */
export const savePayrollSchema = z.object({
  month: z.string().trim().optional(),
  monthStr: z.string().trim().optional(),
  list: z.array(z.record(z.string(), z.unknown())).min(1, '저장할 데이터가 없습니다.'),
  userStore: z.string().optional(),
  userRole: z.string().optional(),
}).refine((d) => {
  const m = (d.month || d.monthStr || '').slice(0, 7)
  return /^\d{4}-\d{2}$/.test(m)
}, { message: '귀속월(yyyy-MM)을 선택해 주세요.' })

/** 월 조회 (yyyy-MM) */
export const monthParamSchema = z.string().trim().regex(/^\d{4}-\d{2}$/, '월(yyyy-MM) 형식이어야 합니다.')

/** 출근/퇴근/휴식 제출 */
export const submitAttendanceSchema = z.object({
  storeName: z.string().trim().min(1, '매장이 필요합니다.'),
  name: z.string().trim().min(1, '이름이 필요합니다.'),
  type: z.string().trim().min(1, '유형(출근/퇴근/휴식시작/휴식종료)이 필요합니다.'),
  lat: z.union([z.string(), z.number()]).optional(),
  lng: z.union([z.string(), z.number()]).optional(),
}).refine((d) => ['출근', '퇴근', '휴식시작', '휴식종료'].includes(d.type), {
  message: '유형은 출근, 퇴근, 휴식시작, 휴식종료 중 하나여야 합니다.',
  path: ['type'],
})

/** 주문 생성 */
export const processOrderSchema = z.object({
  storeName: z.string().trim().min(1, '매장이 필요합니다.'),
  userName: z.string().trim().min(1, '사용자가 필요합니다.'),
  cart: z.array(z.object({
    code: z.string().optional(),
    name: z.string(),
    price: z.number(),
    qty: z.number().min(1, '수량은 1 이상이어야 합니다.'),
  })).min(1, '장바구니가 비어 있습니다.'),
})

/** 휴가 신청 */
export const requestLeaveSchema = z.object({
  store: z.string().trim().min(1, '매장이 필요합니다.'),
  name: z.string().trim().min(1, '이름이 필요합니다.'),
  type: z.string().trim().min(1, '휴가 유형을 선택해 주세요.'),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜(yyyy-MM-dd) 형식이어야 합니다.'),
  reason: z.string().optional(),
})
