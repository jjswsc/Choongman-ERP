"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Link from "next/link"
import { ExternalLink, Loader2 } from "lucide-react"
import { type IncomeStatementPurchaseDrillDown } from "@/lib/api-client"
import { formatBahtInteger as formatBath } from "@/lib/financial-amount-format"
import {
  buildPurchaseDrillAdminHref,
  PL_PETTY_CASH_PURCHASE_VENDOR_KEY,
  purchaseDrillNavContextFromDrill,
} from "@/lib/income-statement-purchase-drill-nav"

export function IncomePurchaseDrillDialog({
  open,
  onOpenChange,
  purchaseDrillTitle,
  purchaseDrillLoading,
  purchaseDrillData,
  t,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseDrillTitle: string
  purchaseDrillLoading: boolean
  purchaseDrillData: IncomeStatementPurchaseDrillDown | null
  t: (k: string) => string
}) {
  const drillNavCtx =
    purchaseDrillData && !purchaseDrillData.error
      ? purchaseDrillNavContextFromDrill(purchaseDrillData, purchaseDrillTitle)
      : null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          // caller clears data/loading when closing
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("pL_purchaseDrillTitle")} — {purchaseDrillTitle}
          </DialogTitle>
          {purchaseDrillData && (
            <p className="text-xs text-muted-foreground font-normal">
              {purchaseDrillData.startStr} ~ {purchaseDrillData.endStr}
              {purchaseDrillData.storeFilter && purchaseDrillData.storeFilter !== "All"
                ? ` · ${purchaseDrillData.storeFilter}`
                : ""}
            </p>
          )}
        </DialogHeader>
        {purchaseDrillLoading && (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            {t("pL_purchaseDrillLoading")}
          </div>
        )}
        {!purchaseDrillLoading && purchaseDrillData?.error && (
          <p className="text-sm text-destructive py-2">{purchaseDrillData.error}</p>
        )}
        {!purchaseDrillLoading && purchaseDrillData && !purchaseDrillData.error && (
          <div className="space-y-4 text-sm">
            {(purchaseDrillData.truncated.inbound ||
              purchaseDrillData.truncated.bank ||
              purchaseDrillData.truncated.orders ||
              purchaseDrillData.truncated.petty) && (
              <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-md px-2 py-1.5">
                {t("pL_purchaseDrillTruncated")}
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              {purchaseDrillData.vendorKey !== PL_PETTY_CASH_PURCHASE_VENDOR_KEY && (
                <>
              <Link
                href={
                  drillNavCtx
                    ? buildPurchaseDrillAdminHref("/admin/outbound", drillNavCtx, "outbound")
                    : "/admin/outbound"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkOutbound")}
              </Link>
              <Link
                href="/admin/orders"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkOrders")}
              </Link>
              <Link
                href={
                  drillNavCtx
                    ? buildPurchaseDrillAdminHref("/admin/bank-transactions", drillNavCtx, "bank")
                    : "/admin/bank-transactions"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkBank")}
              </Link>
              <Link
                href={
                  drillNavCtx
                    ? buildPurchaseDrillAdminHref("/admin/inbound", drillNavCtx, "inbound")
                    : "/admin/inbound"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkInbound")}
              </Link>
                </>
              )}
              <Link
                href={
                  drillNavCtx
                    ? buildPurchaseDrillAdminHref("/admin/petty-cash", drillNavCtx, "petty")
                    : "/admin/petty-cash"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkPetty")}
              </Link>
            </div>

            {purchaseDrillData.isHqOrders && (purchaseDrillData.hqOutbounds?.length || 0) > 0 && (
              <div>
                <p className="text-sm font-bold text-foreground mb-1.5">
                  {t("pL_purchaseDrillHqOutbound")}
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStatus")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColItem")}</th>
                        <th className="text-right p-2">{t("pL_purchaseDrillColQty")}</th>
                        <th className="text-right p-2">{t("pL_purchaseDrillColUnitCost")}</th>
                        <th className="text-right p-2">{t("pL_colAmount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseDrillData.hqOutbounds!.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.logDate}</td>
                          <td className="p-2">{r.logType || "—"}</td>
                          <td className="p-2 max-w-[120px] truncate">{r.targetStore || "—"}</td>
                          <td className="p-2 font-mono">{r.itemCode}</td>
                          <td className="p-2 text-right font-mono">{r.qty}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.unitPrice)}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.lineAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchaseDrillData.isHqOrders && (purchaseDrillData.hqOrders?.length || 0) > 0 && (
              <div>
                <p className="text-sm font-bold text-foreground mb-1.5">
                  {t("pL_purchaseDrillHqOrdersRef")}
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                        <th className="text-right p-2">{t("pL_colAmount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseDrillData.hqOrders!.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.orderDate}</td>
                          <td className="p-2 max-w-[140px] truncate">{r.storeName || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.total)}</td>
                          <td className="p-2">{r.status || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchaseDrillData.inbound.length > 0 && (
              <div>
                <p className="text-sm font-bold text-foreground mb-1.5">
                  {t("pL_purchaseDrillInbound")}
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColLoc")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColItem")}</th>
                        <th className="text-right p-2">{t("pL_purchaseDrillColQty")}</th>
                        <th className="text-right p-2">{t("pL_purchaseDrillColUnitCost")}</th>
                        <th className="text-right p-2">{t("pL_colAmount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseDrillData.inbound.map((r, i) => (
                        <tr key={`${r.id ?? "x"}-${i}`} className="border-b border-border/60">
                          <td className="p-2 whitespace-nowrap">{r.logDate}</td>
                          <td className="p-2 max-w-[100px] truncate">{r.location}</td>
                          <td className="p-2 font-mono">{r.itemCode}</td>
                          <td className="p-2 text-right font-mono">{r.qty}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.unitCost)}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.lineAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchaseDrillData.bankPayments.length > 0 && (
              <div>
                <p className="text-sm font-bold text-foreground mb-1.5">
                  {t("pL_purchaseDrillBank")}
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-right p-2">{t("pL_colAmount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillBankOrderRef")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColMemo")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseDrillData.bankPayments.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.transDate}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.amount)}</td>
                          <td className="p-2 font-mono whitespace-nowrap">
                            {String(r.refType || "").toLowerCase() === "order" && r.refId ? (
                              <Link
                                href="/admin/orders"
                                className="text-primary underline underline-offset-2 hover:text-primary/90"
                                title={t("pL_purchaseDrillBankOrderRefHint")}
                              >
                                #{r.refId}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-2 max-w-[200px] truncate" title={r.memo || r.note || ""}>
                            {r.memo || r.note || "—"}
                          </td>
                          <td className="p-2 max-w-[100px] truncate">{r.store || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(purchaseDrillData.pettyCash?.length || 0) > 0 && (
              <div>
                <p className="text-sm font-bold text-foreground mb-1.5">{t("pL_purchaseDrillPetty") || t("pL_expenseDrillPetty") || "패티캐시"}</p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                        <th className="text-left p-2">{t("pL_accountSubject") || "계정과목"}</th>
                        <th className="text-right p-2">{t("amount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColMemo")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseDrillData.pettyCash!.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.transDate}</td>
                          <td className="p-2 max-w-[120px] truncate">{r.store || "—"}</td>
                          <td className="p-2 max-w-[160px] truncate" title={r.accountSubjectName || ""}>
                            {r.accountSubjectCode
                              ? `${r.accountSubjectCode} ${r.accountSubjectName || ""}`.trim()
                              : "—"}
                          </td>
                          <td className="p-2 text-right font-mono">{formatBath(r.amount)}</td>
                          <td className="p-2 max-w-[220px] truncate" title={r.memo || ""}>
                            {r.memo || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!(
              (purchaseDrillData.isHqOrders && (purchaseDrillData.hqOutbounds?.length || 0) > 0) ||
              (purchaseDrillData.isHqOrders && (purchaseDrillData.hqOrders?.length || 0) > 0) ||
              purchaseDrillData.inbound.length > 0 ||
              purchaseDrillData.bankPayments.length > 0 ||
              (purchaseDrillData.pettyCash?.length || 0) > 0
            ) && (
              <p className="text-sm text-muted-foreground py-4">{t("pL_purchaseDrillEmpty")}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
