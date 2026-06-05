import { describe, expect, it } from 'vitest'
import { buildMemberSearchPostgrestOrFilter } from '@/lib/member-search-filter'

describe('buildMemberSearchPostgrestOrFilter', () => {
  it('does not use birth_date ilike (date column)', () => {
    const filter = buildMemberSearchPostgrestOrFilter('M007359')
    expect(filter).toContain('member_no.ilike.')
    expect(filter).not.toContain('birth_date.ilike')
  })

  it('uses birth_date eq for ISO date query', () => {
    const filter = buildMemberSearchPostgrestOrFilter('1990-05-15')
    expect(filter).toContain('birth_date.eq.1990-05-15')
    expect(filter).not.toContain('birth_date.ilike')
  })

  it('adds phone eq variants for Thai mobile numbers', () => {
    const filter = buildMemberSearchPostgrestOrFilter('0988583544')
    expect(filter).toContain('phone.eq.0988583544')
    expect(filter).toContain('phone.eq.66988583544')
  })
})
