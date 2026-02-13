"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { getLoginData, loginCheck } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"

export default function AdminLoginPage() {
  const router = useRouter()
  const { auth, setAuth } = useAuth()
  const [loginData, setLoginData] = useState<Record<string, string[]>>({})
  const [store, setStore] = useState("")
  const [user, setUser] = useState("")
  const [pw, setPw] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (auth) {
      router.replace("/admin")
      return
    }
    getLoginData()
      .then((d) => {
        setLoginData(d.users || {})
        setLoading(false)
      })
      .catch(() => {
        setLoginData({})
        setLoading(false)
      })
  }, [auth, router])

  const handleStoreChange = (s: string) => {
    setStore(s)
    setUser("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!store || !user) {
      setError("매장과 이름을 선택하세요.")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const res = await loginCheck({ store, name: user, pw, isAdminPage: true })
      if (res.success && res.storeName && res.userName) {
        setAuth({ store: res.storeName, user: res.userName, role: res.role || "" })
        router.replace("/admin")
      } else {
        setError(res.message || "로그인 실패: PIN을 확인하세요.")
      }
    } catch (err) {
      setError("서버 오류: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSubmitting(false)
    }
  }

  const stores = Object.keys(loginData)
  const users = store ? (loginData[store] || []) : []

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700/50 bg-slate-900 p-8 shadow-xl">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <span className="text-lg font-bold text-primary-foreground">CM</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">충만치킨 ERP</h1>
            <p className="text-sm text-slate-400">관리자 로그인</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-store" className="text-slate-300">매장</Label>
            <Select value={store} onValueChange={handleStoreChange}>
              <SelectTrigger id="admin-store" className="h-10 bg-slate-800 border-slate-600 text-white">
                <SelectValue placeholder="매장 선택" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-user" className="text-slate-300">이름</Label>
            <Select value={user} onValueChange={setUser} disabled={!store}>
              <SelectTrigger id="admin-user" className="h-10 bg-slate-800 border-slate-600 text-white">
                <SelectValue placeholder="이름 선택" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-pw" className="text-slate-300">비밀번호 (PIN)</Label>
            <Input
              id="admin-pw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호 입력"
              className="h-10 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
              autoComplete="off"
            />
          </div>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <Button
            type="submit"
            className="h-11 w-full font-semibold"
            disabled={submitting}
          >
            {submitting ? "로그인 중..." : "로그인"}
          </Button>
        </form>
      </div>
    </div>
  )
}
