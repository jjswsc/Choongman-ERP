import type { GrabJsonRequestOptions } from '@/lib/grab-openapi'
import { grabJsonRequest } from '@/lib/grab-openapi'
import { resolveGrabOAuthCredentials } from '@/lib/tenant-integration-resolve'
import type { IntegrationScope } from '@/lib/tenant-integration-types'

export async function grabJsonRequestScoped<T = unknown>(
  scope: IntegrationScope | undefined,
  opts: Omit<GrabJsonRequestOptions, 'credentials'>
): Promise<T | null> {
  const credentials = await resolveGrabOAuthCredentials(scope)
  return grabJsonRequest<T>({ ...opts, credentials })
}
