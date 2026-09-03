"use client"

import * as React from "react"
import {
  hasRecentChunkRecovery,
  isStaleClientBundleError,
  recoverFromChunkLoadError,
} from "@/lib/chunk-load-recovery"

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  recovering: boolean
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: undefined, recovering: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo)
    if (!isStaleClientBundleError(error)) return
    if (hasRecentChunkRecovery()) return
    this.setState({ recovering: true })
    void recoverFromChunkLoadError()
  }

  handleRetry = () => {
    const err = this.state.error
    if (isStaleClientBundleError(err)) {
      this.setState({ recovering: true })
      void recoverFromChunkLoadError()
      return
    }
    this.setState({ hasError: false, error: undefined, recovering: false })
  }

  handleHybridCacheReset = () => {
    const reset = window.cmPosShell?.resetCacheAndReload
    if (typeof reset === "function") {
      void reset()
      return
    }
    this.handleRetry()
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const staleBundle = isStaleClientBundleError(this.state.error)
      const hybrid = typeof window !== "undefined" && typeof window.cmPosShell?.resetCacheAndReload === "function"
      if (this.state.recovering) {
        return (
          <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
            <div className="max-w-lg rounded-lg border bg-card p-6 text-center">
              <p className="text-sm font-medium">최신 버전을 불러오는 중입니다. 잠시만 기다려 주세요.</p>
              <p className="mt-2 text-sm text-muted-foreground">กำลังโหลดเวอร์ชันใหม่ กรุณารอสักครู่ครับ</p>
            </div>
          </div>
        )
      }
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
          <div className="max-w-lg rounded-lg border border-destructive/50 bg-destructive/5 p-6">
            <h1 className="text-lg font-bold text-destructive">응용 프로그램 오류</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              페이지를 로드하는 중 문제가 발생했습니다.
            </p>
            {staleBundle && (
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                <p>
                  업데이트 직후 휴대폰·브라우저 캐시가 섞이면 이 화면이 납니다. 「다시 시도」 또는 「캐시 지우고
                  새로고침」을 눌러 주세요. Windows POS에서는{" "}
                  <span className="font-semibold">Ctrl+Shift+R</span> 입니다.
                </p>
                <p>
                  หลังอัปเดตแคชค้างได้ครับ กด「다시 시도」หรือ「캐시 지우고 새로고침」 หรือบนโปรแกรม POS กด{" "}
                  <span className="font-semibold">Ctrl+Shift+R</span> เพื่อล้างแคชแล้วเปิดใหม่
                  อย่าใช้เว็บบราวเซอร์รับเงินสด ลิ้นชักจะไม่เด้งครับ
                </p>
              </div>
            )}
            <pre className="mt-4 overflow-auto rounded bg-muted p-3 text-xs text-destructive">
              {this.state.error.message}
            </pre>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                다시 시도
              </button>
              {staleBundle && (
                <button
                  type="button"
                  onClick={hybrid ? this.handleHybridCacheReset : this.handleRetry}
                  className="rounded border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  {hybrid ? "캐시 초기화 (Ctrl+Shift+R)" : "캐시 지우고 새로고침"}
                </button>
              )}
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
