"use client"

import type { AuthState } from "@/lib/auth-context"
import type { JwtPayload } from "@/lib/jwt-auth"

export const FORM_CAT_NONE = "0"
export const LIST_CORR_SELECT_NONE = "__none__"
export const COMPANY_HYBRID_DOC_FILTER_STORAGE_KEY = "cm_company_hybrid_doc_filters_v1"
export const COMPANY_HYBRID_DOC_PAGE_SIZE = 50

export type CorrespondencePresence = "all" | "yes" | "no"
export type MainTab = "list" | "categories"

export function redirectToAdminLoginIfUnauthorized(
  httpStatus: number,
  setAuth: (auth: AuthState | null) => void
): boolean {
  if (httpStatus !== 401) return false
  if (typeof window === "undefined") return true
  setAuth(null)
  const here = `${window.location.pathname || "/admin"}${window.location.search || ""}`
  const q = new URLSearchParams()
  q.set("redirect", here.startsWith("/") ? here : "/admin/company-documents")
  window.location.assign(`/admin/login?${q.toString()}`)
  return true
}

export function authToJwtPayload(auth: {
  store?: string
  user?: string
  role?: string
  allowedStores?: string[]
}): JwtPayload {
  return {
    store: String(auth.store || ""),
    name: String(auth.user || ""),
    role: String(auth.role || ""),
    allowedStores: auth.allowedStores,
  }
}

export function formatHybridDocumentCreatedAt(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return String(iso)
  }
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
