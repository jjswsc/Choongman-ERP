"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { User, KeyRound } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { changePassword } from "@/lib/api-client"

export function AdminProfile() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [pwOld, setPwOld] = useState("")
  const [pwNew, setPwNew] = useState("")
  const [pwNew2, setPwNew2] = useState("")
  const [pwChanging, setPwChanging] = useState(false)
  const [pwError, setPwError] = useState("")

  const handlePwChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!auth?.store || !auth?.user) return
    if (!pwOld) {
      setPwError(lang === "ko" ? "현재 비밀번호를 입력하세요." : "Enter current password.")
      return
    }
    if (!pwNew) {
      setPwError(lang === "ko" ? "새 비밀번호를 입력하세요." : "Enter new password.")
      return
    }
    if (pwNew !== pwNew2) {
      setPwError(lang === "ko" ? "새 비밀번호가 일치하지 않습니다." : "New passwords do not match.")
      return
    }
    setPwChanging(true)
    setPwError("")
    try {
      const res = await changePassword({
        store: auth.store,
        name: auth.user,
        oldPw: pwOld,
        newPw: pwNew,
      })
      if (res.success) {
        alert(res.message)
        setPwOld("")
        setPwNew("")
        setPwNew2("")
      } else {
        setPwError(res.message || (lang === "ko" ? "변경 실패" : "Change failed"))
      }
    } catch (err) {
      setPwError((lang === "ko" ? "서버 오류: " : "Server error: ") + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPwChanging(false)
    }
  }

  const roleLabel =
    auth?.role === "director" ? (lang === "ko" ? "본사(관리자)" : "HQ (Admin)") :
    auth?.role === "officer" ? (lang === "ko" ? "본사" : "HQ") :
    auth?.store || ""

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <User className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{t("adminProfile")}</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold mb-4">{t("adminMyAccount")}</h3>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{t("store")}</dt>
                <dd className="font-medium">{auth?.store ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("hrUser")}</dt>
                <dd className="font-medium">{auth?.user ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{lang === "ko" ? "권한" : "Role"}</dt>
                <dd className="font-medium">{roleLabel}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              {t("adminChangePw")}
            </h3>
            <form onSubmit={handlePwChange} className="space-y-3">
              <div>
                <label className="text-xs font-semibold block mb-1">
                  {lang === "ko" ? "현재 비밀번호" : "Current password"}
                </label>
                <Input
                  type="password"
                  value={pwOld}
                  onChange={(e) => setPwOld(e.target.value)}
                  className="h-9 text-xs"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">
                  {lang === "ko" ? "새 비밀번호" : "New password"}
                </label>
                <Input
                  type="password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  className="h-9 text-xs"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">
                  {lang === "ko" ? "새 비밀번호 확인" : "Confirm new password"}
                </label>
                <Input
                  type="password"
                  value={pwNew2}
                  onChange={(e) => setPwNew2(e.target.value)}
                  className="h-9 text-xs"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              {pwError && (
                <p className="text-xs text-destructive">{pwError}</p>
              )}
              <Button type="submit" className="h-9" disabled={pwChanging}>
                {pwChanging ? t("loading") : (lang === "ko" ? "비밀번호 변경" : "Change password")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
