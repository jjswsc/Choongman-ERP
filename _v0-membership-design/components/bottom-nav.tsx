"use client"

import { Home, ShoppingBag, MapPin, BadgePercent, User } from "lucide-react"

const navItems = [
  { id: "home", icon: Home, label: "Home" },
  { id: "order", icon: ShoppingBag, label: "Order" },
  { id: "location", icon: MapPin, label: "Location" },
  { id: "privilege", icon: BadgePercent, label: "Privilege" },
  { id: "me", icon: User, label: "Me" },
] as const

export type NavId = (typeof navItems)[number]["id"]

export function BottomNav({
  active,
  onChange,
}: {
  active: NavId
  onChange: (id: NavId) => void
}) {
  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
      <div className="flex items-center justify-around px-2 pb-5 pt-2">
        {navItems.map((item) => {
          const isActive = item.id === active
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className="flex flex-1 flex-col items-center gap-1 py-1"
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={`h-6 w-6 transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
                strokeWidth={isActive ? 2.4 : 2}
              />
              <span
                className={`text-[11px] font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
