import { describe, expect, it } from 'vitest'
import { isMissingTenantIdColumnError } from '@/lib/missing-tenant-id-column-error'
import { isMissingSaasTenantColumnError } from '@/lib/saas-tenant-scope'
import { translateApiMessage } from '@/lib/translate-api-message'

describe('isMissingTenantIdColumnError', () => {
  it('matches tenant_id PostgREST / Postgres errors', () => {
    expect(
      isMissingTenantIdColumnError(
        new Error(`Could not find the 'tenant_id' column of 'employees' in the schema cache`)
      )
    ).toBe(true)
    expect(
      isMissingSaasTenantColumnError(
        'Supabase select failed: {"code":"42703","message":"column employees.tenant_id does not exist"}'
      )
    ).toBe(true)
    expect(isMissingTenantIdColumnError('PGRST204 tenant_id')).toBe(true)
  })

  it('does not treat other missing columns as tenant_id', () => {
    expect(
      isMissingSaasTenantColumnError(
        new Error(`Could not find the 'attendance_allowance' column of 'employees' in the schema cache`)
      )
    ).toBe(false)
    expect(
      isMissingTenantIdColumnError(
        'Supabase select failed: {"code":"PGRST204","message":"Could not find the \'name_title\' column"}'
      )
    ).toBe(false)
    expect(isMissingTenantIdColumnError('{"code":"42703","message":"column employees.nick does not exist"}')).toBe(
      false
    )
  })
})

describe('translateApiMessage tenant schema', () => {
  const dict: Record<string, string> = {
    saasTenantSchemaMissing: 'SCHEMA_MISSING',
    saasTenantIdMissing: 'TENANT_MISSING',
  }
  const t = (k: string) => dict[k] || k

  it('translates employee tenant_id schema alert', () => {
    expect(
      translateApiMessage('직원 tenant_id 스키마가 없습니다. Omni DB 마이그레이션 SQL을 실행해 주세요.', t)
    ).toBe('SCHEMA_MISSING')
  })

  it('translates SQL-filename variants', () => {
    expect(
      translateApiMessage(
        '메뉴 tenant_id 스키마가 없습니다. Omni DB에 sql/pos_catalog_tenant_id.sql 을 실행해 주세요.',
        t
      )
    ).toBe('SCHEMA_MISSING')
    expect(translateApiMessage('inventory tenant_id 스키마가 없습니다.', t)).toBe('SCHEMA_MISSING')
  })

  it('translates missing company tenant alerts', () => {
    expect(
      translateApiMessage('회사(테넌트) 정보가 없어 직원을 저장할 수 없습니다. 다시 로그인해 주세요.', t)
    ).toBe('TENANT_MISSING')
    expect(
      translateApiMessage('회사(테넌트) 정보가 없어 저장할 수 없습니다. 다시 로그인해 주세요.', t)
    ).toBe('TENANT_MISSING')
  })
})
