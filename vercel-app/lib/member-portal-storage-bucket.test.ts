import { describe, expect, it } from 'vitest'
import { getMemberPortalContentStorageBucket } from '@/lib/member-portal-storage-bucket'

describe('member-portal-storage-bucket', () => {
  it('defaults to membership bucket', () => {
    const prev = process.env.MEMBER_PORTAL_CONTENT_BUCKET
    delete process.env.MEMBER_PORTAL_CONTENT_BUCKET
    expect(getMemberPortalContentStorageBucket()).toBe('member-portal-content')
    if (prev) process.env.MEMBER_PORTAL_CONTENT_BUCKET = prev
  })
})
