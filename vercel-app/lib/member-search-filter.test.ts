import { describe, expect, it } from 'vitest'
import {
  buildMemberSearchPostgrestAndFilter,
  buildMemberSearchPostgrestOrFilter,
  countFilledMemberSearchFields,
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
  })
})

describe('buildMemberSearchPostgrestAndFilter', () => {
  it('joins filled fields with AND (&)', () => {
    const filter = buildMemberSearchPostgrestAndFilter({
      name: 'Kim',
      phone: '0988583544',
      memberNo: 'M007359',
      email: '',
      birthDate: '',
    })
    expect(filter).toContain('name.ilike.')
    expect(filter).toContain('phone.eq.0988583544')
    expect(filter).toContain('member_no.ilike.')
    expect(filter.split('&').length).toBeGreaterThanOrEqual(3)
  })

  it('uses birth_date eq for birth field only', () => {
    const filter = buildMemberSearchPostgrestAndFilter({
      name: '',
      phone: '',
      memberNo: '',
      email: '',
      birthDate: '1990-05-15',
    })
    expect(filter).toBe('birth_date.eq.1990-05-15')
  })

  it('returns empty when all fields blank', () => {
    expect(
      buildMemberSearchPostgrestAndFilter({
        name: '',
        phone: '',
        memberNo: '',
        email: '',
        birthDate: '',
      })
    ).toBe('')
    expect(hasMemberSearchFields({
      name: '',
      phone: '',
      memberNo: '',
      email: '',
      birthDate: '',
    })).toBe(false)
  })

  it('lists all filled keys for chips', () => {
    const fields = {
      name: 'Jane',
      phone: '01',
      memberNo: '',
      email: 'j@example.com',
      birthDate: '',
    }
    expect(listFilledMemberSearchFields(fields)).toEqual(['name', 'phone', 'email'])
    expect(countFilledMemberSearchFields(fields)).toBe(3)
  })
})
