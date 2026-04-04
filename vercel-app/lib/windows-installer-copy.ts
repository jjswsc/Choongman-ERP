/** 웹 UI에서 쓰는 윈도우 설치 파일 경로(사이트 루트 기준). */
export const WINDOWS_ERP_SETUP_PATH = "/downloads/windows-erp/cm-erp-windows-latest-setup.exe"
export const WINDOWS_POS_SETUP_PATH = "/downloads/windows-pos/cm-pos-windows-latest-setup.exe"

/**
 * 클립보드에 넣을 최종 URL.
 * Vercel에 exe를 Git으로 안 올릴 때는 아래 env로 GitHub Releases·S3 등 절대 URL을 지정 (빌드 시 주입).
 */
export function resolveWindowsInstallerUrl(path: string): string {
  if (path === WINDOWS_ERP_SETUP_PATH) {
    const u = process.env.NEXT_PUBLIC_WINDOWS_ERP_SETUP_URL?.trim()
    if (u) return u
  }
  if (path === WINDOWS_POS_SETUP_PATH) {
    const u = process.env.NEXT_PUBLIC_WINDOWS_POS_SETUP_URL?.trim()
    if (u) return u
  }
  if (typeof window !== "undefined") {
    return new URL(path, window.location.origin).href
  }
  return path
}

export async function copyWindowsInstallerUrl(path: string): Promise<{ ok: true; url: string } | { ok: false; url: string }> {
  const url = resolveWindowsInstallerUrl(path)
  try {
    await navigator.clipboard.writeText(url)
    return { ok: true, url }
  } catch {
    return { ok: false, url }
  }
}
