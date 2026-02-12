"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Megaphone, CalendarCheck, UserCog, Send, Search } from "lucide-react"

export function AdminTab() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Send Notice */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">공지사항 발송</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notice-title" className="text-xs text-muted-foreground">제목</Label>
            <Input id="notice-title" placeholder="제목" className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notice-content" className="text-xs text-muted-foreground">내용</Label>
            <Textarea id="notice-content" placeholder="내용" className="min-h-[100px] resize-none" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">대상 매장</Label>
            <Select defaultValue="all">
              <SelectTrigger className="h-10">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="gangnam">강남점</SelectItem>
                <SelectItem value="hongdae">홍대점</SelectItem>
                <SelectItem value="sinchon">신촌점</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">대상</Label>
            <Select defaultValue="all">
              <SelectTrigger className="h-10">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="manager">매니저</SelectItem>
                <SelectItem value="staff">직원</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="mt-1 h-11 w-full font-semibold">
            <Send className="mr-2 h-4 w-4" />
            공지 발송하기
          </Button>
        </CardContent>
      </Card>

      {/* Leave Approval */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <CalendarCheck className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">연차 승인</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" defaultValue="2026-02-12" className="h-9 flex-1 text-xs" />
            <Input type="date" defaultValue="2026-02-12" className="h-9 flex-1 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Select defaultValue="all">
              <SelectTrigger className="h-9 flex-1 text-xs">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="gangnam">강남점</SelectItem>
                <SelectItem value="hongdae">홍대점</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="pending">
              <SelectTrigger className="h-9 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">대기</SelectItem>
                <SelectItem value="approved">승인</SelectItem>
                <SelectItem value="rejected">반려</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-10 w-full font-medium">
            <Search className="mr-1.5 h-3.5 w-3.5" />
            조회
          </Button>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">김직원</p>
                <p className="text-xs text-muted-foreground">2026-02-15 ~ 2026-02-16</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" className="h-7 px-3 text-xs font-medium">승인</Button>
                <Button variant="outline" size="sm" className="h-7 px-3 text-xs font-medium">반려</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Approval */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <UserCog className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">근태 승인</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input type="date" defaultValue="2026-02-12" className="h-9 flex-1 text-xs" />
            <Input type="date" defaultValue="2026-02-12" className="h-9 flex-1 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Select defaultValue="all">
              <SelectTrigger className="h-9 flex-1 text-xs">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="gangnam">강남점</SelectItem>
                <SelectItem value="hongdae">홍대점</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="pending">
              <SelectTrigger className="h-9 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">대기</SelectItem>
                <SelectItem value="approved">승인</SelectItem>
                <SelectItem value="rejected">반려</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-10 w-full font-medium">
            <Search className="mr-1.5 h-3.5 w-3.5" />
            조회
          </Button>
          <div className="rounded-lg border border-dashed border-border py-8 text-center">
            <UserCog className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">승인 대기 항목이 없습니다</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
