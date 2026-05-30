export type PosCostAnalysisRatioInput = {
  priceHall?: number | null
  priceDelivery?: number | null
  costHall?: number | null
  costDelivery?: number | null
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

export function posCostListRowCostsAndRatios(r: PosCostAnalysisRatioInput) {
  const priceH = Number(r.priceHall ?? 0)
  const priceD = Number(r.priceDelivery ?? r.priceHall ?? 0)
  const costH = roundOne(Number(r.costHall ?? 0))
  const costD = roundOne(Number(r.costDelivery ?? 0))
  return {
    priceH,
    priceD,
    costH,
    costD,
    costRatioH: priceH > 0 ? (costH / priceH) * 100 : 0,
    costRatioD: priceD > 0 ? (costD / priceD) * 100 : 0,
  }
}
