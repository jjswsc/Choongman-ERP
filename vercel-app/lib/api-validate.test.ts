import { describe, it, expect } from 'vitest'
import {
  parseOr400,
  loginSchema,
  changePasswordSchema,
  savePayrollSchema,
  submitAttendanceSchema,
  processOrderSchema,
  requestLeaveSchema,
  monthParamSchema,
} from './api-validate'

describe('api-validate', () => {
  describe('loginSchema', () => {
    it('유효한 입력 통과', () => {
      const r = parseOr400(loginSchema, {
        store: 'Store1',
        name: '홍길동',
        pw: '1234',
      })
      expect(r.errorResponse).toBeNull()
      expect(r.parsed?.store).toBe('Store1')
      expect(r.parsed?.name).toBe('홍길동')
      expect(r.parsed?.pw).toBe('1234')
    })

    it('store 누락 시 실패', () => {
      const r = parseOr400(loginSchema, { name: 'A', pw: '1' })
      expect(r.parsed).toBeNull()
      expect(r.errorResponse?.status).toBe(400)
    })

    it('pw 누락 시 실패', () => {
      const r = parseOr400(loginSchema, { store: 'S', name: 'N', pw: '' })
      expect(r.parsed).toBeNull()
    })
  })

  describe('changePasswordSchema', () => {
    it('유효한 입력 통과', () => {
      const r = parseOr400(changePasswordSchema, {
        store: 'S',
        name: 'N',
        oldPw: 'old',
        newPw: 'new123',
      })
      expect(r.errorResponse).toBeNull()
    })

    it('newPw 100자 초과 시 실패', () => {
      const r = parseOr400(changePasswordSchema, {
        store: 'S',
        name: 'N',
        oldPw: 'old',
        newPw: 'a'.repeat(101),
      })
      expect(r.parsed).toBeNull()
    })
  })

  describe('savePayrollSchema', () => {
    it('유효한 month, list 통과', () => {
      const r = parseOr400(savePayrollSchema, {
        month: '2025-02',
        list: [{ store: 'S', name: 'N', salary: 1000 }],
      })
      expect(r.errorResponse).toBeNull()
    })

    it('monthStr로도 통과', () => {
      const r = parseOr400(savePayrollSchema, {
        monthStr: '2025-03',
        list: [{ store: 'S', name: 'N' }],
      })
      expect(r.errorResponse).toBeNull()
    })

    it('잘못된 월 형식 실패', () => {
      const r = parseOr400(savePayrollSchema, {
        month: '2025-2', // yyyy-M 형식 (잘못됨)
        list: [{ store: 'S', name: 'N' }],
      })
      expect(r.parsed).toBeNull()
    })

    it('빈 list 실패', () => {
      const r = parseOr400(savePayrollSchema, { month: '2025-02', list: [] })
      expect(r.parsed).toBeNull()
    })
  })

  describe('submitAttendanceSchema', () => {
    it('유효한 출근 통과', () => {
      const r = parseOr400(submitAttendanceSchema, {
        storeName: 'Store1',
        name: '김철수',
        type: '출근',
        lat: 13.7,
        lng: 100.5,
      })
      expect(r.errorResponse).toBeNull()
    })

    it('잘못된 type 실패', () => {
      const r = parseOr400(submitAttendanceSchema, {
        storeName: 'S',
        name: 'N',
        type: 'invalid',
      })
      expect(r.parsed).toBeNull()
    })
  })

  describe('processOrderSchema', () => {
    it('유효한 주문 통과', () => {
      const r = parseOr400(processOrderSchema, {
        storeName: 'Store1',
        userName: 'User1',
        cart: [{ name: 'Item', price: 100, qty: 2 }],
      })
      expect(r.errorResponse).toBeNull()
    })

    it('빈 cart 실패', () => {
      const r = parseOr400(processOrderSchema, {
        storeName: 'S',
        userName: 'U',
        cart: [],
      })
      expect(r.parsed).toBeNull()
    })
  })

  describe('requestLeaveSchema', () => {
    it('유효한 휴가 신청 통과', () => {
      const r = parseOr400(requestLeaveSchema, {
        store: 'S',
        name: 'N',
        type: '연차',
        date: '2025-03-15',
      })
      expect(r.errorResponse).toBeNull()
    })

    it('잘못된 날짜 형식 실패', () => {
      const r = parseOr400(requestLeaveSchema, {
        store: 'S',
        name: 'N',
        type: '연차',
        date: '2025/03/15',
      })
      expect(r.parsed).toBeNull()
    })
  })

  describe('monthParamSchema', () => {
    it('yyyy-MM 형식 통과', () => {
      const r = monthParamSchema.safeParse('2025-12')
      expect(r.success).toBe(true)
    })

    it('잘못된 형식 실패', () => {
      const r = monthParamSchema.safeParse('2025-1')
      expect(r.success).toBe(false)
    })
  })
})
