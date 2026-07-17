import { describe, expect, it } from 'vitest'
import {
  buildMemberSearchPostgrestAndFilter,
  buildMemberSearchPostgrestOrFilter,
  countFilledMemberSearchFields,
  emptyMemberSearchFieldDraft,
  hasMemberSearchFields,
  listFilledMemberSearchFields,
} from '@/lib/member-search-filter'

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
    expect(filter).not.toContain('id.eq.0988583544')
  })

  it('adds id.eq for short numeric member id queries', () => {
    const filter = buildMemberSearchPostgrestOrFilter('42891')
    expect(filter).toContain('id.eq.42891')
  })
})

describe('buildMemberSearchPostgrestAndFilter', () => {
  it('joins filled fields with AND (&)', () => {
    const filter = buildMemberSearchPostgrestAndFilter({
      ...emptyMemberSearchFieldDraft,
      name: 'Kim',
      phone: '0988583544',
      memberNo: 'M007359',
    })
    expect(filter).toContain('name.ilike.')
    expect(filter).toContain('phone.eq.0988583544')
    expect(filter).toContain('member_no.ilike.')
    expect(filter.split('&').length).toBeGreaterThanOrEqual(3)
  })

  it('uses birth_date eq for birth field only', () => {
    const filter = buildMemberSearchPostgrestAndFilter({
      ...emptyMemberSearchFieldDraft,
      birthDate: '1990-05-15',
    })
    expect(filter).toBe('birth_date.eq.1990-05-15')
  })

  it('filters created_at by join date range', () => {
    const filter = buildMemberSearchPostgrestAndFilter({
      ...emptyMemberSearchFieldDraft,
      joinFrom: '2026-01-01',
      joinTo: '2026-01-31',
    })
    expect(filter).toContain('created_at=gte.2026-01-01T00%3A00%3A00')
    expect(filter).toContain('created_at=lte.2026-01-31T23%3A59%3A59')
  })

  it('returns empty when all fields blank', () => {
    expect(buildMemberSearchPostgrestAndFilter({ ...emptyMemberSearchFieldDraft })).toBe('')
    expect(hasMemberSearchFields({ ...emptyMemberSearchFieldDraft })).toBe(false)
  })

  it('lists all filled keys for chips', () => {
    const fields = {
      ...emptyMemberSearchFieldDraft,
      name: 'Jane',
      phone: '01',
      email: 'j@example.com',
      joinFrom: '2026-07-01',
    }
    expect(listFilledMemberSearchFields(fields)).toEqual(['name', 'phone', 'email', 'joinFrom'])
    expect(countFilledMemberSearchFields(fields)).toBe(4)
  })
})
