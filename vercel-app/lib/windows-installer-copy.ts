import type { AppBrandKey } from "@/lib/app-brand"

/** Omni(판매) Windows POS 설치본 — `cm-pos-windows-latest-setup.exe` */
export const WINDOWS_POS_OMNI_SETUP_PATH = "/downloads/windows-pos/cm-pos-windows-latest-setup.exe"
/** 충만 내부 Windows POS 설치본 */
export const WINDOWS_POS_CHOONGMAN_SETUP_PATH =
  "/downloads/windows-pos/cm-pos-windows-choongman-latest-setup.exe"
/** @deprecated 호환용 — Omni 경로와 동일. 브랜드별로는 `windowsPosSetupPathForBrand` 사용 */
export const WINDOWS_POS_SETUP_PATH = WINDOWS_POS_OMNI_SETUP_PATH

export const WINDOWS_ERP_SETUP_PATH = "/downloads/windows-erp/cm-erp-windows-latest-setup.exe"

export function windowsPosSetupPathForBrand(brand: AppBrandKey | string | null | undefined): string {
  const key = String(brand || "")
    .trim()
    .toLowerCase()
  if (key === "omnifoodtech" || key === "omni" || key === "saas") {
    return WINDOWS_POS_OMNI_SETUP_PATH
  }
  return WINDOWS_POS_CHOONGMAN_SETUP_PATH
}

export function isLocalDevHost(hostname?: string | null): boolean {
  const h = String(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "") ?? ""
  )
    .trim()
    .toLowerCase()
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost")
}

/**
 * 클립보드에 넣을 최종 URL.
 * Vercel에 exe를 Git으로 안 올릴 때는 아래 env로 GitHub Releases·S3 등 절대 URL을 지정 (빌드 시 주입).
 */
export function resolveWindowsInstallerUrl(path: string): string {
  if (path === WINDOWS_ERP_SETUP_PATH) {
    const u = process.env.NEXT_PUBLIC_WINDOWS_ERP_SETUP_URL?.trim()
    if (u) return u
  }
  if (path === WINDOWS_POS_OMNI_SETUP_PATH) {
    const u = process.env.NEXT_PUBLIC_WINDOWS_POS_SETUP_URL?.trim()
    if (u) return u
    const omni = process.env.NEXT_PUBLIC_WINDOWS_POS_OMNI_SETUP_URL?.trim()
    if (omni) return omni
  }
  if (path === WINDOWS_POS_CHOONGMAN_SETUP_PATH) {
    const u = process.env.NEXT_PUBLIC_WINDOWS_POS_CHOONGMAN_SETUP_URL?.trim()
    if (u) return u
  }
  if (typeof window !== "undefined") {
    return new URL(path, window.location.origin).href
  }
  return path
}

export function openWindowsInstallerDownload(path: string): string {
  const url = resolveWindowsInstallerUrl(path)
  if (typeof window !== "undefined") {
    window.location.assign(url)
  }
  return url
}

export async function copyWindowsInstallerUrl(
  path: string
): Promise<{ ok: true; url: string } | { ok: false; url: string }> {
  const url = resolveWindowsInstallerUrl(path)
  try {
    await navigator.clipboard.writeText(url)
    return { ok: true, url }
  } catch {
    return { ok: false, url }
  }
}
