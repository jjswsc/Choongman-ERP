"use client"

import * as React from "react"

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo)
  }

  handleRetry = () => {
    const err = this.state.error
    const isChunkError = err?.message?.includes("Loading chunk") || err?.message?.includes("ChunkLoadError")
    if (isChunkError) {
      window.location.reload()
      return
    }
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const isChunkError = this.state.error.message?.includes("Loading chunk") || this.state.error.message?.includes("ChunkLoadError")
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
          <div className="max-w-lg rounded-lg border border-destructive/50 bg-destructive/5 p-6">
            <h1 className="text-lg font-bold text-destructive">응용 프로그램 오류</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              페이지를 로드하는 중 문제가 발생했습니다.
            </p>
            {isChunkError && (
              <p className="mt-2 text-xs text-muted-foreground">
                네트워크 환경을 확인한 뒤 아래 버튼으로 새로고침해 보세요. 모바일에서는 PC IP 주소로 접속해야 할 수 있습니다.
              </p>
            )}
            <pre className="mt-4 overflow-auto rounded bg-muted p-3 text-xs text-destructive">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-4 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              다시 시도
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
