"use client"

import * as React from "react"
import Image from "next/image"
import QRCode from "qrcode"
import {
  Award,
  ChevronRight,
  Copy,
  Gift,
  History,
  Home,
  Loader2,
  LogOut,
  QrCode,
  Share2,
  Sparkles,
  Ticket,
  UserRound,
  Wallet,
} from "lucide-react"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { MemberSummary } from "@/lib/members-server"
import {
  couponStatusLabel,
  formatBaht,
  formatDateTime,
  formatPoints,
  LOGIN_ERROR_MESSAGES,
  maskPhone,
  pointKindLabel,
  tierVisual,
  type PortalCouponRow,
  type PortalDashboard,
  type PortalPointRow,
  type PortalProfileForm,
  type PortalTab,
  type PortalVisitRow,
} from "@/components/member-portal/portal-ui"

async function postJson<T>(url: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<T>
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  return res.json() as Promise<T>
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {
          /* ignore */
        }
      }}
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "Copied!" : label || "Copy"}
    </button>
  )
}

function MembershipCard({
  member,
  dashboard,
  qrDataUrl,
  showQr,
  onToggleQr,
}: {
  member: MemberSummary
  dashboard: PortalDashboard
  qrDataUrl: string
  showQr: boolean
  onToggleQr: () => void
}) {
  const tier = tierVisual(dashboard.tierProgress.currentTierCode)
  const displayName = member.fullName || member.name || "Member"

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${tier.gradient} p-5 ${tier.glow}`}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-32 w-32 rounded-full bg-black/20 blur-2xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">Choongman Membership</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">{displayName}</h2>
          <p className="mt-1 text-sm text-white/65">{maskPhone(member.phone)}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${tier.chip}`}>
          {dashboard.tierProgress.currentTierName || tier.label}
        </span>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-black/20 px-4 py-3 backdrop-blur-sm">
          <p className="text-[11px] uppercase tracking-wider text-white/50">Points</p>
          <p className="mt-1 text-2xl font-semibold text-white">{formatPoints(member.pointBalance || 0)}</p>
        </div>
        <div className="rounded-2xl bg-black/20 px-4 py-3 backdrop-blur-sm">
          <p className="text-[11px] uppercase tracking-wider text-white/50">Member No.</p>
          <p className="mt-1 text-lg font-semibold tracking-wide text-white">{member.memberNo || `#${member.id}`}</p>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white/55">แสดง QR ที่เคาน์เตอร์เพื่อสะสมแต้ม</p>
          <p className="text-[11px] text-white/40">Show QR at counter to earn points</p>
        </div>
        <button
          type="button"
          onClick={onToggleQr}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
          aria-label="Toggle QR"
        >
          <QrCode className="h-5 w-5" />
        </button>
      </div>

      {showQr && qrDataUrl ? (
        <div className="relative mt-4 flex flex-col items-center rounded-2xl border border-white/10 bg-white p-4">
          <img src={qrDataUrl} alt="Member QR" className="h-44 w-44 rounded-xl" />
          <p className="mt-3 text-center text-xs text-neutral-600">{member.memberNo || `M${member.id}`}</p>
        </div>
      ) : null}
    </div>
  )
}

function StatTile({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-white/40">{sub}</p> : null}
    </div>
  )
}

function BottomNav({ tab, onChange }: { tab: PortalTab; onChange: (tab: PortalTab) => void }) {
  const items: Array<{ id: PortalTab; label: string; icon: React.ElementType }> = [
    { id: "home", label: "หน้าแรก", icon: Home },
    { id: "coupons", label: "คูปอง", icon: Ticket },
    { id: "history", label: "ประวัติ", icon: History },
    { id: "profile", label: "โปรไฟล์", icon: UserRound },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0b0d]/95 backdrop-blur-xl">
      <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {items.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] transition ${
                active ? "text-amber-300" : "text-white/45 hover:text-white/70"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-amber-300" : ""}`} />
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function MemberPortalApp() {
  const brand = useAppBrandConfig()
  const [member, setMember] = React.useState<MemberSummary | null>(null)
  const [dashboard, setDashboard] = React.useState<PortalDashboard | null>(null)
  const [phone, setPhone] = React.useState("")
  const [birthDate, setBirthDate] = React.useState("")
  const [tab, setTab] = React.useState<PortalTab>("home")
  const [loading, setLoading] = React.useState(true)
  const [actionLoading, setActionLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  const [lineLoginEnabled, setLineLoginEnabled] = React.useState(false)
  const [points, setPoints] = React.useState<PortalPointRow[]>([])
  const [coupons, setCoupons] = React.useState<PortalCouponRow[]>([])
  const [visits, setVisits] = React.useState<PortalVisitRow[]>([])
  const [showQr, setShowQr] = React.useState(false)
  const [qrDataUrl, setQrDataUrl] = React.useState("")
  const [profile, setProfile] = React.useState<PortalProfileForm>({
    name: "",
    birthDate: "",
    gender: "",
    nationality: "",
    email: "",
    referralCode: "",
    consentMarketing: false,
  })

  const loadSession = React.useCallback(async () => {
    const me = await getJson<{ success: boolean; member?: MemberSummary }>("/api/member-portal/me")
    if (!me.success || !me.member) return false

    const [dashRes, pointsRes, couponsRes, visitsRes] = await Promise.all([
      getJson<{ success: boolean } & PortalDashboard>("/api/member-portal/me/dashboard"),
      getJson<{ success: boolean; rows?: PortalPointRow[] }>("/api/member-portal/me/points"),
      getJson<{ success: boolean; rows?: PortalCouponRow[] }>("/api/member-portal/me/coupons"),
      getJson<{ success: boolean; rows?: PortalVisitRow[] }>("/api/member-portal/me/visits"),
    ])

    const dashMember = dashRes.success ? dashRes.member : me.member
    setMember(dashMember)
    if (dashRes.success) {
      setDashboard({
        member: dashRes.member,
        referralCode: dashRes.referralCode,
        stats: dashRes.stats,
        tierProgress: dashRes.tierProgress,
      })
    }
    setProfile((p) => ({
      ...p,
      name: dashMember.fullName || dashMember.name || "",
      birthDate: dashMember.birthDate || "",
      gender: dashMember.gender || "",
      nationality: dashMember.nationality || "",
      email: dashMember.email || "",
      referralCode: "",
      consentMarketing: Boolean(dashMember.consentMarketing),
    }))
    setPoints(pointsRes.rows || [])
    setCoupons(couponsRes.rows || [])
    setVisits(visitsRes.rows || [])
    return true
  }, [])

  React.useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        await loadSession()
      } finally {
        setLoading(false)
      }
    })()
    getJson<{ lineLoginEnabled?: boolean }>("/api/member-portal/auth/phone-birth")
      .then((r) => setLineLoginEnabled(Boolean(r.lineLoginEnabled)))
      .catch(() => {})
  }, [loadSession])

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get("error")
    const lineFriend = params.get("line_friend")
    if (err) {
      setError(LOGIN_ERROR_MESSAGES[err] || decodeURIComponent(err))
    }
    if (lineFriend === "added") {
      setNotice("ขอบคุณที่เพิ่ม Choongman Chicken เป็นเพื่อนใน LINE แล้ว")
    } else if (lineFriend === "connected") {
      setNotice("คุณเป็นเพื่อนกับ Choongman Chicken ใน LINE แล้ว")
    }
    if (err || lineFriend) window.history.replaceState({}, "", "/m")
  }, [])

  React.useEffect(() => {
    if (!member?.memberNo) return
    QRCode.toDataURL(member.memberNo, { width: 360, margin: 1, errorCorrectionLevel: "H" })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""))
  }, [member?.memberNo])

  const loginWithPhoneBirth = async () => {
    setActionLoading(true)
    setError("")
    try {
      const res = await postJson<{ success: boolean; message?: string }>("/api/member-portal/auth/phone-birth", {
        phone,
        birthDate,
        deviceLabel: "member-web",
      })
      if (!res.success) {
        setError(res.message || "เข้าสู่ระบบไม่สำเร็จ")
        return
      }
      await loadSession()
    } finally {
      setActionLoading(false)
    }
  }

  const saveProfile = async () => {
    setActionLoading(true)
    setError("")
    try {
      const res = await postJson<{ success: boolean; message?: string; member?: MemberSummary }>(
        "/api/member-portal/register",
        profile
      )
      if (!res.success) {
        setError(res.message || "บันทึกไม่สำเร็จ")
        return
      }
      await loadSession()
    } finally {
      setActionLoading(false)
    }
  }

  const logout = async () => {
    await postJson("/api/member-portal/auth/logout", {})
    setMember(null)
    setDashboard(null)
    setPoints([])
    setCoupons([])
    setVisits([])
    setTab("home")
    setPhone("")
    setBirthDate("")
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#08080a] text-white/70">
        <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
      </div>
    )
  }

  if (!member || !dashboard) {
    return (
      <div className="min-h-[100dvh] bg-[#08080a] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_42%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.04),transparent_35%)]" />
        <div className="relative mx-auto flex min-h-[100dvh] max-w-lg flex-col px-5 py-8">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-3 shadow-2xl">
              <Image src={brand.logoSymbolSrc} alt={brand.logoAlt} width={56} height={56} className="h-14 w-14 object-contain" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">Premium Membership</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{brand.headerWordmark}</h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/55">
              สะสมแต้ม ใช้คูปอง และดูประวัติการใช้บริการได้ในที่เดียว
            </p>
          </div>

          {!!notice && (
          <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        )}

        {!!error && (
            <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#06C755]/15 text-[#06C755]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-medium">LINE Login</h2>
                  <p className="text-xs text-white/45">แนะนำ · รวดเร็ว · ไม่เสียค่า SMS · เพิ่ม LINE OA เป็นเพื่อนได้</p>
                </div>
              </div>
              <Button
                className="h-12 w-full rounded-2xl bg-[#06C755] text-base font-medium text-white hover:bg-[#05b34c]"
                disabled={!lineLoginEnabled}
                onClick={() => {
                  window.location.href = "/api/member-portal/auth/line/start"
                }}
              >
                {lineLoginEnabled ? "เข้าสู่ระบบด้วย LINE" : "LINE Login กำลังเตรียมพร้อม"}
              </Button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
              <h2 className="font-medium">เบอร์โทร + วันเกิด</h2>
              <p className="mt-1 text-xs text-white/45">สำหรับสมาชิกที่ลงทะเบียนในระบบแล้ว</p>
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-white/70">เบอร์โทรศัพท์</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812345678"
                    inputMode="tel"
                    className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">วันเกิด</Label>
                  <Input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="h-12 rounded-2xl border-white/10 bg-black/20 text-white [color-scheme:dark]"
                  />
                </div>
                <Button
                  onClick={loginWithPhoneBirth}
                  disabled={actionLoading || !phone.trim() || !birthDate.trim()}
                  className="h-12 w-full rounded-2xl bg-amber-400 text-base font-medium text-black hover:bg-amber-300"
                >
                  {actionLoading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
                </Button>
              </div>
            </div>
          </div>

          <p className="mt-auto pt-10 text-center text-[11px] leading-relaxed text-white/30">
            ข้อมูลสมาชิกถูกเก็บรักษาอย่างปลอดภัย · Choongman Chicken Thailand
          </p>
        </div>
      </div>
    )
  }

  const tier = tierVisual(dashboard.tierProgress.currentTierCode)

  return (
    <div className="min-h-[100dvh] bg-[#08080a] pb-24 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.10),transparent_40%)]" />

      <div className="relative mx-auto max-w-lg px-4 pb-6 pt-5">
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-1.5">
              <Image src={brand.logoSymbolSrc} alt={brand.logoAlt} width={28} height={28} className="h-7 w-7 object-contain" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">Member Lounge</p>
              <p className="font-medium">{member.fullName || member.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition hover:text-white"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {!!notice && (
          <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        )}

        {!!error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {tab === "home" && (
          <div className="space-y-4">
            <MembershipCard
              member={member}
              dashboard={dashboard}
              qrDataUrl={qrDataUrl}
              showQr={showQr}
              onToggleQr={() => setShowQr((v) => !v)}
            />

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">ระดับสมาชิกถัดไป</p>
                  <p className="text-xs text-white/45">
                    {dashboard.tierProgress.nextTierName
                      ? `อีก ${formatBaht(dashboard.tierProgress.amountToNext)} ถึง ${dashboard.tierProgress.nextTierName}`
                      : "คุณอยู่ในระดับสูงสุดแล้ว"}
                  </p>
                </div>
                <Award className={`h-5 w-5 ${tier.accent}`} />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all"
                  style={{ width: `${dashboard.tierProgress.progressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-white/45">
                อัตราสะสมแต้ม {(dashboard.tierProgress.pointRate * 100).toFixed(1)}% · {dashboard.tierProgress.progressPercent}%
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={Wallet} label="ยอดใช้จ่ายสะสม" value={formatBaht(dashboard.stats.lifetimeAmount)} />
              <StatTile icon={History} label="จำนวนครั้งที่มา" value={`${dashboard.stats.visitCount}`} sub={`เฉลี่ย ${formatBaht(dashboard.stats.avgTicket)}`} />
              <StatTile icon={Ticket} label="คูปองพร้อมใช้" value={`${dashboard.stats.availableCoupons}`} />
              <StatTile icon={Gift} label="แต้มที่ได้รับรวม" value={formatPoints(dashboard.stats.pointsEarnedTotal)} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-400/10 to-transparent p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">ชวนเพื่อน รับแต้ม</p>
                  <p className="mt-1 text-xs text-white/45">แชร์รหัสแนะนำของคุณให้เพื่อนกรอกตอนสมัคร</p>
                  <p className="mt-3 font-mono text-lg tracking-widest text-amber-200">{dashboard.referralCode}</p>
                </div>
                <Share2 className="h-5 w-5 text-amber-300/80" />
              </div>
              <div className="mt-4 flex gap-2">
                <CopyButton text={dashboard.referralCode} label="Copy Code" />
                <CopyButton
                  text={`Join Choongman Chicken membership with my code ${dashboard.referralCode}`}
                  label="Share Text"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTab("history")}
              className="flex w-full items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition hover:bg-white/[0.05]"
            >
              <div>
                <p className="font-medium">ประวัติแต้มล่าสุด</p>
                <p className="text-xs text-white/45">{points[0] ? formatDateTime(points[0].createdAt) : "ยังไม่มีรายการ"}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-white/35" />
            </button>
          </div>
        )}

        {tab === "coupons" && (
          <div className="space-y-3">
            <div className="mb-1">
              <h2 className="text-lg font-semibold">คูปองของฉัน</h2>
              <p className="text-sm text-white/45">แสดงรหัสที่เคาน์เตอร์เมื่อสั่งซื้อ</p>
            </div>
            {coupons.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 px-5 py-12 text-center text-white/45">
                ยังไม่มีคูปอง
              </div>
            ) : (
              coupons.map((c) => (
                <div
                  key={c.id}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-lg tracking-wide text-amber-200">{c.couponCode}</p>
                      <p className="mt-1 text-xs text-white/45">ออกให้ {formatDateTime(c.issuedAt)}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        c.status === "issued"
                          ? "bg-emerald-400/15 text-emerald-200"
                          : "bg-white/10 text-white/50"
                      }`}
                    >
                      {couponStatusLabel(c.status)}
                    </span>
                  </div>
                  {c.status === "issued" ? (
                    <div className="mt-4">
                      <CopyButton text={c.couponCode} label="Copy Coupon" />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">ประวัติการใช้บริการ</h2>
              <p className="text-sm text-white/45">คำสั่งซื้อและการสะสมแต้ม</p>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-white/70">การสั่งซื้อล่าสุด</h3>
              <div className="space-y-2">
                {visits.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 px-5 py-10 text-center text-white/45">
                    ยังไม่มีประวัติการสั่งซื้อ
                  </div>
                ) : (
                  visits.map((v) => (
                    <div key={v.orderId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{formatBaht(v.total)}</p>
                          <p className="text-xs text-white/45">{v.storeCode || "Store"} · {v.orderNo || `#${v.orderId}`}</p>
                        </div>
                        <p className="text-xs text-white/45">{formatDateTime(v.visitedAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-white/70">ประวัติแต้ม</h3>
              <div className="space-y-2">
                {points.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 px-5 py-10 text-center text-white/45">
                    ยังไม่มีประวัติแต้ม
                  </div>
                ) : (
                  points.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`font-medium ${p.points >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {p.points >= 0 ? "+" : ""}
                            {formatPoints(p.points)}
                          </p>
                          <p className="text-xs text-white/45">{pointKindLabel(p.kind)} · {p.note || "-"}</p>
                        </div>
                        <p className="text-xs text-white/45">{formatDateTime(p.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "profile" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">โปรไฟล์สมาชิก</h2>
              <p className="text-sm text-white/45">อัปเดตข้อมูลเพื่อรับสิทธิประโยชน์ที่เหมาะกับคุณ</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label className="text-white/70">ชื่อ</Label>
                  <Input
                    value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                    className="rounded-2xl border-white/10 bg-black/20 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">เบอร์โทรศัพท์</Label>
                  <Input value={member.phone || ""} disabled className="rounded-2xl border-white/10 bg-black/10 text-white/60" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">วันเกิด</Label>
                  <Input
                    type="date"
                    value={profile.birthDate}
                    onChange={(e) => setProfile((p) => ({ ...p, birthDate: e.target.value }))}
                    className="rounded-2xl border-white/10 bg-black/20 text-white [color-scheme:dark]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-white/70">เพศ</Label>
                    <Input
                      value={profile.gender}
                      onChange={(e) => setProfile((p) => ({ ...p, gender: e.target.value }))}
                      placeholder="M / F"
                      className="rounded-2xl border-white/10 bg-black/20 text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white/70">สัญชาติ</Label>
                    <Input
                      value={profile.nationality}
                      onChange={(e) => setProfile((p) => ({ ...p, nationality: e.target.value }))}
                      placeholder="TH"
                      className="rounded-2xl border-white/10 bg-black/20 text-white"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">อีเมล</Label>
                  <Input
                    value={profile.email}
                    onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                    className="rounded-2xl border-white/10 bg-black/20 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">รหัสผู้แนะนำ (ถ้ามี)</Label>
                  <Input
                    value={profile.referralCode}
                    onChange={(e) => setProfile((p) => ({ ...p, referralCode: e.target.value.toUpperCase() }))}
                    placeholder="CM123456"
                    className="rounded-2xl border-white/10 bg-black/20 text-white"
                  />
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={profile.consentMarketing}
                    onChange={(e) => setProfile((p) => ({ ...p, consentMarketing: e.target.checked }))}
                    className="h-4 w-4 accent-amber-400"
                  />
                  <span className="text-white/75">ยินยอมรับข่าวสารและโปรโมชัน</span>
                </label>
              </div>

              <Button
                onClick={saveProfile}
                disabled={actionLoading}
                className="mt-5 h-12 w-full rounded-2xl bg-amber-400 text-base font-medium text-black hover:bg-amber-300"
              >
                {actionLoading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </Button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/45">
              <p>Member No. {member.memberNo}</p>
              <p className="mt-1">Joined {member.createdAt ? formatDateTime(member.createdAt) : "-"}</p>
              {member.lastVisitedAt ? <p className="mt-1">Last visit {formatDateTime(member.lastVisitedAt)}</p> : null}
            </div>
          </div>
        )}
      </div>

      <BottomNav tab={tab} onChange={setTab} />
    </div>
  )
}
