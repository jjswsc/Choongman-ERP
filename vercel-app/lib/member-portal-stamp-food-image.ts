export const MEMBER_PORTAL_STAMP_FOOD_IMAGE_KEY = 'member_portal_stamp_food_image_url'

export const DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL = '/member-portal/single-chicken.webp'

export function normalizeMemberPortalStampFoodImageUrl(raw: unknown): string {
  const url = String(raw ?? '').trim()
  return url || DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL
}
