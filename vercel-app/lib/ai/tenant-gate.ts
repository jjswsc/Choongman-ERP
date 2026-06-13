import 'server-only'

import type { JwtPayload } from '@/lib/jwt-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { DEFAULT_SAAS_MODULE_PRICES } from '@/lib/saas-module-pricing'
import { AiRouteError } from '@/lib/ai/errors'

/** SaaS 테넌트 ai_center 모듈 · feature override. tenantId 없으면(레거시) 허용 */
export async function isAiCenterModuleEnabledForAuth(auth: JwtPayload): Promise<boolean> {
  const tenantId = String(auth.tenantId || '').trim().toLowerCase()
  if (!tenantId) return true

  try {
    const [moduleRows, featureRows] = await Promise.all([
      supabaseSelectFilter(
        'tenant_module_pricing',
        `tenant_id=eq.${encodeURIComponent(tenantId)}&module_key=eq.ai_center`,
        { limit: 1, select: 'is_enabled' }
      ).catch(() => []),
      supabaseSelectFilter(
        'tenant_feature_overrides',
        `tenant_id=eq.${encodeURIComponent(tenantId)}&feature_key=eq.aiAssistant`,
        { limit: 1, select: 'is_enabled' }
      ).catch(() => []),
    ])

    const moduleRow = (moduleRows as { is_enabled?: boolean }[] | null)?.[0]
    const featureRow = (featureRows as { is_enabled?: boolean }[] | null)?.[0]

    if (featureRow && featureRow.is_enabled === true) return true
    if (featureRow && featureRow.is_enabled === false) return false
    if (moduleRow) return Boolean(moduleRow.is_enabled)
    return DEFAULT_SAAS_MODULE_PRICES.ai_center.isEnabled
  } catch {
    return DEFAULT_SAAS_MODULE_PRICES.ai_center.isEnabled
  }
}

export async function requireAiCenterModule(auth: JwtPayload): Promise<void> {
  const ok = await isAiCenterModuleEnabledForAuth(auth)
  if (!ok) {
    throw new AiRouteError(
      'AI_FORBIDDEN',
      'AI 센터 모듈이 이 고객사 계약에 포함되어 있지 않습니다. SaaS 관리자에게 문의하세요.',
      403
    )
  }
}
