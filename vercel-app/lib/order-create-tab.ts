/**
 * URL ?tab= 값을 order-create 탭 값으로 정규화합니다.
 * 매니저는 hq/history 요청을 store로 되돌립니다.
 */
export function resolveOrderCreateTabFromQuery(
  tabParam: string | null | undefined,
  isManager: boolean
): string {
  const raw = (tabParam || "").trim().toLowerCase().replace(/_/g, "-")
  const toHq = new Set(["hq", "po", "purchase", "purchase-order"])
  const toHistory = new Set(["history", "pohistory", "po-history"])
  const toStoreHist = new Set(["storehist", "store-history", "store-hist", "storeorderhist"])

  let t = "store"
  if (toHq.has(raw)) t = "hq"
  else if (toHistory.has(raw)) t = "history"
  else if (toStoreHist.has(raw)) t = "storeHist"

  if (isManager && (t === "hq" || t === "history")) t = "store"
  return t
}
