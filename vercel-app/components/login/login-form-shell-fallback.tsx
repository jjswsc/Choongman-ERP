"use client"

/** LoginForm 청크 로드 전 잠깐 표시 (SSR 비활성 시에만 사용) */
export function LoginFormShellFallback() {
  return (
    <div className="login-page">
      <div className="login-loading">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500" />
        <p className="mt-4 text-sm text-white/80">로딩 중...</p>
      </div>
    </div>
  )
}
