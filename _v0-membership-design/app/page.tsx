"use client"

import { useState } from "react"
import { PhoneFrame } from "@/components/phone-frame"
import { BottomNav, type NavId } from "@/components/bottom-nav"
import { HomeScreen } from "@/components/screens/home-screen"
import { BenefitsScreen } from "@/components/screens/benefits-screen"
import { RewardsScreen } from "@/components/screens/rewards-screen"
import { CardScreen } from "@/components/screens/card-screen"
import { HistoryScreen } from "@/components/screens/history-screen"
import { MeScreen } from "@/components/screens/me-screen"

type Screen =
  | "home"
  | "benefits"
  | "rewards"
  | "card"
  | "history"
  | "me"
  | "order"
  | "location"
  | "privilege"

const navToScreen: Record<NavId, Screen> = {
  home: "home",
  order: "order",
  location: "location",
  privilege: "privilege",
  me: "me",
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home")
  const [activeNav, setActiveNav] = useState<NavId>("home")

  function handleNav(id: NavId) {
    setActiveNav(id)
    setScreen(navToScreen[id])
  }

  function navigate(target: string) {
    setScreen(target as Screen)
  }

  return (
    <main className="min-h-svh bg-muted/40">
      <PhoneFrame>
        <div className="flex-1 overflow-y-auto">
          {screen === "home" && <HomeScreen onNavigate={navigate} />}
          {screen === "benefits" && <BenefitsScreen onBack={() => setScreen("home")} />}
          {screen === "rewards" && <RewardsScreen onBack={() => setScreen("me")} />}
          {screen === "card" && <CardScreen onBack={() => setScreen("me")} />}
          {screen === "history" && <HistoryScreen onBack={() => setScreen("me")} />}
          {screen === "me" && <MeScreen onNavigate={navigate} />}
          {(screen === "order" ||
            screen === "location" ||
            screen === "privilege") && (
            <PlaceholderScreen
              title={
                screen === "order"
                  ? "Order — สั่งอาหาร"
                  : screen === "location"
                    ? "Location — สาขาใกล้คุณ"
                    : "Privilege — สิทธิพิเศษ"
              }
            />
          )}
        </div>
        <BottomNav active={activeNav} onChange={handleNav} />
      </PhoneFrame>
    </main>
  )
}

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground">หน้านี้กำลังจะมาเร็ว ๆ นี้</p>
    </div>
  )
}
