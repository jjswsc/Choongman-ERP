import { describe, expect, it } from "vitest"
import {
  campaignDesignTouchesRange,
  marketingCampaignEffectiveBounds,
  marketingCampaignHasDefinedPeriod,
  marketingCampaignTouchesClosedDateRange,
  parsePhasePeriodsFromUnknown,
} from "@/lib/marketing-campaign-periods"

function calcCampaignRoiPercent(params: { attributedSales: number; spend: number }): number {
  const sales = Number(params.attributedSales || 0)
  const spend = Number(params.spend || 0)
  if (spend <= 0) return 0
  return ((sales - spend) / spend) * 100
}

describe("Marketing flow harness - 캠페인 중심 관리", () => {
  it("phase_periods(JSON) 파싱 시 snake/camel 입력 모두 허용", () => {
    const periods = parsePhasePeriodsFromUnknown([
      { phase_label: "티징", start_date: "2026-06-01", end_date: "2026-06-07" },
      { label: "본행사", startDate: "2026-06-08", endDate: "2026-06-20" },
    ])

    expect(periods).toHaveLength(2)
    expect(periods[0]?.label).toBe("티징")
    expect(periods[1]?.label).toBe("본행사")
  })

  it("캠페인 기간이 메인 기간이 없어도 차수 기간으로 리포트 조회에 포함된다", () => {
    const c = {
      startDate: null,
      endDate: null,
      phasePeriods: parsePhasePeriodsFromUnknown([
        { label: "1차", startDate: "2026-06-10", endDate: "2026-06-15" },
      ]),
    }
    expect(marketingCampaignHasDefinedPeriod(c)).toBe(true)
    expect(marketingCampaignTouchesClosedDateRange(c, "2026-06-01", "2026-06-30")).toBe(true)
    expect(marketingCampaignTouchesClosedDateRange(c, "2026-07-01", "2026-07-31")).toBe(false)
  })

  it("전체 유효 기간(min start ~ max end) 산출이 정확하다", () => {
    const bounds = marketingCampaignEffectiveBounds({
      startDate: "2026-05-25",
      endDate: "2026-06-30",
      phasePeriods: parsePhasePeriodsFromUnknown([
        { label: "티징", startDate: "2026-05-20", endDate: "2026-05-24" },
        { label: "리마케팅", startDate: "2026-07-01", endDate: "2026-07-10" },
      ]),
    })
    expect(bounds.startDate).toBe("2026-05-20")
    expect(bounds.endDate).toBe("2026-07-10")
  })

  it("디자인 일정도 별도 구간으로 조회 범위와 교차 판정된다", () => {
    const c = { designStartDate: "2026-06-03", designEndDate: "2026-06-08" }
    expect(campaignDesignTouchesRange(c, "2026-06-01", "2026-06-05")).toBe(true)
    expect(campaignDesignTouchesRange(c, "2026-06-09", "2026-06-10")).toBe(false)
  })

  it("캠페인 성과는 비용 대비 ROI로 추적 가능하다", () => {
    const roi = calcCampaignRoiPercent({ attributedSales: 42000, spend: 12000 })
    const roiNoSpend = calcCampaignRoiPercent({ attributedSales: 42000, spend: 0 })

    expect(roi).toBe(250)
    expect(roiNoSpend).toBe(0)
  })
})
