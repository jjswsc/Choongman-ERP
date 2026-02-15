"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getLoginData, loginCheck, changePassword } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"

interface LoginFormProps {
  redirectTo: string
  isAdminPage: boolean
}

export function LoginForm({ redirectTo, isAdminPage }: LoginFormProps) {
  const router = useRouter()
  const { auth, setAuth } = useAuth()
  const [loginData, setLoginData] = useState<Record<string, string[]>>({})
  const [store, setStore] = useState("")
  const [user, setUser] = useState("")
  const [pw, setPw] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [lang, setLang] = useState("ko")

  const [pwModalOpen, setPwModalOpen] = useState(false)
  const [pwOld, setPwOld] = useState("")
  const [pwNew, setPwNew] = useState("")
  const [pwNew2, setPwNew2] = useState("")
  const [pwChanging, setPwChanging] = useState(false)
  const [pwError, setPwError] = useState("")

  useEffect(() => {
    if (auth) {
      router.replace(redirectTo)
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
  }, [auth, redirectTo, router])

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("cm_lang")
      if (saved) setLang(saved)
    }
  }, [])

  const handleStoreChange = (s: string) => {
    setStore(s)
    setUser("")
  }

  const handleLangChange = (l: string) => {
    setLang(l)
    try {
      sessionStorage.setItem("cm_lang", l)
    } catch {}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!store || !user) {
      setError(lang === "ko" ? "매장과 이름을 선택하세요." : "Please select store and name.")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const res = await loginCheck({ store, name: user, pw, isAdminPage })
      if (res.success && res.storeName && res.userName) {
        setAuth({ store: res.storeName, user: res.userName, role: res.role || "" })
        router.replace(redirectTo)
      } else {
        setError(res.message || (lang === "ko" ? "로그인 실패: PIN을 확인하세요." : "Login failed: Check PIN."))
      }
    } catch (err) {
      setError((lang === "ko" ? "서버 오류: " : "Server error: ") + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSubmitting(false)
    }
  }

  const handlePwChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!store || !user) {
      setPwError(lang === "ko" ? "매장과 이름을 먼저 선택하세요." : "Please select store and name first.")
      return
    }
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
      const res = await changePassword({ store, name: user, oldPw: pwOld, newPw: pwNew })
      if (res.success) {
        alert(res.message)
        setPwModalOpen(false)
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

  const isOfficeStore = (s: string) => /^(본사|office|오피스|본점)$/i.test(String(s || "").trim())
  const stores = Object.keys(loginData).sort((a, b) => {
    if (isOfficeStore(a) && !isOfficeStore(b)) return -1
    if (!isOfficeStore(a) && isOfficeStore(b)) return 1
    return a.localeCompare(b)
  })
  const users = store ? (loginData[store] || []) : []
  const noStores = !loading && stores.length === 0

  const labels = {
    ko: {
      selectStore: "매장 선택",
      selectName: "이름 선택",
      pinPlaceholder: "비밀번호 (PIN)",
      login: "로그인",
      loggingIn: "로그인 중...",
      changePw: "비밀번호 변경",
      pwCurrent: "현재 비밀번호",
      pwNew: "새 비밀번호",
      pwNewConfirm: "새 비밀번호 확인",
      pwChangeBtn: "변경",
      cancel: "취소",
    },
    en: {
      selectStore: "Select Store",
      selectName: "Select Name",
      pinPlaceholder: "Password (PIN)",
      login: "Login",
      loggingIn: "Logging in...",
      changePw: "Change Password",
      pwCurrent: "Current password",
      pwNew: "New password",
      pwNewConfirm: "Confirm new password",
      pwChangeBtn: "Change",
      cancel: "Cancel",
    },
    th: { selectStore: "เลือกสาขา", selectName: "เลือกชื่อ", pinPlaceholder: "รหัสผ่าน (PIN)", login: "เข้าสู่ระบบ", loggingIn: "กำลังเข้าสู่ระบบ...", changePw: "เปลี่ยนรหัสผ่าน", pwCurrent: "รหัสปัจจุบัน", pwNew: "รหัสใหม่", pwNewConfirm: "ยืนยันรหัสใหม่", pwChangeBtn: "เปลี่ยน", cancel: "ยกเลิก" },
    mm: { selectStore: "ဆိုင်ရွေးပါ", selectName: "အမည်ရွေးပါ", pinPlaceholder: "လျှို့ဝှက်နံပါတ် (PIN)", login: "ဝင်ရောက်မည်", loggingIn: "ဝင်နေသည်...", changePw: "လျှို့ဝှက်နံပါတ်ပြောင်းမည်", pwCurrent: "လက်ရှိလျှို့ဝှက်နံပါတ်", pwNew: "လျှို့ဝှက်နံပါတ်အသစ်", pwNewConfirm: "အသစ်ထပ်ရိုက်ပါ", pwChangeBtn: "ပြောင်းမည်", cancel: "ပယ်ဖျက်မည်" },
    la: { selectStore: "ເລືອກສາຂາ", selectName: "ເລືອກຊື່", pinPlaceholder: "ລະຫັດ (PIN)", login: "ເຂົ້າສູ່ລະບົບ", loggingIn: "ກຳລັງເຂົ້າສູ່ລະບົບ...", changePw: "ປ່ຽນລະຫັດຜ່ານ", pwCurrent: "ລະຫັດປັດຈຸບັນ", pwNew: "ລະຫັດໃໝ່", pwNewConfirm: "ຢືນຢັນລະຫັດໃໝ່", pwChangeBtn: "ປ່ຽນ", cancel: "ຍົກເລີກ" },
  } as const
  const t = labels[lang as keyof typeof labels] || labels.ko

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-loading">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="background-cover" />
        <div className="background-glow" />
      </div>

      <div className="login-wrapper">
        <div className="glass-card">
          <div className="logo-section">
            <Image
              src="/img/logo.png"
              alt="Choongman Chicken"
              className="logo"
              width={120}
              height={120}
              priority
              unoptimized
            />
            <p className="erp-text">CM ERP SYSTEM</p>
          </div>

          <form onSubmit={handleSubmit}>
            <Select value={lang} onValueChange={handleLangChange}>
              <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="login-select-content">
                <SelectItem value="ko">🇰🇷 한국어</SelectItem>
                <SelectItem value="en">🇺🇸 English</SelectItem>
                <SelectItem value="th">🇹🇭 ภาษาไทย</SelectItem>
                <SelectItem value="mm">🇲🇲 မြန်မာ</SelectItem>
                <SelectItem value="la">🇱🇦 ພາສາລາວ</SelectItem>
              </SelectContent>
            </Select>

            <Select value={store} onValueChange={handleStoreChange}>
              <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }}>
                <SelectValue placeholder={`${t.selectStore}...`} />
              </SelectTrigger>
              <SelectContent className="login-select-content">
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {noStores && (
              <p className="-mt-2 mb-2 text-xs text-amber-400">
                {lang === "ko"
                  ? "매장 목록을 불러올 수 없습니다. vercel-app/.env에 SUPABASE_URL, SUPABASE_ANON_KEY를 설정해 주세요."
                  : "Cannot load store list. Set SUPABASE_URL and SUPABASE_ANON_KEY in vercel-app/.env"}
              </p>
            )}

            <Select value={user} onValueChange={setUser} disabled={!store}>
              <SelectTrigger type="button" className="login-select-trigger" style={{ color: "white" }}>
                <SelectValue placeholder={`${t.selectName}...`} />
              </SelectTrigger>
              <SelectContent className="login-select-content">
                {users.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t.pinPlaceholder}
              className="login-input-field"
              autoComplete="off"
              aria-label="Password"
            />

            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

            <button type="submit" className="login-btn" disabled={submitting}>
              {submitting ? t.loggingIn : t.login}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!store || !user) {
                  alert(lang === "ko" ? "매장과 이름을 먼저 선택하세요." : "Please select store and name first.")
                  return
                }
                setPwModalOpen(true)
                setPwError("")
                setPwOld("")
                setPwNew("")
                setPwNew2("")
              }}
              className="login-change-pw-btn"
            >
              {t.changePw}
            </button>
          </form>
        </div>
      </div>

      {pwModalOpen && (
        <div className="login-pw-modal" onClick={() => setPwModalOpen(false)}>
          <div className="login-pw-modal-inner" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-5 text-center text-lg font-bold text-white">{t.changePw}</h3>
            <form onSubmit={handlePwChange}>
              <input
                type="password"
                value={pwOld}
                onChange={(e) => setPwOld(e.target.value)}
                placeholder={t.pwCurrent}
                className="login-input-field mb-3"
                autoComplete="off"
              />
              <input
                type="password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                placeholder={t.pwNew}
                className="login-input-field mb-3"
                autoComplete="new-password"
              />
              <input
                type="password"
                value={pwNew2}
                onChange={(e) => setPwNew2(e.target.value)}
                placeholder={t.pwNewConfirm}
                className="login-input-field mb-4"
                autoComplete="new-password"
              />
              {pwError && <p className="mb-3 text-sm text-red-400">{pwError}</p>}
              <button type="submit" className="login-btn mb-2" disabled={pwChanging}>
                {pwChanging ? (lang === "ko" ? "변경 중..." : "Changing...") : t.pwChangeBtn}
              </button>
              <button
                type="button"
                onClick={() => setPwModalOpen(false)}
                className="w-full text-center text-sm text-white/60 hover:text-white"
              >
                {t.cancel}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
