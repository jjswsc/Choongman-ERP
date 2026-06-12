export type ManagementMarginDataQualityLevel = 'good' | 'caution' | 'review'

export type ManagementMarginDataQuality = {
  level: ManagementMarginDataQualityLevel
  reasons: string[]
}

export function assessManagementMarginDataQuality(params: {
  posTruncated: boolean
  unmatchedLineQty: number
  matchedLineQty: number
  theoreticalVsActualCogsDiffPct: number | null
  warningCount: number
}): ManagementMarginDataQuality {
  const reasons: string[] = []
  let level: ManagementMarginDataQualityLevel = 'good'

  const totalLines = params.matchedLineQty + params.unmatchedLineQty
  const unmatchedPct =
    totalLines > 0 ? (params.unmatchedLineQty / totalLines) * 100 : 0

  if (params.posTruncated) {
    reasons.push('truncated')
    level = 'review'
  }
  if (params.unmatchedLineQty > 0 && unmatchedPct >= 10) {
    reasons.push('bom_unmatched_high')
    level = 'review'
  } else if (params.unmatchedLineQty > 0 && unmatchedPct >= 3) {
    reasons.push('bom_unmatched')
    if (level === 'good') level = 'caution'
  }
  const cogsGap = params.theoreticalVsActualCogsDiffPct
  if (cogsGap != null && Math.abs(cogsGap) >= 20) {
    reasons.push('cogs_gap_high')
    level = 'review'
  } else if (cogsGap != null && Math.abs(cogsGap) >= 10) {
    reasons.push('cogs_gap')
    if (level === 'good') level = 'caution'
  }
  if (params.warningCount >= 2 && level === 'good') level = 'caution'

  return { level, reasons }
}
