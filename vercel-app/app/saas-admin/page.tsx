"use client"

import Link from "next/link"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function SaasAdminPage() {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t("saasAdminPageTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("saasAdminPageIntro")}</p>
      <ul className="list-inside list-disc text-sm text-primary">
        <li>
          <Link href="/saas-admin/customers" className="underline underline-offset-4">
            {t("saasAdminNavCustomers")}
          </Link>{" "}
          — {t("saasAdminPageBulletCustomers")}
        </li>
        <li>
          <Link href="/saas-admin/stores" className="underline underline-offset-4">
            {t("saasAdminNavStores")}
          </Link>{" "}
          — {t("saasAdminPageBulletStores")}
        </li>
        <li>
          <Link href="/saas-admin/users" className="underline underline-offset-4">
            {t("saasAdminNavUsers")}
          </Link>{" "}
          — {t("saasAdminPageBulletUsers")}
        </li>
      </ul>
    </main>
  )
}
