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
import { useAuth, type AuthState } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"

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
  const { lang, setLang } = useLang()
  const tMsg = useT(lang)

  const [pwModalOpen, setPwModalOpen] = useState(false)
  const [pwOld, setPwOld] = useState("")
  const [pwNew, setPwNew] = useState("")
  const [pwNew2, setPwNew2] = useState("")
  const [pwChanging, setPwChanging] = useState(false)
  const [pwError, setPwError] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)

  /** 이전 로그인 세션이 있으면 서버 없이 오프라인 진입 가능 */
  const cachedAuth = React.useMemo((): AuthState | null => {
    if (typeof window === "undefined") return null
    try {
      const store = sessionStorage.getItem("cm_store")
      const user = sessionStorage.getItem("cm_user")
      const role = sessionStorage.getItem("cm_role") || ""
      const token = sessionStorage.getItem("cm_token")
      if (store && user) return { store, user, role, token: token || undefined }
    } catch {}
    return null
  }, [])

  const fetchLoginData = React.useCallback(() => {
    setLoadError(null)
    setLoading(true)
    const timeoutMs = 6000
    const withTimeout = Promise.race([
      getLoginData(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`연결 시간 초과 (${timeoutMs / 1000}초)`)), timeoutMs)
      ),
    ])
    withTimeout
      .then((d) => {
        setLoginData(d.users || {})
        if (d._source === 'fallback') {
          setLoadError('서버에 연결할 수 없습니다.')
        } else {
          setLoadError(null)
        }
        setLoading(false)
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e)
        setLoadError(
          msg.includes('연결') || msg.includes('시간 초과') || msg.includes('fetch') || msg.includes('Failed')
            ? '서버에 연결할 수 없습니다.'
            : msg
        )
        setLoginData({})
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (auth) {
      router.replace(redirectTo)
      return
    }
    fetchLoginData()
  }, [auth, redirectTo, router, fetchLoginData])

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("cm_lang")
      if (saved && ["ko", "en", "th", "mm", "la"].includes(saved))
        setLang(saved as "ko" | "en" | "th" | "mm" | "la")
    }
  }, [])

  const handleStoreChange = (s: string) => {
    setStore(s)
    setUser("")
  }

  const handleLangChange = (l: string) => {
    if (["ko", "en", "th", "mm", "la"].includes(l)) setLang(l as "ko" | "en" | "th" | "mm" | "la")
    try {
      sessionStorage.setItem("cm_lang", l)
    } catch {}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!store || !user) {
      setError(tMsg("msg_select_store_name"))
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const res = await loginCheck({ store, name: user, pw, isAdminPage })
      if (res.success && res.storeName && res.userName) {
        setAuth({
          store: res.storeName,
          user: res.userName,
          role: res.role || "",
          token: res.token,
        })
        router.replace(redirectTo)
      } else {
        setError(translateApiMessage(res.message, tMsg) || res.message || tMsg("msg_login_failed"))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (typeof console !== "undefined" && console.error) {
        console.error("[Login] loginCheck failed:", err)
      }
      const friendlyMsg =
        msg.includes('fetch') || msg.includes('Failed') || msg.includes('Network') || msg.includes('연결')
          ? '네트워크 연결을 확인해 주세요. 오프라인이거나 서버에 연결할 수 없습니다.'
          : tMsg("msg_server_error_prefix") + msg
      setError(friendlyMsg)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePwChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!store || !user) {
      setPwError(tMsg("msg_store_name_first"))
      return
    }
    if (!pwOld) {
      setPwError(tMsg("msg_enter_current_pw"))
      return
    }
    if (!pwNew) {
      setPwError(tMsg("msg_enter_new_pw"))
      return
    }
    if (pwNew !== pwNew2) {
      setPwError(tMsg("msg_pw_mismatch"))
      return
    }
    setPwChanging(true)
    setPwError("")
    try {
      const res = await changePassword({ store, name: user, oldPw: pwOld, newPw: pwNew })
      if (res.success) {
        alert(translateApiMessage(res.message, tMsg) || tMsg("pw_success"))
        setPwModalOpen(false)
        setPwOld("")
        setPwNew("")
        setPwNew2("")
      } else {
        setPwError(translateApiMessage(res.message, tMsg) || tMsg("msg_change_failed"))
      }
    } catch (err) {
      setPwError(tMsg("msg_server_error_prefix") + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPwChanging(false)
    }
  }

  const canEnterOffline = Boolean(loadError && cachedAuth)

  const isOfficeStore = (s: string) => {
    const x = String(s || "").trim()
    return x === "본사" || x === "오피스" || x === "본점" || x.toLowerCase().includes("office")
  }
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
          <p className="mt-4 text-sm text-white/80">서버에 연결 중...</p>
          {cachedAuth && (
            <button
              type="button"
              onClick={() => {
                setAuth(cachedAuth)
                router.replace(redirectTo)
              }}
              className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              오프라인 모드로 들어가기
            </button>
          )}
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
            {(noStores || loadError) && (
              <div className="-mt-2 mb-3 flex flex-col gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                <span>{loadError || tMsg("msg_no_stores_env")}</span>
                {!cachedAuth && (noStores || loadError) && (
                  <span className="text-xs text-amber-200/90">
                    이 기기에서 이전에 로그인한 적이 있어야 오프라인으로 들어갈 수 있습니다.
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {canEnterOffline && (
                    <button
                      type="button"
                      onClick={() => {
                        if (cachedAuth) {
                          setAuth(cachedAuth)
                          router.replace(redirectTo)
                        }
                      }}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      오프라인 모드로 들어가기
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fetchLoginData()}
                    className="rounded-md bg-amber-500/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500/50"
                  >
                    다시 시도
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-md bg-amber-500/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500/50"
                  >
                    새로고침
                  </button>
                </div>
              </div>
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

            {error && (
              <div className="mb-3 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={submitting}>
              {submitting ? t.loggingIn : t.login}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!store || !user) {
                  alert(tMsg("msg_store_name_first"))
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
                {pwChanging ? tMsg("pw_changing") : t.pwChangeBtn}
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
