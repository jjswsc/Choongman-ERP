/** 인테리어 관리 플랫 라우트 (프로젝트는 ?projectId= 로 선택, 허브는 tab= ) */
export const INTERIOR_ADMIN = {
  hub: "/admin/interior",
  schedule: "/admin/interior/schedule",
  vendors: "/admin/interior/vendors",
  vendorDirectory: "/admin/interior/vendor-directory",
  /** 사양·자재 (자재 사양 | 사양서) */
  specs: "/admin/interior/specs",
  /** 도면·배치 (도면 배치 | 도면·견적 파일) */
  drawings: "/admin/interior/drawings",
  /** 견적·비용 (현장 비용 | 견적·문서) */
  costs: "/admin/interior/costs",
  kitchen: "/admin/interior/kitchen",
  /** 레거시 (리다이렉트용) */
  layoutItems: "/admin/interior/layout-items",
  materials: "/admin/interior/materials",
  specification: "/admin/interior/specification",
  estimates: "/admin/interior-estimates",
  expense: "/admin/interior-expense",
} as const

export type InteriorSpecsTab = "materials" | "spec"
export type InteriorDrawingsTab = "layout" | "files"
export type InteriorCostsTab = "expense" | "quotes"

/** projectId + 선택적 tab 쿼리 */
export function withInteriorProjectId(
  path: string,
  projectId: string | number | undefined | null,
  tab?: string
): string {
  const params = new URLSearchParams()
  if (projectId != null && String(projectId) !== "") {
    params.set("projectId", String(projectId))
  }
  if (tab) params.set("tab", tab)
  const q = params.toString()
  return q ? `${path}${path.includes("?") ? "&" : "?"}${q}` : path
}
