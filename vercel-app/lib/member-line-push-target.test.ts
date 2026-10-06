import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseSelectFilterMock = vi.fn()
const setLineIdentityStatusMock = vi.fn()
const getLineUserProfileMock = vi.fn()
const pushLineMessagesMock = vi.fn()

vi.mock('@/lib/supabase-server', () => ({
  supabaseSelectFilter: (...args: unknown[]) => supabaseSelectFilterMock(...args),
}))

vi.mock('@/lib/members-server-core', () => ({
  setLineIdentityStatus: (...args: unknown[]) => setLineIdentityStatusMock(...args),
}))

vi.mock('@/lib/line-messaging-server', () => ({
  getLineUserProfile: (...args: unknown[]) => getLineUserProfileMock(...args),
  pushLineMessages: (...args: unknown[]) => pushLineMessagesMock(...args),
}))

import {
  isLineUserUnreachablePush,
  pushLineMessagesToMember,
  resolvePreferredMemberLineUserId,
} from '@/lib/member-line-push-target'

const newer = {
  id: 20,
  provider_user_id: 'U-new-f245',
  status: 'active',
  last_seen_at: '2026-10-06 10:00:00',
}
const older = {
  id: 11,
  provider_user_id: 'U-old-b3e8',
  status: 'active',
  last_seen_at: '2026-01-01 00:00:00',
}

function profileByUser(userId: string) {
  if (String(userId).endsWith('b3e8')) {
    throw new Error('LINE profile 조회 실패(404): not found')
  }
  if (String(userId).endsWith('fail500')) {
    throw new Error('LINE profile 조회 실패(500): upstream')
  }
  return { displayName: 'Jayle', pictureUrl: '' }
}

describe('pushLineMessagesToMember', () => {
  beforeEach(() => {
    supabaseSelectFilterMock.mockReset()
    setLineIdentityStatusMock.mockReset()
    getLineUserProfileMock.mockReset()
    pushLineMessagesMock.mockReset()
    setLineIdentityStatusMock.mockResolvedValue(undefined)
    getLineUserProfileMock.mockImplementation(async (userId: string) => profileByUser(userId))
    pushLineMessagesMock.mockResolvedValue({ ok: true })
    supabaseSelectFilterMock.mockResolvedValue([older, newer])
  })

  it('checks Get profile before sending even when only one LINE id is active', async () => {
    supabaseSelectFilterMock.mockResolvedValue([newer])

    const result = await pushLineMessagesToMember({
      memberId: 7359,
      messages: [{ type: 'text', text: 'hi' }],
    })

    expect(getLineUserProfileMock).toHaveBeenCalledTimes(1)
    expect(getLineUserProfileMock).toHaveBeenCalledWith('U-new-f245')
    expect(pushLineMessagesMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, userId: 'U-new-f245' })
  })

  it('does not push when the only LINE id profile is not 200', async () => {
    supabaseSelectFilterMock.mockResolvedValue([older])

    const result = await pushLineMessagesToMember({
      memberId: 7359,
      messages: [{ type: 'text', text: 'hi' }],
    })

    expect(getLineUserProfileMock).toHaveBeenCalledWith('U-old-b3e8')
    expect(pushLineMessagesMock).not.toHaveBeenCalled()
    expect(setLineIdentityStatusMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, message: 'line_profile_not_reachable' })
  })

  it('sends to the newest id when its profile exists and leaves the other id active', async () => {
    const result = await pushLineMessagesToMember({
      memberId: 7359,
      messages: [{ type: 'text', text: 'hi' }],
    })

    expect(getLineUserProfileMock).toHaveBeenCalledTimes(1)
    expect(getLineUserProfileMock).toHaveBeenCalledWith('U-new-f245')
    expect(setLineIdentityStatusMock).not.toHaveBeenCalled()
    expect(pushLineMessagesMock.mock.calls[0]?.[0]?.userId).toBe('U-new-f245')
    expect(result).toEqual({ ok: true, userId: 'U-new-f245' })
  })

  it('deactivates a 404 id and sends to the next profile that exists', async () => {
    supabaseSelectFilterMock.mockResolvedValue([
      { ...older, last_seen_at: '2026-10-06 12:00:00' },
      { ...newer, last_seen_at: '2026-10-01 00:00:00' },
    ])

    const result = await pushLineMessagesToMember({
      memberId: 7359,
      messages: [{ type: 'text', text: 'hi' }],
    })

    expect(setLineIdentityStatusMock).toHaveBeenCalledWith('U-old-b3e8', 'inactive')
    expect(pushLineMessagesMock).toHaveBeenCalledTimes(1)
    expect(pushLineMessagesMock.mock.calls[0]?.[0]?.userId).toBe('U-new-f245')
    expect(result.userId).toBe('U-new-f245')
  })

  it('on push 400 tries the next id and deactivates only the failed one', async () => {
    getLineUserProfileMock.mockResolvedValue({ displayName: 'Jayle', pictureUrl: '' })
    pushLineMessagesMock
      .mockResolvedValueOnce({
        ok: false,
        message: 'line_push_400:{"message":"Failed to send messages"}',
      })
      .mockResolvedValueOnce({ ok: true })

    const result = await pushLineMessagesToMember({
      memberId: 7359,
      messages: [{ type: 'text', text: 'hi' }],
    })

    expect(setLineIdentityStatusMock).toHaveBeenCalledTimes(1)
    expect(setLineIdentityStatusMock).toHaveBeenCalledWith('U-new-f245', 'inactive')
    expect(pushLineMessagesMock.mock.calls.map((call) => call[0]?.userId)).toEqual([
      'U-new-f245',
      'U-old-b3e8',
    ])
    expect(result).toEqual({ ok: true, userId: 'U-old-b3e8' })
  })

  it('does not deactivate the last id when every push returns 400', async () => {
    getLineUserProfileMock.mockResolvedValue({ displayName: 'Jayle', pictureUrl: '' })
    pushLineMessagesMock.mockResolvedValue({
      ok: false,
      message: 'line_push_400:{"message":"Failed to send messages"}',
    })

    const result = await pushLineMessagesToMember({
      memberId: 7359,
      messages: [{ type: 'text', text: 'hi' }],
    })

    expect(setLineIdentityStatusMock).toHaveBeenCalledTimes(1)
    expect(setLineIdentityStatusMock).toHaveBeenCalledWith('U-new-f245', 'inactive')
    expect(pushLineMessagesMock).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(false)
    expect(result.userId).toBe('U-old-b3e8')
  })

  it('does not walk other ids when the 400 is a payload error', async () => {
    pushLineMessagesMock.mockResolvedValue({
      ok: false,
      message: 'line_push_400:{"message":"The request body has 1 error(s)"}',
    })

    const result = await pushLineMessagesToMember({
      memberId: 7359,
      messages: [{ type: 'flex', altText: 'card', contents: { type: 'bubble' } }],
    })

    expect(setLineIdentityStatusMock).not.toHaveBeenCalled()
    expect(pushLineMessagesMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
  })

  it('does not push when every profile probe is not 200', async () => {
    supabaseSelectFilterMock.mockResolvedValue([
      { ...newer, provider_user_id: 'U-new-fail500' },
      { ...older, provider_user_id: 'U-old-fail500' },
    ])

    const result = await pushLineMessagesToMember({
      memberId: 7359,
      messages: [{ type: 'text', text: 'hi' }],
    })

    expect(pushLineMessagesMock).not.toHaveBeenCalled()
    expect(setLineIdentityStatusMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, message: 'line_profile_not_reachable' })
  })
})

describe('resolvePreferredMemberLineUserId', () => {
  beforeEach(() => {
    supabaseSelectFilterMock.mockReset()
    getLineUserProfileMock.mockReset()
  })

  it('returns the newest active id without calling LINE', async () => {
    supabaseSelectFilterMock.mockResolvedValue([older, newer])
    await expect(resolvePreferredMemberLineUserId(7359)).resolves.toBe('U-new-f245')
    expect(getLineUserProfileMock).not.toHaveBeenCalled()
  })
})

describe('isLineUserUnreachablePush', () => {
  it('matches LINE user send failures only', () => {
    expect(isLineUserUnreachablePush('line_push_400:{"message":"Failed to send messages"}')).toBe(true)
    expect(isLineUserUnreachablePush('line_push_400:{"message":"The request body has 1 error(s)"}')).toBe(
      false
    )
    expect(isLineUserUnreachablePush('line_push_500:{"message":"Failed to send messages"}')).toBe(false)
  })
})
