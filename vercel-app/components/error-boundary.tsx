"use client"

import * as React from "react"
import {
  CHUNK_RECOVERY_UI_WATCHDOG_MS,
  hasRecentChunkRecovery,
  isStaleClientBundleError,
  recoverFromChunkLoadError,
  shouldWipeCachesForChunkRecovery,
} from "@/lib/chunk-load-recovery"
import { getClientUiLang, getRuntimeUiString } from "@/lib/runtime-ui-strings"

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  recovering: boolean
}

export class ErrorBoundary extends React.Component<Props, State> {
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: undefined, recovering: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentWillUnmount() {
    this.clearRecoveryWatchdog()
  }

  clearRecoveryWatchdog() {
    if (this.recoveryTimer != null) {
      clearTimeout(this.recoveryTimer)
      this.recoveryTimer = null
    }
  }

  armRecoveryWatchdog() {
    this.clearRecoveryWatchdog()
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null
      this.setState({ recovering: false })
    }, CHUNK_RECOVERY_UI_WATCHDOG_MS)
  }

  async startStaleBundleRecovery() {
    const shell = typeof window !== "undefined" ? window.cmPosShell : undefined
    let systemOnline: boolean | null = null
    if (typeof shell?.isSystemOnline === "function") {
      try {
        systemOnline = (await shell.isSystemOnline()) === true
      } catch {
        systemOnline = null
      }
    }
    const navigatorOnLine = typeof navigator !== "undefined" ? navigator.onLine : null
    if (!shouldWipeCachesForChunkRecovery({ systemOnline, navigatorOnLine })) return
    this.setState({ recovering: true })
    this.armRecoveryWatchdog()
    void recoverFromChunkLoadError()
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo)
    if (!isStaleClientBundleError(error)) return
    if (hasRecentChunkRecovery()) return
    this.startStaleBundleRecovery()
  }

  handleRetry = () => {
    const err = this.state.error
    if (isStaleClientBundleError(err)) {
      this.startStaleBundleRecovery()
      return
    }
    this.clearRecoveryWatchdog()
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
      const lang = getClientUiLang()
      const staleBundle = isStaleClientBundleError(this.state.error)
      const hybrid = typeof window !== "undefined" && typeof window.cmPosShell?.resetCacheAndReload === "function"
      if (this.state.recovering) {
        return (
          <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
            <div className="max-w-lg rounded-lg border bg-card p-6 text-center">
              <p className="text-sm font-medium">{getRuntimeUiString(lang, "appErrorRecovering")}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {getRuntimeUiString(lang, "appErrorRecoveringHint")}
              </p>
            </div>
          </div>
        )
      }
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
          <div className="max-w-lg rounded-lg border border-destructive/50 bg-destructive/5 p-6">
            <h1 className="text-lg font-bold text-destructive">
              {getRuntimeUiString(lang, "appErrorTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {getRuntimeUiString(lang, "appErrorBody")}
            </p>
            {staleBundle && (
              <p className="mt-2 text-xs text-muted-foreground">
                {getRuntimeUiString(lang, "appErrorStaleHint")}
              </p>
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
                {getRuntimeUiString(lang, "appErrorRetry")}
              </button>
              {staleBundle && (
                <button
                  type="button"
                  onClick={hybrid ? this.handleHybridCacheReset : this.handleRetry}
                  className="rounded border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  {getRuntimeUiString(
                    lang,
                    hybrid ? "appErrorClearCacheHybrid" : "appErrorClearCacheWeb"
                  )}
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
