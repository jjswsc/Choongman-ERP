"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api/fetch"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type TenantOpt = { id: string; companyName: string }

type StoreRow = {
  id: number
  tenantId: string | null
  companyName: string
  label: string
  storeName: string
  storeCode: string
  isActive: boolean
  createdAt: string
  kind: "saas" | "legacy"
}

export default function SaasStoresPage() {
  const [tenantFilter, setTenantFilter] = useState<string>("")
  const [createTenantId, setCreateTenantId] = useState<string>("")
  const [createStoreName, setCreateStoreName] = useState("")
  const [createStoreCode, setCreateStoreCode] = useState("")
  const [qInput, setQInput] = useState("")
  const [qApplied, setQApplied] = useState("")
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<StoreRow[]>([])
  const [tenantOptions, setTenantOptions] = useState<TenantOpt[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [managerDialogOpen, setManagerDialogOpen] = useState(false)
  const [managerTenantId, setManagerTenantId] = useState("")
  const [managerCompanyName, setManagerCompanyName] = useState("")
  const [managerStoreName, setManagerStoreName] = useState("")
  const [managerName, setManagerName] = useState("manager")
  const [managerPassword, setManagerPassword] = useState("")
  const [managerPassword2, setManagerPassword2] = useState("")
  const [openLoginAfterCreate, setOpenLoginAfterCreate] = useState(true)

  const load = useCallback(
    async (opts: { nextOffset: number; append: boolean }) => {
      setLoading(true)
      setNotice("")
      try {
        const params = new URLSearchParams()
        if (tenantFilter) params.set("tenantId", tenantFilter)
        if (qApplied.trim()) params.set("q", qApplied.trim())
        params.set("offset", String(opts.nextOffset))
        params.set("limit", "200")
        const res = await apiFetch(`/api/saasAdminStores?${params.toString()}`)
        const json = (await res.json()) as {
          success?: boolean
          message?: string
          tenantOptions?: TenantOpt[]
          rows?: StoreRow[]
          pagination?: { hasMore?: boolean }
        }
        if (!res.ok || json.success !== true) {
          setNotice(json.message || "목록을 불러오지 못했습니다.")
          if (!opts.append) setRows([])
          return
        }
        if (Array.isArray(json.tenantOptions)) setTenantOptions(json.tenantOptions)
        const next = json.rows || []
        setRows((prev) => (opts.append ? [...prev, ...next] : next))
        setOffset(opts.nextOffset + next.length)
        setHasMore(Boolean(json.pagination?.hasMore))
      } catch (e) {
        setNotice(String(e))
        if (!opts.append) setRows([])
      } finally {
        setLoading(false)
      }
    },
    [tenantFilter, qApplied]
  )

  useEffect(() => {
    setOffset(0)
    void load({ nextOffset: 0, append: false })
  }, [tenantFilter, qApplied, load])

  useEffect(() => {
    if (tenantFilter) {
      setCreateTenantId(tenantFilter)
      return
    }
    setCreateTenantId((prev) => prev || tenantOptions[0]?.id || "")
  }, [tenantFilter, tenantOptions])

  const applySearch = () => {
    setQApplied(qInput.trim())
  }

  const loadMore = () => {
    if (!hasMore || loading) return
    void load({ nextOffset: offset, append: true })
  }

  const createStore = async () => {
    const tenantId = createTenantId.trim()
    const storeName = createStoreName.trim()
    const storeCode = createStoreCode.trim()
    if (!tenantId || !storeName) {
      await appAlert("고객사와 매장명을 입력해 주세요.")
      return
    }
    try {
      const res = await apiFetch("/api/saasAdminStores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          storeName,
          ...(storeCode ? { storeCode } : {}),
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string; companyName?: string; storeName?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || "매장 생성에 실패했습니다.")
        return
      }
      await appAlert(`[${json.companyName || tenantId}] ${json.storeName || storeName} 매장을 생성했습니다.`)
      setManagerTenantId(tenantId)
      setManagerCompanyName(json.companyName || "")
      setManagerStoreName(json.storeName || storeName)
      setManagerName("manager")
      setManagerPassword("")
      setManagerPassword2("")
      setOpenLoginAfterCreate(true)
      setManagerDialogOpen(true)
      setCreateStoreName("")
      setCreateStoreCode("")
      setTenantFilter(tenantId)
      setOffset(0)
      void load({ nextOffset: 0, append: false })
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const toggleStoreActive = async (row: StoreRow) => {
    if (row.kind !== "saas") {
      await appAlert("레거시 매장 행은 이 화면에서 상태 변경을 지원하지 않습니다.")
      return
    }
    const next = !row.isActive
    const ok = await appConfirm(
      `매장 [${row.label}] 상태를 ${next ? "사용" : "중지"}로 변경할까요?\n회사: ${row.companyName || "-"}`
    )
    if (!ok) return
    try {
      const res = await apiFetch("/api/saasAdminStores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          tenantId: row.tenantId,
          storeName: row.storeName,
          storeCode: row.storeCode,
          isActive: next,
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || "상태 변경에 실패했습니다.")
        return
      }
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, isActive: next } : x)))
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const createStoreManager = async () => {
    const tenantId = managerTenantId.trim()
    const storeName = managerStoreName.trim()
    const name = managerName.trim()
    const pw = managerPassword.trim()
    const pw2 = managerPassword2.trim()
    if (!tenantId || !storeName || !name || !pw) {
      await appAlert("매장 관리자 이름과 비밀번호를 입력해 주세요.")
      return
    }
    if (pw.length < 4) {
      await appAlert("비밀번호는 4자 이상 입력해 주세요.")
      return
    }
    if (pw !== pw2) {
      await appAlert("비밀번호 확인이 일치하지 않습니다.")
      return
    }
    try {
      const res = await apiFetch("/api/saasAdminEmployees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          storeName,
          name,
          password: pw,
          role: "Manager",
          job: "manager",
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string; companyName?: string; storeName?: string; name?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || "매장 관리자 생성에 실패했습니다.")
        return
      }
      await appAlert(
        `[${json.companyName || managerCompanyName || tenantId}] ${json.storeName || storeName} / ${json.name || name} 계정을 생성했습니다.`
      )
      if (openLoginAfterCreate) {
        const p = new URLSearchParams()
        p.set("redirect", "/admin")
        p.set("company", json.companyName || managerCompanyName || tenantId)
        p.set("store", json.storeName || storeName)
        p.set("user", json.name || name)
        const href = `/admin/login?${p.toString()}`
        if (typeof window !== "undefined") {
          window.open(href, "_blank", "noopener,noreferrer")
        }
      }
      setManagerDialogOpen(false)
    } catch (e) {
      await appAlert(String(e))
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">매장 관리</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          등록된 모든 고객사의 <code className="rounded bg-muted px-1">erp_stores</code> 매장을 조회합니다. 레거시(테넌트 미지정) 행은 유형이 표시됩니다.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/saas-admin/customers" className="text-primary underline underline-offset-4">
            고객사 관리
          </Link>
          에서 신규 고객사·초기 로그인(첫 매장)을 설정할 수 있습니다.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">신규 매장 생성</CardTitle>
          <CardDescription>고객사를 선택하고 새 매장을 등록합니다. 등록 후 관리자 페이지에서 매장 기반 운영에 사용할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>고객사</Label>
            <Select value={createTenantId || "__none__"} onValueChange={(v) => setCreateTenantId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="고객사 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">선택 안함</SelectItem>
                {tenantOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.companyName || t.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>매장명</Label>
            <Input
              value={createStoreName}
              onChange={(e) => setCreateStoreName(e.target.value)}
              placeholder="예: 강남점, 본사"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createStore()
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>매장 코드 (선택)</Label>
            <Input
              value={createStoreCode}
              onChange={(e) => setCreateStoreCode(e.target.value)}
              placeholder="비우면 자동 생성"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createStore()
              }}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={() => void createStore()} disabled={loading}>
              매장 생성
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={managerDialogOpen} onOpenChange={setManagerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>초기 매장 관리자 생성</DialogTitle>
            <DialogDescription>
              방금 만든 매장에 바로 로그인할 수 있는 관리자 계정을 생성합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>고객사</Label>
              <Input value={managerCompanyName || managerTenantId} disabled />
            </div>
            <div className="space-y-1">
              <Label>매장명</Label>
              <Input value={managerStoreName} disabled />
            </div>
            <div className="space-y-1">
              <Label>관리자 이름</Label>
              <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="예: manager" />
            </div>
            <div className="space-y-1">
              <Label>비밀번호</Label>
              <Input type="password" value={managerPassword} onChange={(e) => setManagerPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>비밀번호 확인</Label>
              <Input type="password" value={managerPassword2} onChange={(e) => setManagerPassword2(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={openLoginAfterCreate}
                onChange={(e) => setOpenLoginAfterCreate(e.target.checked)}
              />
              생성 후 회사 로그인 화면을 새 탭에서 열기
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManagerDialogOpen(false)}>
              나중에 하기
            </Button>
            <Button type="button" onClick={() => void createStoreManager()}>
              관리자 계정 생성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">필터</CardTitle>
          <CardDescription>고객사(테넌트)별로 매장 목록을 좁힐 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="space-y-2 md:min-w-[220px]">
            <Label>고객사</Label>
            <Select value={tenantFilter || "__all__"} onValueChange={(v) => setTenantFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체</SelectItem>
                {tenantOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.companyName || t.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-end">
            <div className="space-y-2 md:flex-1">
              <Label>검색 (매장명·코드·회사명)</Label>
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch()
                }}
                placeholder="입력 후 검색"
              />
            </div>
            <Button type="button" variant="secondary" onClick={applySearch} disabled={loading}>
              검색
            </Button>
          </div>
        </CardContent>
      </Card>

      {notice ? <p className="text-sm text-destructive">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">매장 목록</CardTitle>
          <CardDescription>
            {loading ? "불러오는 중…" : `${rows.length}건 표시`}
            {qApplied ? " · 검색 모드(최대 5000건까지 조회 후 필터)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>고객사</TableHead>
                <TableHead>테넌트 ID</TableHead>
                <TableHead>매장 표시</TableHead>
                <TableHead>코드</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.tenantId ? (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => {
                            setTenantFilter(r.tenantId || "")
                            setCreateTenantId(r.tenantId || "")
                          }}
                        >
                          {r.companyName || "—"}
                        </Button>
                      ) : (
                        r.companyName || "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.tenantId || "—"}</TableCell>
                    <TableCell>{r.label}</TableCell>
                    <TableCell>{r.storeCode || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.kind === "saas" ? "default" : "secondary"}>{r.kind === "saas" ? "SaaS" : "레거시"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.isActive ? "outline" : "destructive"}>{r.isActive ? "사용" : "중지"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={r.isActive ? "destructive" : "default"}
                        onClick={() => void toggleStoreActive(r)}
                        disabled={loading || r.kind !== "saas"}
                      >
                        {r.isActive ? "중지" : "재개"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {hasMore ? (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="outline" onClick={loadMore} disabled={loading}>
                더 보기
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
