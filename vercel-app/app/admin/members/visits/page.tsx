"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getMemberVisits } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function MemberVisitsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [memberId, setMemberId] = React.useState("")
  const [rows, setRows] = React.useState<Array<{
    orderId: number
    memberId: number
    memberNo: string
    storeCode: string
    orderNo: string
    total: number
    visitedAt: string
  }>>([])

  const load = React.useCallback(async () => {
    const id = Number(memberId || 0)
    const list = await getMemberVisits({ memberId: id || undefined, limit: 500 })
    setRows(list)
  }, [memberId])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Card className="mb-4">
          <CardHeader><CardTitle>{t("memberVisitsSearchTitle")}</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder={t("memberVisitsMemberIdPh")} value={memberId} onChange={(e) => setMemberId(e.target.value)} />
            <Button variant="outline" onClick={() => load()}>{t("btn_query")}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("memberVisitsHistoryTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-left">{t("posOrderDateTime")}</th>
                    <th className="p-2 text-left">{t("memberId")}</th>
                    <th className="p-2 text-left">{t("memberNo")}</th>
                    <th className="p-2 text-left">{t("store")}</th>
                    <th className="p-2 text-left">{t("posOrderNo")}</th>
                    <th className="p-2 text-left">{t("memberVisitsPaymentAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.orderId} className="border-t">
                      <td className="p-2">{r.visitedAt}</td>
                      <td className="p-2">{r.memberId}</td>
                      <td className="p-2">{r.memberNo}</td>
                      <td className="p-2">{r.storeCode}</td>
                      <td className="p-2">{r.orderNo}</td>
                      <td className="p-2">{Number(r.total || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
