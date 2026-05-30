"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import { CrmSubnav } from "@/components/erp/crm-subnav"

import { apiFetch } from "@/lib/api/fetch"

type Summary = {
  totalMembers: number
  recentActiveMembers: number
  dormantMembers: number
  totalLifetimeAmount: number
  avgOrderAmount: number
}

async function loadSummary(): Promise<Summary> {
  const res = await apiFetch("/api/crm/summary", { cache: "no-store" })
  if (!res.ok) {
    return {
      totalMembers: 0,
      recentActiveMembers: 0,
      dormantMembers: 0,
      totalLifetimeAmount: 0,
      avgOrderAmount: 0,
    }
  }
  const data = (await res.json()) as { success: boolean; summary?: Summary }
  return data.summary || {
    totalMembers: 0,
    recentActiveMembers: 0,
    dormantMembers: 0,
    totalLifetimeAmount: 0,
    avgOrderAmount: 0,
  }
}

export default function CrmDashboardPage() {
  const [summary, setSummary] = React.useState<Summary>({
    totalMembers: 0,
    recentActiveMembers: 0,
    dormantMembers: 0,
    totalLifetimeAmount: 0,
    avgOrderAmount: 0,
  })

  const refresh = React.useCallback(async () => {
    setSummary(await loadSummary())
  }, [])

  React.useEffect(() => {
    refresh().catch(() => {})
  }, [refresh])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <CrmSubnav />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">CRM 대시보드</h1>
            <p className="text-sm text-muted-foreground">회원·세그먼트·캠페인 운영 기준 지표</p>
          </div>
          <Button variant="outline" onClick={refresh}>새로고침</Button>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card><CardHeader><CardTitle className="text-sm">총 회원</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.totalMembers.toLocaleString()}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">최근활동(30일)</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.recentActiveMembers.toLocaleString()}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">휴면(90일)</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.dormantMembers.toLocaleString()}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">누적매출 기여</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.totalLifetimeAmount.toLocaleString()}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">평균 객단가</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{summary.avgOrderAmount.toLocaleString()}</CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">빠른 작업</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href="/admin/crm/segments">세그먼트 추출</Link></Button>
            <Button asChild variant="outline"><Link href="/admin/crm/rfm">RFM 점수</Link></Button>
            <Button asChild variant="outline"><Link href="/admin/members/coupons">쿠폰 발행</Link></Button>
            <Button asChild variant="outline"><Link href="/admin/marketing/integrations">LINE 연동</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

