import { describe, expect, it } from 'vitest'
import { isMissingHrPolicyListColumnError } from '@/lib/hr-policies-select'

describe('isMissingHrPolicyListColumnError', () => {
  it('matches PostgREST missing optional HR policy columns', () => {
    expect(
      isMissingHrPolicyListColumnError(
        new Error('column hr_policies.target_permission_group does not exist')
      )
    ).toBe(true)
    expect(
      isMissingHrPolicyListColumnError(
        '{"code":"42703","message":"column hr_policies.content_version does not exist"}'
      )
    ).toBe(true)
  })

  it('does not treat tenant_id-only or unrelated errors as list-column gaps', () => {
    expect(
      isMissingHrPolicyListColumnError(
        '{"code":"42703","message":"column hr_policies.tenant_id does not exist"}'
      )
    ).toBe(false)
    expect(isMissingHrPolicyListColumnError(new Error('network timeout'))).toBe(false)
  })
})
