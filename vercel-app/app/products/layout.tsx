import type { Metadata } from "next"
import type { ReactNode } from "react"
import { getServerAppBrandConfig } from "@/lib/app-brand-server"

function absoluteUrl(path: string): string | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (raw) {
    try {
      return new URL(path, raw.endsWith("/") ? raw : `${raw}/`).toString()
    } catch {
      /* ignore */
    }
  }
  const v = process.env.VERCEL_URL?.trim()
  if (v) return `https://${v}${path.startsWith("/") ? "" : "/"}${path}`
  return undefined
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerAppBrandConfig()
  const title =
    brand.key === "omnifoodtech"
      ? `Products & services · ${brand.appName}`
      : `상품/서비스 안내 · ${brand.appName}`
  const description =
    brand.key === "omnifoodtech"
      ? "Explore OmniFoodTech packages for your stores. Compare offerings and reach our team from this page."
      : "매장에 맞는 상품 구성을 비교하고 문의로 연결할 수 있는 안내 페이지입니다."
  const url = absoluteUrl("/products")
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: brand.appName,
      locale: brand.key === "omnifoodtech" ? "en_US" : "ko_KR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: "/products",
    },
  }
}

export default async function ProductsLayout({ children }: { children: ReactNode }) {
  const brand = await getServerAppBrandConfig()
  const pageUrl = absoluteUrl("/products")
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: brand.key === "omnifoodtech" ? "Products & services" : "상품/서비스 안내",
    description: brand.metadataDescription,
    ...(pageUrl ? { url: pageUrl } : {}),
    isPartOf: {
      "@type": "WebSite",
      name: brand.appName,
    },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  )
}
