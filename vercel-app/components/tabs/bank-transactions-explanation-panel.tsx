"use client"

import { TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { bankDepositLoanCategorySelectValue } from "@/lib/bank-loan-categories"
import { BANK_WITHDRAW_UI_CATEGORIES } from "@/lib/bank-expense-via-expense-mgmt"
import { Button } from "@/components/ui/button"
import { Pencil, Plus, Save, Trash2 } from "lucide-react"
import type { AccountSubjectItem, BankMemoRule } from "@/lib/api-client"
import type * as React from "react"

export type BankTransactionsExplanationPanelProps = {
  accountSubjectOptions: AccountSubjectItem[]
  asDisplayName: (a: AccountSubjectItem) => string
  editingMemoRuleId: number | null
  getCategoryLabel: (cat: string, transType: string) => string
  handleAddMemoRule: () => Promise<void>
  handleCancelEditMemoRule: () => void
  handleDeleteMemoRule: (id: number) => Promise<void>
  handleEditMemoRule: (rule: BankMemoRule) => void
  memoRules: BankMemoRule[]
  newRuleAccountSubjectId: string
  newRuleCategory: string
  newRuleKeyword: string
  newRuleTransType: "deposit" | "withdraw"
  renderDepositCategorySelectItems: (currentCategory: string, hidePosRevenue: boolean, opts?: { includeQrChip?: boolean; }) => React.JSX.Element
  revenueAccountOptions: AccountSubjectItem[]
  savingMemoRule: boolean
  setNewRuleAccountSubjectId: React.Dispatch<React.SetStateAction<string>>
  setNewRuleCategory: React.Dispatch<React.SetStateAction<string>>
  setNewRuleKeyword: React.Dispatch<React.SetStateAction<string>>
  setNewRuleTransType: React.Dispatch<React.SetStateAction<"deposit" | "withdraw">>
  t: (k: string) => string
}

export function BankTransactionsExplanationPanel({
  accountSubjectOptions,
  asDisplayName,
  editingMemoRuleId,
  getCategoryLabel,
  handleAddMemoRule,
  handleCancelEditMemoRule,
  handleDeleteMemoRule,
  handleEditMemoRule,
  memoRules,
  newRuleAccountSubjectId,
  newRuleCategory,
  newRuleKeyword,
  newRuleTransType,
  renderDepositCategorySelectItems,
  revenueAccountOptions,
  savingMemoRule,
  setNewRuleAccountSubjectId,
  setNewRuleCategory,
  setNewRuleKeyword,
  setNewRuleTransType,
  t,
}: BankTransactionsExplanationPanelProps) {
  return (
    <TabsContent value="explanation" className="mt-0">
      <Card>
        <CardContent className="pt-4">
          <div className="prose prose-sm dark:prose-invert max-w-none space-y-5 text-sm">
            <h3 className="text-lg font-semibold border-b pb-2">{t("bankManualTitle")}</h3>
            <p className="text-muted-foreground">{t("bankManualDesc")}</p>

            <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">{t("bankPosReceivableDepositTitle")}</p>
              <p className="mt-1 leading-relaxed">{t("bankPosStoreCategoryLockedHint")}</p>
              <p className="mt-1 leading-relaxed text-muted-foreground dark:text-amber-100/80">
                {t("bankPosReceivableDepositBody")}
              </p>
            </div>

            <div className="rounded-lg bg-muted/30 p-4 space-y-2">
              <h4 className="font-medium">■ {t("bankManualScreenLayout")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>{t("bankManualScreenInput")}</li>
                <li>{t("bankManualScreenQuery")}</li>
                <li>{t("bankManualScreenAccountSubjects")}</li>
                <li>{t("bankManualScreenExplanation")}</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium pt-2">■ {t("bankManualS1Title")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                <li>{t("bankManualS1_1")}</li>
                <li>{t("bankManualS1_2")}</li>
                <li>{t("bankManualS1_3")}</li>
                <li>{t("bankManualS1_4")}</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium pt-2">■ {t("bankManualS2Title")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                <li>{t("bankManualS2_1")}</li>
                <li>{t("bankManualS2_2")}</li>
                <li>{t("bankManualS2_3")}</li>
                <li>{t("bankManualS2_4")}</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium pt-2">■ {t("bankManualS3Title")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                <li>{t("bankManualS3_1")}</li>
                <li>{t("bankManualS3_2")}</li>
                <li>{t("bankManualS3_3")}</li>
                <li>{t("bankManualS3_4")}</li>
                <li>{t("bankManualS3PosReceivable")}</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium pt-2">■ {t("bankManualS4Title")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                <li>{t("bankManualS4_1")}</li>
                <li>{t("bankManualS4_2")}</li>
                <li>{t("bankManualS4_3")}</li>
                <li>{t("bankManualS4_4")}</li>
                <li>{t("bankManualS4_5")}</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium pt-2">■ {t("bankManualS5Title")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                <li>{t("bankManualS5_1")}</li>
                <li>{t("bankManualS5_2")}</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium pt-2">■ {t("bankManualS6Title")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2">
                <li>{t("bankManualS6_1")}</li>
                <li>{t("bankManualS6_2")}</li>
                <li>{t("bankManualS6_3")}</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium pt-2">■ {t("bankManualS7Title")}</h4>
              <p className="text-muted-foreground mt-1">{t("bankManualS7_1")}</p>
            </div>

            <h4 className="font-medium pt-4 border-t mt-6 pt-4">■ {t("bankManualS8Title")}</h4>
            <p className="text-muted-foreground">{t("bankManualS8_1")}</p>
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("bankMemoRuleKeyword") || "키워드"}</label>
                  <Input
                    placeholder={t("bankMemoRuleKeywordPh")}
                    value={newRuleKeyword}
                    onChange={(e) => setNewRuleKeyword(e.target.value)}
                    className="w-[140px] h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("pettyColType") || "유형"}</label>
                  <Select value={newRuleTransType} onValueChange={(v) => {
                    setNewRuleTransType(v as "deposit" | "withdraw")
                    setNewRuleCategory("")
                    setNewRuleAccountSubjectId("")
                  }}>
                    <SelectTrigger className="w-[90px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposit">{t("bankDeposit")}</SelectItem>
                      <SelectItem value="withdraw">{t("bankWithdraw")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("bankCategoryLabel") || "용도"}</label>
                  <Select
                    value={
                      newRuleTransType === "deposit"
                        ? bankDepositLoanCategorySelectValue(newRuleCategory)
                        : newRuleCategory
                    }
                    onValueChange={setNewRuleCategory}
                  >
                    <SelectTrigger className="w-[130px] h-9">
                      <SelectValue placeholder={t("optional")} />
                    </SelectTrigger>
                    <SelectContent>
                      {newRuleTransType === "deposit" ? (
                        renderDepositCategorySelectItems(newRuleCategory, true, { includeQrChip: false })
                      ) : (
                        <>
                          {BANK_WITHDRAW_UI_CATEGORIES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {getCategoryLabel(value, "withdraw")}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("accountSubject") || "계정과목"}</label>
                  <Select value={newRuleAccountSubjectId || "__none__"} onValueChange={(v) => setNewRuleAccountSubjectId(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue placeholder={t("placeholderOptional")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— {t("accountSubject") || "계정과목"}</SelectItem>
                      {(newRuleTransType === "deposit" ? revenueAccountOptions : accountSubjectOptions).map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={handleAddMemoRule} disabled={savingMemoRule || !newRuleKeyword.trim()}>
                  {savingMemoRule ? "..." : editingMemoRuleId ? <Save className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                  {editingMemoRuleId ? (t("btn_save") || "저장") : t("btn_add")}
                </Button>
                {editingMemoRuleId && (
                  <Button size="sm" variant="outline" onClick={handleCancelEditMemoRule} disabled={savingMemoRule}>
                    {t("cancel")}
                  </Button>
                )}
              </div>
              {memoRules.length > 0 && (
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left">{t("bankMemoRuleKeyword") || "키워드"}</th>
                        <th className="p-2 text-left">{t("pettyColType") || "유형"}</th>
                        <th className="p-2 text-left">{t("bankCategoryLabel") || "용도"}</th>
                        <th className="p-2 text-left">{t("accountSubject") || "계정과목"}</th>
                        <th className="p-2 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {memoRules.map((rule) => {
                        const isEditing = editingMemoRuleId === (rule.id ?? 0)
                        const catLabel = getCategoryLabel(String(rule.category || ""), rule.transType)
                        const sub = (rule.transType === "deposit" ? revenueAccountOptions : accountSubjectOptions).find((a) => a.id === rule.accountSubjectId)
                        return (
                          <tr key={rule.id} className={`border-t ${isEditing ? "bg-primary/5" : ""}`}>
                            <td className="p-2 font-mono text-sm">{rule.keyword}</td>
                            <td className="p-2">
                              {isEditing ? (
                                <Select value={newRuleTransType} onValueChange={(v) => { setNewRuleTransType(v as "deposit" | "withdraw"); setNewRuleCategory(""); setNewRuleAccountSubjectId("") }}>
                                  <SelectTrigger className="h-8 w-[90px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="deposit">{t("bankDeposit")}</SelectItem>
                                    <SelectItem value="withdraw">{t("bankWithdraw")}</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                rule.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")
                              )}
                            </td>
                            <td className="p-2">
                              {isEditing ? (
                                <Select
                                  value={
                                    newRuleTransType === "deposit"
                                      ? bankDepositLoanCategorySelectValue(newRuleCategory)
                                      : newRuleCategory
                                  }
                                  onValueChange={setNewRuleCategory}
                                >
                                  <SelectTrigger className="h-8 w-[130px]">
                                    <SelectValue placeholder={t("optional")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {newRuleTransType === "deposit" ? (
                                      renderDepositCategorySelectItems(newRuleCategory, true, {
                                        includeQrChip: false,
                                      })
                                    ) : (
                                      <>
                                        {BANK_WITHDRAW_UI_CATEGORIES.map((value) => (
                                          <SelectItem key={value} value={value}>
                                            {getCategoryLabel(value, "withdraw")}
                                          </SelectItem>
                                        ))}
                                      </>
                                    )}
                                  </SelectContent>
                                </Select>
                              ) : (
                                catLabel
                              )}
                            </td>
                            <td className="p-2">
                              {isEditing ? (
                                <Select value={newRuleAccountSubjectId || "__none__"} onValueChange={(v) => setNewRuleAccountSubjectId(v === "__none__" ? "" : v)}>
                                  <SelectTrigger className="h-8 w-[160px]">
                                    <SelectValue placeholder={t("placeholderOptional")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">— {t("accountSubject") || "계정과목"}</SelectItem>
                                    {(newRuleTransType === "deposit" ? revenueAccountOptions : accountSubjectOptions).map((a) => (
                                      <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-muted-foreground">{sub ? `${sub.code} ${asDisplayName(sub)}` : "—"}</span>
                              )}
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-1">
                                {isEditing ? (
                                  <>
                                    <Button size="sm" variant="default" className="h-8 gap-1 text-xs" onClick={handleAddMemoRule} disabled={savingMemoRule || !newRuleCategory}>
                                      {savingMemoRule ? "..." : <><Save className="h-3.5 w-3.5" />{t("btn_save") || "저장"}</>}
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-8" onClick={handleCancelEditMemoRule} disabled={savingMemoRule}>
                                      {t("cancel")}
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="sm" variant="outline" className="h-8 w-8 border-primary/30 bg-primary/10 p-0 text-primary hover:bg-primary/15" onClick={() => handleEditMemoRule(rule)} title={t("btn_edit") || "수정"}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => rule.id && handleDeleteMemoRule(rule.id)} title={t("delete")}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4 mt-6">
              <h4 className="font-medium text-amber-800 dark:text-amber-200">■ {t("bankManualNotesTitle")}</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-2 text-xs">
                <li>{t("bankManualNotes_1")}</li>
                <li>{t("bankManualNotes_2")}</li>
                <li>{t("bankManualNotes_3")}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  )
}
