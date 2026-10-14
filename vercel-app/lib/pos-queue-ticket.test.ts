import { describe, expect, it } from 'vitest'
import {
  clampPosQueuePartySize,
  countPosQueueTeamsAhead,
  formatPosQueueNo,
  nextPosQueueTicketStatus,
  normalizePosQueueGuestPhone,
  posQueueTicketFromRow,
} from '@/lib/pos-queue-ticket'

describe('pos-queue-ticket', () => {
  it('대기·호출 중에만 호출·착석·취소·노쇼 가능, 종료된 번호는 되돌리기만', () => {
    expect(nextPosQueueTicketStatus('waiting', 'call')).toBe('called')
    expect(nextPosQueueTicketStatus('called', 'call')).toBe('called')
    expect(nextPosQueueTicketStatus('called', 'seat')).toBe('seated')
    expect(nextPosQueueTicketStatus('seated', 'call')).toBeNull()
    expect(nextPosQueueTicketStatus('waiting', 'restore')).toBeNull()
    expect(nextPosQueueTicketStatus('no_show', 'restore')).toBe('waiting')
  })

  it('앞 팀 수는 번호가 작고 아직 대기·호출 중인 팀만', () => {
    const tickets = [
      { queueNo: 1, status: 'seated' as const },
      { queueNo: 2, status: 'called' as const },
      { queueNo: 3, status: 'waiting' as const },
      { queueNo: 4, status: 'waiting' as const },
    ]
    expect(countPosQueueTeamsAhead(tickets, 4)).toBe(2)
    expect(countPosQueueTeamsAhead(tickets, 2)).toBe(0)
  })

  it('표시·입력 정규화', () => {
    expect(formatPosQueueNo(7)).toBe('007')
    expect(clampPosQueuePartySize(0)).toBe(1)
    expect(clampPosQueuePartySize(80)).toBe(50)
    expect(normalizePosQueueGuestPhone('+66 81-234-5678')).toBe('0812345678')
    expect(normalizePosQueueGuestPhone('081 234 5678')).toBe('0812345678')
  })

  it('DB 행 → 티켓', () => {
    const t = posQueueTicketFromRow({
      id: 5,
      store_code: 'CM Union Mall',
      business_ymd: '20261014',
      queue_no: 12,
      party_size: 4,
      status: 'called',
      member_id: null,
      guest_phone: '',
      public_token: 'tok',
      call_count: 1,
      created_at: '2026-10-14T05:00:00Z',
    })
    expect(t).toMatchObject({ id: 5, queueNo: 12, partySize: 4, status: 'called', memberId: null, guestPhone: null })
  })
})
