"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Minus, Plus, ShoppingCart, Trash2, Package } from "lucide-react"

const categories = [
  { id: "chicken", name: "Chicken", items: ["후라이드 치킨", "양념 치킨", "간장 치킨", "마늘 치킨"] },
  { id: "kitchen", name: "Kitchen", items: ["위생장갑", "앞치마", "헤어캡", "수세미"] },
  { id: "packaging", name: "Packaging", items: ["치킨박스 (대)", "치킨박스 (소)", "비닐봉투", "소스컵"] },
  { id: "sauce", name: "Sauce & Powder", items: ["양념소스", "간장소스", "마늘파우더", "후추"] },
  { id: "noodles", name: "Sauce & Noodles", items: ["떡볶이 소스", "우동면", "라면", "쫄면"] },
  { id: "uniform", name: "Uniform", items: ["상의 (M)", "상의 (L)", "하의 (M)", "하의 (L)"] },
]

interface CartItem {
  name: string
  qty: number
}

export function UsageTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const [quantity, setQuantity] = useState(1)
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([
    { name: "후라이드 치킨", qty: 2 },
    { name: "양념소스", qty: 1 },
  ])

  const addToCart = () => {
    if (!selectedItem) return
    setCart((prev) => {
      const existing = prev.find((item) => item.name === selectedItem)
      if (existing) {
        return prev.map((item) =>
          item.name === selectedItem ? { ...item, qty: item.qty + quantity } : item
        )
      }
      return [...prev, { name: selectedItem, qty: quantity }]
    })
    setSelectedItem(null)
    setQuantity(1)
  }

  const removeFromCart = (name: string) => {
    setCart((prev) => prev.filter((item) => item.name !== name))
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Tabs defaultValue="input" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="input" className="text-sm font-medium">{t('useInput')}</TabsTrigger>
          <TabsTrigger value="history" className="text-sm font-medium">{t('useHistory')}</TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="mt-4 flex flex-col gap-4">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Accordion type="single" collapsible className="w-full">
                {categories.map((category) => (
                  <AccordionItem key={category.id} value={category.id} className="border-b border-border/60 last:border-0">
                    <AccordionTrigger className="px-4 py-3.5 text-sm font-semibold hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        {category.name}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-3">
                      <div className="flex flex-col gap-1.5">
                        {category.items.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setSelectedItem(item)}
                            className={`rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                              selectedItem === item
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-foreground hover:bg-muted"
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-border bg-card">
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-l-xl text-primary" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center text-sm font-semibold text-foreground">{quantity}</span>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-r-xl text-primary" onClick={() => setQuantity(quantity + 1)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button className="h-10 flex-1 font-semibold" onClick={addToCart} disabled={!selectedItem}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              {t('addUsage')}
            </Button>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">{t('itemsUsed')}</CardTitle>
              <Badge variant="secondary" className="text-xs">{cart.length}{t('countUnit')}</Badge>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t('noCartItems')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {cart.map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                        <Badge variant="outline" className="text-xs">{item.qty}</Badge>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeFromCart(item.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Button className="h-12 w-full text-base font-bold">{t('confirmUsage')}</Button>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="shadow-sm">
            <CardContent className="py-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">{t('useHistoryEmpty')}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
