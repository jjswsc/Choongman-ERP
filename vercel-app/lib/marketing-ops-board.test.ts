import { describe, expect, it } from "vitest"
import type { MarketingCampaign } from "@/lib/api-client/marketing-campaigns-core"
import type { MarketingInfluencer } from "@/lib/api-client/marketing-influencers"
import type { MarketingMaterial } from "@/lib/api-client/marketing-materials"
import {
  campaignTouchesToday,
  influencerTaskColumn,
  listPendingDeliveries,
  listDispatchLines,
  materialTaskColumn,
} from "@/lib/marketing-ops-board"

function campaign(partial: Partial<MarketingCampaign> & { id: string; topic: string }): MarketingCampaign {
  return {
    campaignNo: "MKT-1",
    format: "",
    status: "ongoing",
    branches: [],
    kpiTarget: 0,
    kpiUnit: "",
    budgetTotal: 0,
    ...partial,
  }
}

function material(partial: Partial<MarketingMaterial> & { id: string }): MarketingMaterial {
  return {
    campaignId: "1",
    type: "standee",
    name: "Summer standee",
    quantity: 1,
    unitCost: 0,
    actualCost: 0,
    branches: ["CM Asoke"],
    isHqWide: false,
    displayStartDate: "2026-09-01",
    displayEndDate: null,
    placementSpots: [],
    status: "producing",
    producedOn: null,
    note: "",
    ...partial,
  }
}

describe("marketing ops board", () => {
  it("treats ongoing or date-overlapping campaigns as today-active", () => {
    expect(
      campaignTouchesToday(campaign({ id: "1", topic: "A", status: "ongoing", startDate: null, endDate: null }), "2026-08-28")
    ).toBe(true)
    expect(
      campaignTouchesToday(
        campaign({ id: "1", topic: "A", status: "draft", startDate: "2026-09-01", endDate: "2026-09-30" }),
        "2026-08-28"
      )
    ).toBe(false)
    expect(
      campaignTouchesToday(
        campaign({ id: "1", topic: "A", status: "draft", startDate: "2026-08-01", endDate: "2026-08-31" }),
        "2026-08-28"
      )
    ).toBe(true)
  })

  it("lists stores that have not received or installed materials", () => {
    const rows = listPendingDeliveries({
      campaigns: [campaign({ id: "1", topic: "Rice promo" })],
      materials: [material({ id: "10", producedOn: "2026-08-20" })],
      checks: [],
      hqLabel: "HQ",
      today: "2026-08-28",
      inProgressOnly: true,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.pendingStores[0]?.store).toBe("CM Asoke")
    expect(rows[0]?.pendingStores[0]?.phase).toBe("receive")
  })

  it("explodes pending deliveries into store rows for the ops board", () => {
    const lines = listDispatchLines({
      campaigns: [campaign({ id: "1", topic: "Rice promo" })],
      materials: [
        material({
          id: "10",
          producedOn: "2026-08-20",
          branches: ["CM Asoke", "CM Thonglor"],
          quantity: 10,
        }),
      ],
      checks: [],
      hqLabel: "HQ",
      today: "2026-08-28",
      inProgressOnly: true,
    })
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.store).sort()).toEqual(["CM Asoke", "CM Thonglor"])
    expect(lines.find((l) => l.store === "CM Asoke")?.quantity).toBe(5)
    expect(lines.find((l) => l.store === "CM Thonglor")?.quantity).toBe(5)
    expect(lines[0]?.quantityEstimated).toBe(true)
    expect(lines[0]?.pendingStoreCount).toBe(2)
  })

  it("uses recorded per-store quantity when a check exists", () => {
    const lines = listDispatchLines({
      campaigns: [campaign({ id: "1", topic: "Rice promo" })],
      materials: [
        material({
          id: "10",
          producedOn: "2026-08-20",
          branches: ["CM Asoke", "CM Thonglor"],
          quantity: 10,
        }),
      ],
      checks: [
        {
          id: "c1",
          materialId: "10",
          campaignId: "1",
          storeName: "CM Asoke",
          receivedOn: null,
          receivedBy: "",
          installedOn: null,
          installedBy: "",
          installedPlacementSpot: null,
          installedPhotoUrl: "",
          note: "",
          quantity: 7,
          updatedAt: null,
        },
      ],
      hqLabel: "HQ",
      today: "2026-08-28",
      inProgressOnly: true,
    })
    expect(lines.find((l) => l.store === "CM Asoke")?.quantity).toBe(7)
    expect(lines.find((l) => l.store === "CM Asoke")?.quantityEstimated).toBe(false)
  })

  it("maps material/influencer statuses onto kanban columns", () => {
    expect(materialTaskColumn(material({ id: "10", producedOn: null }), [], "HQ")).toBe("todo")
    expect(
      influencerTaskColumn({ status: "ongoing" } as MarketingInfluencer)
    ).toBe("doing")
    expect(influencerTaskColumn({ status: "finish" } as MarketingInfluencer)).toBe("done")
  })
})
