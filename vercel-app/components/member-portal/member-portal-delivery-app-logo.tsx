type DeliveryAppCode = "grab" | "lineman" | "shopee"

const DELIVERY_APP_LOGO_SRC: Record<DeliveryAppCode, string> = {
  grab: "/member-portal/delivery-apps/grab.svg",
  lineman: "/member-portal/delivery-apps/lineman.svg",
  shopee: "/member-portal/delivery-apps/shopee.svg",
}

export function MemberPortalDeliveryAppLogo({
  code,
  className = "h-8 w-8",
}: {
  code: DeliveryAppCode
  className?: string
}) {
  return (
    <img
      src={DELIVERY_APP_LOGO_SRC[code]}
      alt=""
      width={32}
      height={32}
      className={`shrink-0 ${className}`}
      aria-hidden
      draggable={false}
    />
  )
}
