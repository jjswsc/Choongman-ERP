import { describe, expect, it } from 'vitest'
import { scopeEmployeesForSaasLogin } from './login-check-employee-scope'

describe('scopeEmployeesForSaasLogin', () => {
  const abc = { name: 'Supakorn', company: 'ABC Company', tenant_id: 'abc-company' }
  const emptyCompany = { name: 'Supakorn', company: '', tenant_id: 'abc-company' }
  const otherTenant = { name: 'Supakorn', company: 'Other', tenant_id: 'other-co' }
  const noTenantCompanyMatch = { name: 'Supakorn', company: 'ABC Company', tenant_id: null }

  it('Omni: tenant_id 가 같으면 company 가 비어도 통과', () => {
    const scoped = scopeEmployeesForSaasLogin([emptyCompany, otherTenant], {
      companyInput: 'ABC Company',
      tenantId: 'abc-company',
    })
    expect(scoped).toEqual([emptyCompany])
  })

  it('Omni: 같은 테넌트 행을 company 불일치보다 우선', () => {
    const scoped = scopeEmployeesForSaasLogin([emptyCompany, abc, otherTenant], {
      companyInput: 'ABC Company',
      tenantId: 'abc-company',
    })
    expect(scoped).toEqual([emptyCompany, abc])
  })

  it('다른 테넌트 동명이인으로는 폴백하지 않는다', () => {
    const scoped = scopeEmployeesForSaasLogin([otherTenant], {
      companyInput: 'ABC Company',
      tenantId: 'abc-company',
    })
    expect(scoped).toEqual([])
  })

  it('tenant_id 컬럼이 없으면 company 문자열로 좁힌다', () => {
    const scoped = scopeEmployeesForSaasLogin([noTenantCompanyMatch, otherTenant], {
      companyInput: 'ABC Company',
      tenantId: 'abc-company',
    })
    expect(scoped).toEqual([noTenantCompanyMatch])
  })

  it('테넌트 없이 회사명만 있으면 company 매칭', () => {
    const scoped = scopeEmployeesForSaasLogin([abc, otherTenant], {
      companyInput: 'ABC Company',
    })
    expect(scoped).toEqual([abc])
  })

  it('회사·테넌트 없으면 입력 행 유지(충만)', () => {
    const scoped = scopeEmployeesForSaasLogin([abc, otherTenant], { companyInput: '' })
    expect(scoped).toEqual([abc, otherTenant])
  })
})
