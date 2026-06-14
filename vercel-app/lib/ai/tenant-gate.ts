import "server-only"

import type { JwtPayload } from "@/lib/jwt-auth"
import { isSaasModuleEnabledForAuth, requireSaasModuleForAuth } from "@/lib/saas/tenant-module-gate"
import { AiRouteError } from "@/lib/ai/errors"

/** SaaS 테넌트 ai_center 모듈 · feature override. tenantId 없으면(레거시) 허용 */
export async function isAiCenterModuleEnabledForAuth(auth: JwtPayload): Promise<boolean> {
  return isSaasModuleEnabledForAuth(auth, "ai_center")
}

export async function requireAiCenterModule(auth: JwtPayload): Promise<void> {
  try {
    await requireSaasModuleForAuth(auth, "ai_center")
  } catch {
    throw new AiRouteError(
      "AI_FORBIDDEN",
      "AI 센터 모듈이 이 고객사 계약에 포함되어 있지 않습니다. SaaS 관리자에게 문의하세요.",
      403
    )
  }
}
