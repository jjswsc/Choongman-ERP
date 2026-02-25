"use client"

import { useState } from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Database, Search } from "lucide-react"
import { ingredientDatabase } from "@/lib/cost-data"

export function IngredientSheet() {
  const { lang } = useLang()
  const t = useT(lang)
  const [search, setSearch] = useState("")

  const filtered = ingredientDatabase.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      String(i.code).includes(search)
  )

  const foodItems = filtered.filter((i) => i.category === "food")
  const packagingItems = filtered.filter((i) => i.category === "packaging")

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-border hover:bg-secondary">
          <Database className="h-4 w-4" />
          {t("posCostIngredientDb")}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl bg-background border-border">
        <SheetHeader>
          <SheetTitle className="text-foreground">{t("posCostIngredientDb")}</SheetTitle>
          <SheetDescription className="text-muted-foreground">
            {t("posCostIngredientDbDesc")}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("posCostSearchIngredientPh")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-secondary/50 border-border"
            />
          </div>

          <div className="space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {foodItems.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("posCostFoodIngredientsCount")} ({foodItems.length})
                  </h4>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-xs w-16">{t("posMenuCode")}</TableHead>
                        <TableHead className="text-xs">{t("posCostName")}</TableHead>
                        <TableHead className="text-xs text-right">{t("posCostBahtPerUnit")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {foodItems.map((item) => (
                        <TableRow key={item.code} className="border-border">
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {item.code}
                          </TableCell>
                          <TableCell className="text-sm">{item.name}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-primary">
                            {item.bahtPerUnit.toFixed(3)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {packagingItems.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-accent" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("posCostPackagingCount")} ({packagingItems.length})
                  </h4>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-xs w-16">{t("posMenuCode")}</TableHead>
                        <TableHead className="text-xs">{t("posCostName")}</TableHead>
                        <TableHead className="text-xs text-right">{t("posCostBahtPerUnit")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packagingItems.map((item) => (
                        <TableRow key={item.code} className="border-border">
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {item.code}
                          </TableCell>
                          <TableCell className="text-sm">{item.name}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-accent">
                            {item.bahtPerUnit.toFixed(3)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {filtered.length === 0 && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                {t("posCostNoIngredientsFound")}{search ? ` "${search}"` : ""}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
