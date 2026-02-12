"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, Clock, CalendarDays, UserCheck, Timer } from "lucide-react"

export function TimesheetTab() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">매장</span>
        <Select defaultValue="all">
          <SelectTrigger className="h-9 flex-1 text-sm">
            <SelectValue placeholder="전체 매장" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 매장</SelectItem>
            <SelectItem value="gangnam">강남점</SelectItem>
            <SelectItem value="hongdae">홍대점</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9 px-4 font-medium">
          <Search className="mr-1.5 h-3.5 w-3.5" />
          검색
        </Button>
      </div>

      {/* Daily Real-time Work */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Timer className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">당일 실시간 근무</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2">
              <span className="text-xs text-muted-foreground">날짜</span>
              <Input type="date" defaultValue="2026-02-12" className="h-9 flex-1 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">구역</span>
              <Select defaultValue="all">
                <SelectTrigger className="h-9 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="hall">홀</SelectItem>
                  <SelectItem value="kitchen">주방</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9 font-medium">
              <Search className="mr-1 h-3.5 w-3.5" />
              검색
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-foreground">김직원</span>
              </div>
              <span className="text-xs text-muted-foreground">09:00 ~ 근무중</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-foreground">이매니저</span>
              </div>
              <span className="text-xs text-muted-foreground">08:30 ~ 근무중</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-border" />
                <span className="text-sm font-medium text-muted-foreground">박알바</span>
              </div>
              <span className="text-xs text-muted-foreground">미출근</span>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground">오늘 출퇴근 현황</p>
        </CardContent>
      </Card>

      {/* Weekly Timesheet */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">주간 시간표</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">검색 버튼을 눌러 조회하세요</p>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2">
              <span className="text-xs text-muted-foreground">기간</span>
              <Input type="date" defaultValue="2026-02-09" className="h-9 flex-1 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">구역</span>
              <Select defaultValue="all">
                <SelectTrigger className="h-9 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="hall">홀</SelectItem>
                  <SelectItem value="kitchen">주방</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9 font-medium">
              <Search className="mr-1 h-3.5 w-3.5" />
              검색
            </Button>
          </div>
          <div className="rounded-lg border border-dashed border-border py-8 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">검색 버튼을 눌러 조회하세요</p>
          </div>
        </CardContent>
      </Card>

      {/* My Attendance */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <UserCheck className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">내 출퇴근 기록</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Select defaultValue="2026-02">
              <SelectTrigger className="h-9 flex-1 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2026-02">2026-02</SelectItem>
                <SelectItem value="2026-01">2026-01</SelectItem>
                <SelectItem value="2025-12">2025-12</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-9 font-medium">
              <Search className="mr-1.5 h-3.5 w-3.5" />
              검색
            </Button>
          </div>
          <div className="rounded-lg border border-dashed border-border py-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">이번 주 기록</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
