"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type ProductItem = {
  id: string
  slug: string
  title: string
  subtitle: string
  summary: string
  description: string
  priceLabel: string
  coverImageUrl: string
  galleryUrls: string[]
  featureBullets: string[]
  ctaLabel: string
  ctaUrl: string
  isActive: boolean
  sortOrder: number
}

type MenuKey = "core" | "catalog" | "strength" | "contact"

export function ProductsPageClient() {
  const { lang } = useLang()
  const t = useT(lang)
  const [items, setItems] = useState<ProductItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [loadToken, setLoadToken] = useState(0)
  const [activeMenu, setActiveMenu] = useState<MenuKey>("core")
  const [selectedProductId, setSelectedProductId] = useState("")

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const res = await fetch("/api/productCatalog", { cache: "no-store" })
      if (!res.ok) {
        setItems([])
        setFetchError(true)
        return
      }
      const data = (await res.json()) as { items?: ProductItem[] }
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      setItems([])
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts, loadToken])

  const retry = () => setLoadToken((x) => x + 1)

  const list = useMemo(
    () => [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [items]
  )
  const selectedProduct = useMemo(
    () => list.find((x) => x.id === selectedProductId) || list[0] || null,
    [list, selectedProductId]
  )

  useEffect(() => {
    if (!selectedProductId && list.length > 0) {
      setSelectedProductId(list[0].id)
    }
  }, [list, selectedProductId])

  const mainTabs: { key: MenuKey; label: string }[] = [
    { key: "core", label: t("productsTabCore") },
    { key: "catalog", label: t("productsTabCatalog") },
    { key: "strength", label: t("productsTabStrength") },
    { key: "contact", label: t("productsTabContact") },
  ]

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold text-primary">{t("productsPageEyebrow")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t("productsPageTitle")}</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {t("productsPageSubtitle")}
          </p>
          <div className="mx-auto mt-5 max-w-3xl rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-left">
            <p className="text-xs font-semibold text-primary">{t("productsPageCoreStrengthLabel")}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{t("productsPageCoreStrengthBody")}</p>
          </div>
        </div>

        <div className="mb-6 overflow-x-auto">
          <div
            className="inline-flex min-w-full gap-2 rounded-xl border bg-card p-2 md:min-w-0"
            role="tablist"
            aria-label={t("productsTabListLabel")}
          >
            {mainTabs.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                id={`products-tab-${m.key}`}
                aria-selected={activeMenu === m.key}
                aria-controls="products-panel-main"
                tabIndex={activeMenu === m.key ? 0 : -1}
                onClick={() => setActiveMenu(m.key)}
                className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  activeMenu === m.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div
            className="rounded-xl border bg-card px-6 py-20 text-center text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {t("productsLoading")}
          </div>
        ) : fetchError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
            <p className="text-sm text-destructive">{t("productsFetchError")}</p>
            <Button type="button" className="mt-4" onClick={retry}>
              {t("productsRetry")}
            </Button>
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border bg-card px-6 py-20 text-center text-sm text-muted-foreground">
            {t("productsEmpty")}
          </div>
        ) : (
          <div id="products-panel-main" role="tabpanel" aria-labelledby={`products-tab-${activeMenu}`}>
            {activeMenu === "core" ? (
              <Card className="border-primary/10">
                <CardContent className="space-y-4 p-6 sm:p-8">
                  <h2 className="text-2xl font-bold">{t("productsCoreHeading")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("productsCoreP1Before")}
                    <span className="font-semibold text-foreground">{t("productsTabCatalog")}</span>
                    {t("productsCoreP1After")}
                  </p>
                  <ul className="grid gap-2 text-sm">
                    <li className="rounded-md border bg-muted/20 px-3 py-2">{t("productsCoreBullet1")}</li>
                    <li className="rounded-md border bg-muted/20 px-3 py-2">{t("productsCoreBullet2")}</li>
                    <li className="rounded-md border bg-muted/20 px-3 py-2">{t("productsCoreBullet3")}</li>
                  </ul>
                  <div>
                    <Button type="button" onClick={() => setActiveMenu("catalog")}>
                      {t("productsCoreCta")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : activeMenu === "strength" ? (
              <Card className="border-primary/10">
                <CardContent className="space-y-3 p-6 sm:p-8">
                  <h2 className="text-2xl font-bold">{t("productsStrengthHeading")}</h2>
                  <div className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">{t("productsStrengthHighlight")}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{t("productsStrengthP")}</p>
                </CardContent>
              </Card>
            ) : activeMenu === "contact" ? (
              <Card className="border-primary/10">
                <CardContent className="space-y-3 p-6 sm:p-8">
                  <h2 className="text-2xl font-bold">{t("productsContactHeading")}</h2>
                  <p className="text-sm text-muted-foreground">{t("productsContactP")}</p>
                  {selectedProduct?.ctaLabel && selectedProduct?.ctaUrl ? (
                    <div className="pt-1">
                      <Button asChild>
                        <a href={selectedProduct.ctaUrl} target="_blank" rel="noreferrer">
                          {selectedProduct.ctaLabel}
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <div
                    className="inline-flex min-w-full gap-2 rounded-lg border bg-card p-2 md:min-w-0"
                    role="tablist"
                    aria-label={t("productsTabCatalog")}
                  >
                    {list.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={selectedProduct?.id === item.id}
                        id={`products-catalog-tab-${item.id}`}
                        aria-controls="products-catalog-panel"
                        tabIndex={selectedProduct?.id === item.id ? 0 : -1}
                        onClick={() => setSelectedProductId(item.id)}
                        className={`whitespace-nowrap rounded-md px-3 py-2 text-sm transition ${
                          selectedProduct?.id === item.id
                            ? "bg-primary font-semibold text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedProduct ? (
                  <Card
                    id="products-catalog-panel"
                    className="overflow-hidden border-primary/10"
                    role="region"
                    aria-label={selectedProduct.title}
                  >
                    <CardContent className="p-0">
                      <div className="grid gap-0 md:grid-cols-[1.2fr,1fr]">
                        <div className="p-6 sm:p-8">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <h2 className="text-2xl font-bold">{selectedProduct.title}</h2>
                            {selectedProduct.priceLabel ? (
                              <span className="rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                                {selectedProduct.priceLabel}
                              </span>
                            ) : null}
                          </div>
                          {selectedProduct.subtitle ? (
                            <p className="text-sm font-medium text-primary/90">{selectedProduct.subtitle}</p>
                          ) : null}
                          {selectedProduct.summary ? (
                            <p className="mt-2 text-sm text-muted-foreground">{selectedProduct.summary}</p>
                          ) : null}
                          {selectedProduct.description ? (
                            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                              {selectedProduct.description}
                            </p>
                          ) : null}

                          {selectedProduct.featureBullets?.length > 0 ? (
                            <ul className="mt-5 grid gap-1 text-sm">
                              {selectedProduct.featureBullets.map((feature, idx) => (
                                <li key={`${selectedProduct.id}-feature-${idx}`} className="flex items-start gap-2">
                                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                                  <span>{feature}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          {selectedProduct.ctaLabel && selectedProduct.ctaUrl ? (
                            <div className="mt-6">
                              <Button asChild>
                                <a href={selectedProduct.ctaUrl} target="_blank" rel="noreferrer">
                                  {selectedProduct.ctaLabel}
                                </a>
                              </Button>
                            </div>
                          ) : null}

                          <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                            <p className="text-xs font-semibold text-primary">{t("productsOpStrengthLabel")}</p>
                            <p className="mt-0.5 text-xs text-foreground/90">{t("productsOpStrengthBody")}</p>
                          </div>
                        </div>

                        <div className="bg-muted/30 p-4 sm:p-6">
                          {selectedProduct.coverImageUrl ? (
                            <div className="relative h-56 w-full overflow-hidden rounded-lg border sm:h-64">
                              <Image
                                src={selectedProduct.coverImageUrl}
                                alt={selectedProduct.title}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, 40vw"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <div className="flex h-56 w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground sm:h-64">
                              {t("productsNoCoverImage")}
                            </div>
                          )}

                          {selectedProduct.galleryUrls?.length > 0 ? (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {selectedProduct.galleryUrls.slice(0, 6).map((url, idx) => (
                                <div
                                  key={`${selectedProduct.id}-gallery-${idx}`}
                                  className="relative h-20 w-full overflow-hidden rounded border"
                                >
                                  <Image
                                    src={url}
                                    alt={`${selectedProduct.title} ${idx + 1}`}
                                    fill
                                    className="object-cover"
                                    sizes="120px"
                                    unoptimized
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
