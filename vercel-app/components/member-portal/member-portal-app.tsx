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
  UserPlus,
  Wallet,
} from "lucide-react"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BirthDateFields } from "@/components/member-portal/birth-date-fields"
import { MemberPortalLangSelect } from "@/components/member-portal/member-portal-lang-select"
import type { MemberSummary } from "@/lib/members-server"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import {
  memberPortalCouponStatusLabel,
  memberPortalDateLocale,
  memberPortalLoginError,
  memberPortalPointKindLabel,
} from "@/lib/member-portal-i18n"
import { normalizeMemberPhone } from "@/lib/member-phone-lookup"
import {
  formatBaht,
  formatDateTime,
  formatPoints,
  maskPhone,
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

function LineLogo() {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-[9px] font-extrabold tracking-tight text-[#06C755]">
      LINE
    </span>
  )
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useMemberPortalLang()
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
      {copied ? t("copied") : label || t("copy")}
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
  const { t } = useMemberPortalLang()
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
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">{t("membership")}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">{displayName}</h2>
          <p className="mt-1 text-sm text-white/65">{maskPhone(member.phone)}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${tier.chip}`}>
          {dashboard.tierProgress.currentTierName || tier.label}
        </span>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-black/20 px-4 py-3 backdrop-blur-sm">
          <p className="text-[11px] uppercase tracking-wider text-white/50">{t("points")}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{formatPoints(member.pointBalance || 0)}</p>
        </div>
        <div className="rounded-2xl bg-black/20 px-4 py-3 backdrop-blur-sm">
          <p className="text-[11px] uppercase tracking-wider text-white/50">{t("memberNoShort")}</p>
          <p className="mt-1 text-lg font-semibold tracking-wide text-white">{member.memberNo || `#${member.id}`}</p>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white/55">{t("scanAtCounter")}</p>
        </div>
        <button
          type="button"
          onClick={onToggleQr}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
          aria-label={showQr ? t("hideQr") : t("showQr")}
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
  const { t } = useMemberPortalLang()
  const items: Array<{ id: PortalTab; label: string; icon: React.ElementType }> = [
    { id: "home", label: t("tabHome"), icon: Home },
    { id: "coupons", label: t("tabCoupons"), icon: Ticket },
    { id: "history", label: t("tabHistory"), icon: History },
    { id: "profile", label: t("tabProfile"), icon: UserRound },
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
  const { lang, t } = useMemberPortalLang()
  const dateLocale = memberPortalDateLocale(lang)
  const [bgPreset, setBgPreset] = React.useState<"soft" | "chic">("soft")
  const [member, setMember] = React.useState<MemberSummary | null>(null)
  const [dashboard, setDashboard] = React.useState<PortalDashboard | null>(null)
  const [phone, setPhone] = React.useState("")
  const [birthDate, setBirthDate] = React.useState("")
  const [tab, setTab] = React.useState<PortalTab>("home")
  const [signupName, setSignupName] = React.useState("")
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
    try {
      const saved = localStorage.getItem("cm_member_bg_preset")
      if (saved === "soft" || saved === "chic") setBgPreset(saved)
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get("error")
    const lineFriend = params.get("line_friend")
    if (err) {
      setError(memberPortalLoginError(lang, err))
    }
    if (lineFriend === "added") {
      setNotice(t("lineFriendAdded"))
    } else if (lineFriend === "connected") {
      setNotice(t("lineFriendConnected"))
    }
    if (err || lineFriend) window.history.replaceState({}, "", "/m")
  }, [lang, t])

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
      const res = await postJson<{ success: boolean; message?: string; code?: string }>(
        "/api/member-portal/auth/phone-birth",
        {
          phone: normalizeMemberPhone(phone),
          birthDate,
          deviceLabel: "member-web",
        }
      )
      if (!res.success) {
        setError(res.code ? memberPortalLoginError(lang, res.code) : res.message || t("loginFailed"))
        return
      }
      await loadSession()
    } finally {
      setActionLoading(false)
    }
  }

  const signupWithPhoneBirth = async () => {
    setActionLoading(true)
    setError("")
    setNotice("")
    try {
      const res = await postJson<{ success: boolean; created?: boolean; message?: string; code?: string }>(
        "/api/member-portal/auth/signup",
        {
          name: signupName,
          phone: normalizeMemberPhone(phone),
          birthDate,
          deviceLabel: "member-web",
        }
      )
      if (!res.success) {
        setError(res.code ? memberPortalLoginError(lang, res.code) : res.message || t("loginFailed"))
        return
      }
      setNotice(t(res.created ? "signup_success_created" : "signup_success_existing"))
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
        setError(res.message || t("saveFailed"))
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
    const birthDateReady = /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    const bgGradientClass =
      bgPreset === "chic"
        ? "bg-[radial-gradient(circle_at_80%_8%,rgba(255,229,236,0.16),transparent_34%),radial-gradient(circle_at_20%_14%,rgba(209,168,255,0.14),transparent_36%),radial-gradient(circle_at_52%_85%,rgba(255,255,255,0.06),transparent_40%),linear-gradient(180deg,#140d1f_0%,#1d1226_46%,#0e0a14_100%)]"
        : "bg-[radial-gradient(circle_at_20%_15%,rgba(255,175,208,0.28),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(255,209,178,0.18),transparent_36%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.08),transparent_42%),linear-gradient(180deg,#1c1223_0%,#231427_42%,#120d16_100%)]"
    return (
      <div className="min-h-[100dvh] bg-[#120d16] text-white">
        <div className={`pointer-events-none absolute inset-0 ${bgGradientClass}`} />
        <div className="pointer-events-none absolute inset-0 opacity-25 [background:radial-gradient(rgba(255,255,255,0.18)_0.8px,transparent_0.8px)] [background-size:22px_22px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-white/10 to-transparent" />
        <div className="relative mx-auto flex min-h-[100dvh] max-w-lg flex-col px-5 py-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-black/20 px-2 py-1">
              <span className="px-1 text-[11px] text-white/60">{t("bgPresetLabel")}</span>
              <button
                type="button"
                onClick={() => {
                  setBgPreset("soft")
                  try {
                    localStorage.setItem("cm_member_bg_preset", "soft")
                  } catch {
                    /* ignore */
                  }
                }}
                className={`rounded-lg px-2 py-1 text-[11px] transition ${
                  bgPreset === "soft" ? "bg-pink-300 text-[#2c1022]" : "text-white/70 hover:bg-white/10"
                }`}
              >
                {t("bgPresetSoft")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBgPreset("chic")
                  try {
                    localStorage.setItem("cm_member_bg_preset", "chic")
                  } catch {
                    /* ignore */
                  }
                }}
                className={`rounded-lg px-2 py-1 text-[11px] transition ${
                  bgPreset === "chic" ? "bg-violet-300 text-[#251236]" : "text-white/70 hover:bg-white/10"
                }`}
              >
                {t("bgPresetChic")}
              </button>
            </div>
            <MemberPortalLangSelect />
          </div>
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-3 shadow-2xl">
              <Image src={brand.logoSymbolSrc} alt={brand.logoAlt} width={56} height={56} className="h-14 w-14 object-contain" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">{t("premiumMembership")}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{brand.headerWordmark}</h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/55">
              {t("loginSubtitle")}
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
            <div className="rounded-3xl border border-pink-200/20 bg-white/[0.06] p-5 backdrop-blur-md">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#06C755]/15 text-[#06C755]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-medium">{t("lineLoginTitle")}</h2>
                  <p className="text-xs text-white/45">{t("lineLoginDesc")}</p>
                </div>
              </div>
              <Button
                className="h-12 w-full rounded-2xl bg-[#06C755] text-base font-semibold text-white hover:bg-[#05b34c]"
                disabled={!lineLoginEnabled}
                onClick={() => {
                  window.location.href = "/api/member-portal/auth/line/start"
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <LineLogo />
                  {lineLoginEnabled ? t("lineBtnWithLogo") : t("lineLoginPreparing")}
                </span>
              </Button>
            </div>

            <div className="rounded-3xl border border-pink-200/20 bg-white/[0.05] p-5 backdrop-blur-md">
              <div className="mb-2 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-pink-200" />
                <h2 className="font-medium">{t("signupTitle")}</h2>
              </div>
              <p className="mt-1 text-xs text-white/45">{t("signupDesc")}</p>
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("signupNameLabel")}</Label>
                  <Input
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    placeholder={t("signupNameLabel")}
                    className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/30"
                  />
                </div>
                <Button
                  onClick={signupWithPhoneBirth}
                  disabled={actionLoading || !signupName.trim() || !normalizeMemberPhone(phone) || !birthDateReady}
                  className="h-12 w-full rounded-2xl bg-pink-300 text-base font-medium text-[#2c1022] hover:bg-pink-200"
                >
                  {actionLoading ? t("signupChecking") : t("signupBtn")}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 px-2 text-xs text-white/35">
              <span className="h-px flex-1 bg-white/10" />
              <span>{t("signup_or")}</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
              <h2 className="font-medium">{t("phoneBirthTitle")}</h2>
              <p className="mt-1 text-xs text-white/45">{t("phoneBirthDesc")}</p>
              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("phoneLabel")}</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812345678"
                    inputMode="tel"
                    className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("birthDateLabel")}</Label>
                  <BirthDateFields value={birthDate} onChange={setBirthDate} />
                </div>
                <Button
                  onClick={loginWithPhoneBirth}
                  disabled={actionLoading || !normalizeMemberPhone(phone) || !birthDateReady}
                  className="h-12 w-full rounded-2xl bg-amber-400 text-base font-medium text-black hover:bg-amber-300"
                >
                  {actionLoading ? t("loginChecking") : t("loginBtn")}
                </Button>
              </div>
            </div>
          </div>

          <p className="mt-auto pt-10 text-center text-[11px] leading-relaxed text-white/30">
            {t("footerPrivacy")}
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
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-1.5">
              <Image src={brand.logoSymbolSrc} alt={brand.logoAlt} width={28} height={28} className="h-7 w-7 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">{t("memberLounge")}</p>
              <p className="truncate font-medium">{member.fullName || member.name}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <MemberPortalLangSelect />
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition hover:text-white"
              aria-label={t("logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
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
                  <p className="text-sm font-medium">{t("tierNext")}</p>
                  <p className="text-xs text-white/45">
                    {dashboard.tierProgress.nextTierName
                      ? t("tierProgress", {
                          amount: formatBaht(dashboard.tierProgress.amountToNext),
                          tier: dashboard.tierProgress.nextTierName,
                        })
                      : t("tierMax")}
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
                {(dashboard.tierProgress.pointRate * 100).toFixed(1)}% · {dashboard.tierProgress.progressPercent}%
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={Wallet} label={t("statLifetime")} value={formatBaht(dashboard.stats.lifetimeAmount)} />
              <StatTile
                icon={History}
                label={t("statVisits")}
                value={`${dashboard.stats.visitCount}`}
                sub={`${t("statAvgTicket")} ${formatBaht(dashboard.stats.avgTicket)}`}
              />
              <StatTile icon={Ticket} label={t("statCoupons")} value={`${dashboard.stats.availableCoupons}`} />
              <StatTile icon={Gift} label={t("statPointsEarned")} value={formatPoints(dashboard.stats.pointsEarnedTotal)} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-400/10 to-transparent p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t("referTitle")}</p>
                  <p className="mt-1 text-xs text-white/45">{t("referDesc")}</p>
                  <p className="mt-3 font-mono text-lg tracking-widest text-amber-200">{dashboard.referralCode}</p>
                </div>
                <Share2 className="h-5 w-5 text-amber-300/80" />
              </div>
              <div className="mt-4 flex gap-2">
                <CopyButton text={dashboard.referralCode} label={t("copyCode")} />
                <CopyButton
                  text={`Join Choongman Chicken membership with my code ${dashboard.referralCode}`}
                  label={t("shareText")}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTab("history")}
              className="flex w-full items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition hover:bg-white/[0.05]"
            >
              <div>
                <p className="font-medium">{t("recentPoints")}</p>
                <p className="text-xs text-white/45">
                  {points[0] ? formatDateTime(points[0].createdAt, dateLocale) : t("noRecords")}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-white/35" />
            </button>
          </div>
        )}

        {tab === "coupons" && (
          <div className="space-y-3">
            <div className="mb-1">
              <h2 className="text-lg font-semibold">{t("couponsTitle")}</h2>
              <p className="text-sm text-white/45">{t("couponsSub")}</p>
            </div>
            {coupons.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 px-5 py-12 text-center text-white/45">
                {t("noCoupons")}
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
                      <p className="mt-1 text-xs text-white/45">
                        {t("issuedAt")} {formatDateTime(c.issuedAt, dateLocale)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        c.status === "issued"
                          ? "bg-emerald-400/15 text-emerald-200"
                          : "bg-white/10 text-white/50"
                      }`}
                    >
                      {memberPortalCouponStatusLabel(lang, c.status)}
                    </span>
                  </div>
                  {c.status === "issued" ? (
                    <div className="mt-4">
                      <CopyButton text={c.couponCode} label={t("copyCode")} />
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
              <h2 className="text-lg font-semibold">{t("historyTitle")}</h2>
              <p className="text-sm text-white/45">{t("historySub")}</p>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-white/70">{t("recentOrders")}</h3>
              <div className="space-y-2">
                {visits.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 px-5 py-10 text-center text-white/45">
                    {t("noOrders")}
                  </div>
                ) : (
                  visits.map((v) => (
                    <div key={v.orderId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{formatBaht(v.total)}</p>
                          <p className="text-xs text-white/45">{v.storeCode || t("store")} · {v.orderNo || `#${v.orderId}`}</p>
                        </div>
                        <p className="text-xs text-white/45">{formatDateTime(v.visitedAt, dateLocale)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-white/70">{t("pointsHistory")}</h3>
              <div className="space-y-2">
                {points.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 px-5 py-10 text-center text-white/45">
                    {t("noPoints")}
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
                          <p className="text-xs text-white/45">
                            {memberPortalPointKindLabel(lang, p.kind)} · {p.note || "-"}
                          </p>
                        </div>
                        <p className="text-xs text-white/45">{formatDateTime(p.createdAt, dateLocale)}</p>
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
              <h2 className="text-lg font-semibold">{t("profileTitle")}</h2>
              <p className="text-sm text-white/45">{t("profileSub")}</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("nameLabel")}</Label>
                  <Input
                    value={profile.name}
                    onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                    className="rounded-2xl border-white/10 bg-black/20 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("phoneLabel")}</Label>
                  <Input value={member.phone || ""} disabled className="rounded-2xl border-white/10 bg-black/10 text-white/60" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("birthDateLabel")}</Label>
                  <BirthDateFields
                    value={profile.birthDate}
                    onChange={(iso) => setProfile((p) => ({ ...p, birthDate: iso }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-white/70">{t("genderLabel")}</Label>
                    <Input
                      value={profile.gender}
                      onChange={(e) => setProfile((p) => ({ ...p, gender: e.target.value }))}
                      placeholder="M / F"
                      className="rounded-2xl border-white/10 bg-black/20 text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white/70">{t("nationalityLabel")}</Label>
                    <Input
                      value={profile.nationality}
                      onChange={(e) => setProfile((p) => ({ ...p, nationality: e.target.value }))}
                      placeholder="TH"
                      className="rounded-2xl border-white/10 bg-black/20 text-white"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("emailLabel")}</Label>
                  <Input
                    value={profile.email}
                    onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                    className="rounded-2xl border-white/10 bg-black/20 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/70">{t("referralInputLabel")}</Label>
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
                  <span className="text-white/75">{t("consentMarketing")}</span>
                </label>
              </div>

              <Button
                onClick={saveProfile}
                disabled={actionLoading}
                className="mt-5 h-12 w-full rounded-2xl bg-amber-400 text-base font-medium text-black hover:bg-amber-300"
              >
                {actionLoading ? t("saving") : t("saveProfile")}
              </Button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/45">
              <p>{t("memberNo")} {member.memberNo}</p>
              <p className="mt-1">{t("joined")} {member.createdAt ? formatDateTime(member.createdAt, dateLocale) : "-"}</p>
              {member.lastVisitedAt ? (
                <p className="mt-1">{t("lastVisit")} {formatDateTime(member.lastVisitedAt, dateLocale)}</p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <BottomNav tab={tab} onChange={setTab} />
    </div>
  )
}
