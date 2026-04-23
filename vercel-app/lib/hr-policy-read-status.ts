import { isNoticeReadStatus } from '@/lib/notice-read-status'

/** 읽음 UI + content_version(개정) 반영 */
export function isHrPolicyReadCurrent(
  status: string,
  acknowledgedVersion: number | null | undefined,
  contentVersion: number
): boolean {
  if (!isNoticeReadStatus(status)) return false
  return (acknowledgedVersion ?? 0) >= (contentVersion || 1)
}
