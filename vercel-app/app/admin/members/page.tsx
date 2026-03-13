"use client"

import * as React from "react"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createMember, getMembers, updateMember, type Member } from "@/lib/api-client"

type MemberForm = {
  id?: number
  name: string
  phone: string
  email: string
  status: "active" | "inactive"
}

const emptyForm: MemberForm = {
  name: "",
  phone: "",
  email: "",
  status: "active",
}

export default function MembersPage() {
  const [members, setMembers] = React.useState<Member[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searching, setSearching] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [form, setForm] = React.useState<MemberForm>(emptyForm)

  const load = React.useCallback(async (q?: string, isSearch = false) => {
    if (isSearch) setSearching(true)
    setErrorMessage("")
    setLoading(true)
    try {
      const rows = await getMembers({ q: q || "", limit: 300 })
      setMembers(rows)
    } catch (e) {
      console.error("getMembers:", e)
      setMembers([])
      setErrorMessage("회원 목록을 불러오지 못했습니다. 다시 시도해 주세요.")
    } finally {
      setLoading(false)
      if (isSearch) setSearching(false)
    }
  }, [])

  React.useEffect(() => {
    load("")
  }, [load])

  const onSave = async () => {
    const name = form.name.trim()
    if (!name) {
      alert("회원 이름은 필수입니다.")
      return
    }
    setSaving(true)
    try {
      if (form.id) {
        const res = await updateMember({
          id: form.id,
          name,
          phone: form.phone.trim(),
          email: form.email.trim(),
          status: form.status,
        })
        if (!res.success || !res.member) {
          alert(res.message || "회원 수정에 실패했습니다.")
          return
        }
      } else {
        const res = await createMember({
          name,
          phone: form.phone.trim(),
          email: form.email.trim(),
          source: "erp",
        })
        if (!res.success || !res.member) {
          alert(res.message || "회원 등록에 실패했습니다.")
          return
        }
      }
      setForm(emptyForm)
      await load(query)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">회원 관리</h1>
            <p className="text-xs text-muted-foreground">LINE 연동 회원과 POS/ERP 공용 회원을 관리합니다.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{form.id ? "회원 수정" : "회원 등록"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>이름 *</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>전화번호</Label>
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>이메일</Label>
                <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              {form.id ? (
                <div className="space-y-1.5">
                  <Label>상태(active/inactive)</Label>
                  <Input
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value === "inactive" ? "inactive" : "active" }))}
                  />
                </div>
              ) : null}
              <div className="flex gap-2 pt-1">
                <Button onClick={onSave} disabled={saving}>
                  {saving ? "저장 중..." : "저장"}
                </Button>
                <Button variant="outline" onClick={() => setForm(emptyForm)}>
                  신규
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">회원 목록</CardTitle>
              <div className="flex gap-2">
                <Input
                  placeholder="이름/전화/회원번호 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") load(query, true)
                  }}
                />
                <Button variant="outline" onClick={() => load(query, true)} disabled={searching}>
                  {searching ? "검색 중..." : "검색"}
                </Button>
              </div>
              {errorMessage ? (
                <p className="text-xs text-destructive">{errorMessage}</p>
              ) : (
                <p className="text-xs text-muted-foreground">검색 결과: {members.length.toLocaleString()}건</p>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">불러오는 중...</p>
              ) : (
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-left">회원번호</th>
                        <th className="p-2 text-left">이름</th>
                        <th className="p-2 text-left">전화</th>
                        <th className="p-2 text-left">LINE</th>
                        <th className="p-2 text-left">등급</th>
                        <th className="p-2 text-left">포인트</th>
                        <th className="p-2 text-left">누적금액</th>
                        <th className="p-2 text-left">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr
                          key={m.id}
                          className="cursor-pointer border-t hover:bg-muted/20"
                          onClick={() =>
                            setForm({
                              id: m.id,
                              name: m.name || "",
                              phone: m.phone || "",
                              email: m.email || "",
                              status: m.status === "inactive" ? "inactive" : "active",
                            })
                          }
                        >
                          <td className="p-2">{m.memberNo}</td>
                          <td className="p-2">{m.name}</td>
                          <td className="p-2">{m.phone || "-"}</td>
                          <td className="p-2">{m.lineLinked ? "연결됨" : "미연결"}</td>
                          <td className="p-2">{m.tierCode || "BRONZE"}</td>
                          <td className="p-2">{Number(m.pointBalance || 0).toLocaleString()}</td>
                          <td className="p-2">{Number(m.lifetimeAmount || 0).toLocaleString()}</td>
                          <td className="p-2">{m.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
