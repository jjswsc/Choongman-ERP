import { Gem } from "lucide-react"

const tierColors: Record<string, string> = {
  DIAMOND: "text-[#7fb6e0]",
  PLATINUM: "text-[#aab4c0]",
  GOLD: "text-[#e0b341]",
  SILVER: "text-[#c2ccd8]",
}

export function TierGem({
  tier,
  className = "h-4 w-4",
}: {
  tier: string
  className?: string
}) {
  return <Gem className={`${tierColors[tier] ?? "text-[#7fb6e0]"} ${className}`} fill="currentColor" fillOpacity={0.25} />
}
