"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Megaphone, Send } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { getNoticeOptions, sendNotice } from "@/lib/api-client"

export function AdminNoticeSection() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [noticeTitle, setNoticeTitle] = useState("")
  const [noticeContent, setNoticeContent] = useState("")
  const [noticeStoreSelected, setNoticeStoreSelected] = useState<string[]>([])
  const [noticeRoleSelected, setNoticeRoleSelected] = useState<string[]>([])
  const [noticeStores, setNoticeStores] = useState<string[]>([])
  const [noticeRoles, setNoticeRoles] = useState<string[]>([])
  const [noticeSending, setNoticeSending] = useState(false)

  useEffect(() => {
    if (!auth?.store) return
    getNoticeOptions().then((r) => {
      const isOffice = auth.role === "director" || auth.role === "officer"
      setNoticeStores(isOffice ? (r.stores || []) : [auth.store])
      setNoticeRoles(r.roles || [])
    })
  }, [auth])

  const toggleNoticeStore = (v: string) => {
    setNoticeStoreSelected((prev) => {
      if (v === "전체") return prev.includes("전체") ? [] : ["전체"]
      const next = prev.filter((x) => x !== "전체")
      return next.includes(v) ? next.filter((x) => x !== v) : [...next, v]
    })
  }

  const toggleNoticeRole = (v: string) => {
    setNoticeRoleSelected((prev) => {
      if (v === "전체") return prev.includes("전체") ? [] : ["전체"]
      const next = prev.filter((x) => x !== "전체")
      return next.includes(v) ? next.filter((x) => x !== v) : [...next, v]
    })
  }

  const handleSendNotice = async () => {
    if (!noticeTitle.trim()) {
      alert(t("adminNoticeSubjectRequired"))
      return
    }
    if (!auth?.store || !auth?.user) return
    const targetStore = noticeStoreSelected.length === 0 || noticeStoreSelected.includes("전체") ? "전체" : noticeStoreSelected.join(",")
    const targetRole = noticeRoleSelected.length === 0 || noticeRoleSelected.includes("전체") ? "전체" : noticeRoleSelected.join(",")
    setNoticeSending(true)
    const res = await sendNotice({
      title: noticeTitle.trim(),
      content: noticeContent.trim(),
      targetStore,
      targetRole,
      sender: auth.user,
      userStore: auth.store,
      userRole: auth.role,
    })
    setNoticeSending(false)
    if (res.success) {
      setNoticeTitle("")
      setNoticeContent("")
      alert(res.message || "공지가 발송되었습니다.")
    } else {
      alert(res.message || "발송 실패")
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Megaphone className="h-3.5 w-3.5 text-primary" />
        </div>
        <CardTitle className="text-base font-semibold">{t("adminNoticeSend")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notice-title" className="text-xs text-muted-foreground">{t("labelSubject")}</Label>
          <Input id="notice-title" placeholder={t("labelSubject")} className="h-10" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notice-content" className="text-xs text-muted-foreground">{t("labelContent")}</Label>
          <Textarea id="notice-content" placeholder={t("labelContent")} className="min-h-[120px] resize-none" value={noticeContent} onChange={(e) => setNoticeContent(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t("adminTargetStores")}</Label>
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-input p-2.5 min-h-[42px] bg-background">
            <button
              type="button"
              onClick={() => toggleNoticeStore("전체")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${noticeStoreSelected.includes("전체") ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
            >
              {t("all")}
            </button>
            {noticeStores.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => toggleNoticeStore(st)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${noticeStoreSelected.includes(st) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t("adminTargetRoles")}</Label>
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-input p-2.5 min-h-[42px] bg-background">
            <button
              type="button"
              onClick={() => toggleNoticeRole("전체")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${noticeRoleSelected.includes("전체") ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
            >
              {t("all")}
            </button>
            {noticeRoles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleNoticeRole(role)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${noticeRoleSelected.includes(role) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
        <Button className="mt-1 h-11 font-semibold" onClick={handleSendNotice} disabled={noticeSending}>
          <Send className="mr-2 h-4 w-4" />
          {noticeSending ? t("loading") : t("adminSendNoticeBtn")}
        </Button>
      </CardContent>
    </Card>
  )
}
