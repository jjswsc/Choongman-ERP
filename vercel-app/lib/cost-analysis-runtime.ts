import { getAdminItems, getSauces } from '@/lib/api-client'
import { setRuntimeApiItems, setRuntimeSauces } from '@/lib/cost-data'

/** 원가분석 화면 공통 — 품목·배합 런타임 맵 동기화 */
export async function syncCostAnalysisRuntime(mode: 'calculator' | 'full' = 'calculator') {
  const [items, sauces] = await Promise.all([
    getAdminItems().catch(() => []),
    getSauces().catch(() => []),
  ])
  setRuntimeApiItems(Array.isArray(items) ? items : [])
  setRuntimeSauces(Array.isArray(sauces) ? sauces : [], { mode })
  return { items: Array.isArray(items) ? items : [], sauces: Array.isArray(sauces) ? sauces : [] }
}
