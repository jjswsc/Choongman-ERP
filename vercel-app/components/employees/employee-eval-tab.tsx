"use client"

import * as React from "react"
import { RotateCw } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  getEvaluationItems,
  saveEvaluationResult,
  type AdminEmployeeItem,
} from "@/lib/api-client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const EVAL_WEIGHTS = { 메뉴숙련: 0.4, 원가정확도: 0.2, 위생: 0.2, 태도: 0.2 }
const EVAL_GRADE_CUT = [4.8, 4.5, 4.0, 3.5, 3.0, 2.0]
const EVAL_GRADE_LABEL = ["S", "A", "B", "C", "D", "E", "F"]
const EVAL_INCIDENT_TYPES = [
  "반복 과다 소스",
  "위생 관련 이력",
  "고객 관련",
  "개선 없음",
  "안전 사고(화상/미끄럼/낙상 등)",
]
const SHIFT_OPTIONS = ["Kitchen", "Service", "Morning", "Evening", "Full"]

interface EvalItem {
  id: string | number
  main: string
  sub: string
  name: string
  use?: boolean
}

interface EvalSection {
  main: string
  items: EvalItem[]
}

interface IncidentRow {
  type: string
  typeOther: string
  occurred: "Yes" | "No"
  date: string
  details: string
}

export interface EmployeeEvalTabProps {
  stores: string[]
  employees: (AdminEmployeeItem & { finalGrade?: string })[]
  onSaved?: () => void
}

export function EmployeeEvalTab({
  stores,
  employees,
  onSaved,
}: EmployeeEvalTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const evaluatorName = auth?.user || auth?.store || ""

  const [evalStore, setEvalStore] = React.useState("")
  const [evalEmployee, setEvalEmployee] = React.useState("")
  const [evalType, setEvalType] = React.useState<"kitchen" | "service">("kitchen")
  const [evalDate, setEvalDate] = React.useState(
    () => new Date().toISOString().slice(0, 10)
  )
  const [evalShift, setEvalShift] = React.useState("Kitchen")
  const [evalId, setEvalId] = React.useState("")
  const [sections, setSections] = React.useState<EvalSection[]>([])
  const [scores, setScores] = React.useState<Record<string, string>>({})
  const [remarks, setRemarks] = React.useState<Record<string, string>>({})
  const [soloOK, setSoloOK] = React.useState<Record<string, boolean>>({})
  const [peakOK, setPeakOK] = React.useState<Record<string, boolean>>({})
  const [canTrain, setCanTrain] = React.useState<Record<string, boolean>>({})
  const [incidents, setIncidents] = React.useState<IncidentRow[]>([
    { type: EVAL_INCIDENT_TYPES[0], typeOther: "", occurred: "No", date: "", details: "" },
  ])
  const [trainingNeeded, setTrainingNeeded] = React.useState("")
  const [coach, setCoach] = React.useState("")
  const [targetDate, setTargetDate] = React.useState("")
  const [reevalDate, setReevalDate] = React.useState("")
  const [totalMemo, setTotalMemo] = React.useState("")
  const [finalGrade, setFinalGrade] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const employeeList = React.useMemo(() => {
    if (!evalStore || evalStore === "All") return []
    return employees.filter((e) => String(e.store || "").trim() === evalStore)
  }, [employees, evalStore])

  const selectedEmp = React.useMemo(
    () => employeeList.find((e) => e.name === evalEmployee),
    [employeeList, evalEmployee]
  )

  const loadForm = React.useCallback(async () => {
    setLoading(true)
    try {
      const items = await getEvaluationItems({ type: evalType, activeOnly: true })
      if (!items || items.length === 0) {
        setSections([])
        setLoading(false)
        return
      }
      const bySection: Record<string, EvalItem[]> = {}
      for (const it of items) {
        const sec = it.main || ""
        if (!bySection[sec]) bySection[sec] = []
        bySection[sec].push(it)
      }
      const order =
        evalType === "service"
          ? ["서비스"]
          : ["메뉴숙련", "원가정확도", "위생", "태도"]
      const secs: EvalSection[] = order
        .filter((o) => bySection[o]?.length)
        .map((o) => ({ main: o, items: bySection[o] }))
      setSections(secs)
      const initScores: Record<string, string> = {}
      const initRemarks: Record<string, string> = {}
      const initSolo: Record<string, boolean> = {}
      const initPeak: Record<string, boolean> = {}
      const initTrain: Record<string, boolean> = {}
      for (const s of secs) {
        for (const it of s.items) {
          const key = String(it.id)
          initScores[key] = "5"
          initRemarks[key] = ""
          if (it.main === "메뉴숙련") {
            initSolo[key] = false
            initPeak[key] = false
            initTrain[key] = false
          }
        }
      }
      setScores(initScores)
      setRemarks(initRemarks)
      setSoloOK(initSolo)
      setPeakOK(initPeak)
      setCanTrain(initTrain)
    } catch {
      setSections([])
    } finally {
      setLoading(false)
    }
  }, [evalType])

  const updateTotals = React.useCallback(() => {
    let menuAvg = 0,
      costAvg = 0,
      hygieneAvg = 0,
      attitudeAvg = 0,
      serviceAvg = 0
    let menuN = 0,
      costN = 0,
      hygieneN = 0,
      attitudeN = 0,
      serviceN = 0
    for (const s of sections) {
      for (const it of s.items) {
        const v = Number(scores[String(it.id)] || 5)
        if (s.main === "메뉴숙련") {
          menuAvg += v
          menuN++
        } else if (s.main === "원가정확도") {
          costAvg += v
          costN++
        } else if (s.main === "위생") {
          hygieneAvg += v
          hygieneN++
        } else if (s.main === "태도") {
          attitudeAvg += v
          attitudeN++
        } else if (s.main === "서비스") {
          serviceAvg += v
          serviceN++
        }
      }
    }
    if (menuN) menuAvg /= menuN
    if (costN) costAvg /= costN
    if (hygieneN) hygieneAvg /= hygieneN
    if (attitudeN) attitudeAvg /= attitudeN
    if (serviceN) serviceAvg /= serviceN

    let total = 0
    if (serviceN > 0) total = serviceAvg
    else
      total =
        menuAvg * EVAL_WEIGHTS.메뉴숙련 +
        costAvg * EVAL_WEIGHTS.원가정확도 +
        hygieneAvg * EVAL_WEIGHTS.위생 +
        attitudeAvg * EVAL_WEIGHTS.태도

    let grade = "-"
    if (total > 0) {
      for (let i = 0; i < EVAL_GRADE_CUT.length; i++) {
        if (total >= EVAL_GRADE_CUT[i]) {
          grade = EVAL_GRADE_LABEL[i]
          break
        }
      }
      if (grade === "-") grade = EVAL_GRADE_LABEL[EVAL_GRADE_LABEL.length - 1]
    }
    return { total, grade }
  }, [sections, scores])

  const { total: computedTotal, grade: computedGrade } = updateTotals()
  const displayGrade = finalGrade || (computedGrade !== "-" ? computedGrade : "")

  const handleSave = async () => {
    if (!evalStore || !evalEmployee || !evalDate) {
      alert(t("eval_store_first"))
      return
    }
    if (!confirm(t("eval_confirm_save"))) return
    setSaving(true)
    try {
      const sectionKey: Record<string, string> = {
        메뉴숙련: "menu",
        원가정확도: "cost",
        위생: "hygiene",
        태도: "attitude",
        서비스: "menu",
      }
      const payloadSections: Record<string, unknown[]> = {
        menu: [],
        cost: [],
        hygiene: [],
        attitude: [],
      }
      for (const s of sections) {
        const key = sectionKey[s.main]
        if (!key || !payloadSections[key]) continue
        for (const it of s.items) {
          const k = String(it.id)
          const rec: Record<string, unknown> = {
            id: k,
            main: it.main,
            sub: it.sub,
            name: it.name,
            score: scores[k] || "5",
            notes: remarks[k] || "",
          }
          if (it.main === "메뉴숙련") {
            rec.soloOK = soloOK[k] || false
            rec.peakOK = peakOK[k] || false
            rec.canTrain = canTrain[k] || false
          }
          payloadSections[key].push(rec)
        }
      }

      const incidentPayload = incidents
        .filter((r) => r.type || r.typeOther)
        .map((r) => ({
          type: r.type === "__기타__" ? r.typeOther : r.type,
          occurred: r.occurred,
          date: r.date,
          details: r.details,
        }))

      await saveEvaluationResult({
        type: evalType,
        id: evalId || undefined,
        date: evalDate,
        store: evalStore,
        employeeName: evalEmployee,
        evaluator: evaluatorName,
        finalGrade: displayGrade || computedGrade,
        memo: totalMemo,
        jsonData: {
          sections: payloadSections,
          incidents: incidentPayload,
          actionPlan: {
            trainingNeeded,
            coach,
            targetDate,
            reevalDate,
          },
          totalScore: computedTotal,
          grade: displayGrade || computedGrade,
        },
      })
      alert(
        lang === "ko" ? "저장되었습니다." : "Saved."
      )
      setEvalId("")
      setTotalMemo("")
      setTrainingNeeded("")
      setCoach("")
      setTargetDate("")
      setReevalDate("")
      setIncidents([
        {
          type: EVAL_INCIDENT_TYPES[0],
          typeOther: "",
          occurred: "No",
          date: "",
          details: "",
        },
      ])
      onSaved?.()
    } catch (e) {
      console.error(e)
      alert(lang === "ko" ? "저장 실패" : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const addIncident = () => {
    setIncidents((p) => [
      ...p,
      {
        type: EVAL_INCIDENT_TYPES[0],
        typeOther: "",
        occurred: "No",
        date: "",
        details: "",
      },
    ])
  }

  const removeIncident = (idx: number) => {
    setIncidents((p) => p.filter((_, i) => i !== idx))
  }

  const sectionTitles: Record<string, string> =
    evalType === "service"
      ? { 서비스: "서비스 평가 항목 (1-5)" }
      : {
          메뉴숙련: "2) 메뉴 숙련 (1-5)",
          원가정확도: "3) 조리 정확도·원가 관리 (1-5)",
          위생: "4) 위생·작업 습관 (1-5)",
          태도: "5) 태도·피크타임 수행 (1-5)",
        }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {t("label_store")}
            </label>
            <Select
              value={evalStore || "__none__"}
              onValueChange={(v) => {
                setEvalStore(v === "__none__" ? "" : v)
                setEvalEmployee("")
              }}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder={t("emp_select_employee")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">-</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {t("label_employee")}
            </label>
            <Select
              value={evalEmployee || "__none__"}
              onValueChange={(v) =>
                setEvalEmployee(v === "__none__" ? "" : v)
              }
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder={t("eval_store_first")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {t("emp_select_employee")}
                </SelectItem>
                {employeeList.map((e) => (
                  <SelectItem key={e.name} value={e.name || ""}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              평가 유형
            </label>
            <Select
              value={evalType}
              onValueChange={(v) => setEvalType(v as "kitchen" | "service")}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kitchen">🍳 주방 직원</SelectItem>
                <SelectItem value="service">🍽 서비스 직원</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {t("eval_date")}
            </label>
            <Input
              type="date"
              value={evalDate}
              onChange={(e) => setEvalDate(e.target.value)}
              className="h-8 w-[130px] text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {t("eval_shift")}
            </label>
            <Select value={evalShift} onValueChange={setEvalShift}>
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHIFT_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedEmp?.photo && (
            <div className="h-10 w-10 overflow-hidden rounded-lg border bg-muted">
              <img
                src={selectedEmp.photo}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {t("label_evaluator")}
            </label>
            <Input
              value={evaluatorName}
              readOnly
              className="h-8 w-[120px] text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={loadForm}
            disabled={loading}
            className="h-8"
          >
            {loading ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              t("eval_load_form")
            )}
          </Button>
        </div>
      </div>

      {sections.length > 0 && (
        <>
          {sections.map((sec) => (
            <div
              key={sec.main}
              className="rounded-lg border border-border bg-card p-4"
            >
              <h6 className="mb-3 border-b pb-2 text-sm font-bold">
                {sectionTitles[sec.main] || sec.main}
              </h6>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-center font-semibold">
                        NO
                      </th>
                      {sec.main === "메뉴숙련" && (
                        <>
                          <th className="px-3 py-2 text-left font-semibold">
                            Category
                          </th>
                          <th className="px-3 py-2 text-left font-semibold">
                            Menu Item
                          </th>
                        </>
                      )}
                      {sec.main !== "메뉴숙련" && (
                        <th className="px-3 py-2 text-left font-semibold">
                          {t("eval_item")}
                        </th>
                      )}
                      <th className="px-3 py-2 text-center font-semibold">
                        Score (1-5)
                      </th>
                      {sec.main === "메뉴숙련" && (
                        <>
                          <th className="px-3 py-2 text-center font-semibold">
                            Solo OK
                          </th>
                          <th className="px-3 py-2 text-center font-semibold">
                            Peak OK
                          </th>
                          <th className="px-3 py-2 text-center font-semibold">
                            Can Train
                          </th>
                        </>
                      )}
                      <th className="px-3 py-2 text-left font-semibold">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.items.map((it) => {
                      const key = String(it.id)
                      return (
                        <tr key={key} className="border-b">
                          <td className="px-3 py-2 text-center font-medium">
                            {it.id}
                          </td>
                          {sec.main === "메뉴숙련" && (
                            <>
                              <td className="px-3 py-2">{it.sub}</td>
                              <td className="px-3 py-2">{it.name}</td>
                            </>
                          )}
                          {sec.main !== "메뉴숙련" && (
                            <td className="px-3 py-2">{it.name}</td>
                          )}
                          <td className="px-3 py-2">
                            <select
                              value={scores[key] || "5"}
                              onChange={(e) =>
                                setScores((p) => ({
                                  ...p,
                                  [key]: e.target.value,
                                }))
                              }
                              className="h-7 w-14 rounded border bg-background px-1 text-center text-xs"
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </td>
                          {sec.main === "메뉴숙련" && (
                            <>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={soloOK[key] || false}
                                  onChange={(e) =>
                                    setSoloOK((p) => ({
                                      ...p,
                                      [key]: e.target.checked,
                                    }))
                                  }
                                  className="h-3.5 w-3.5"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={peakOK[key] || false}
                                  onChange={(e) =>
                                    setPeakOK((p) => ({
                                      ...p,
                                      [key]: e.target.checked,
                                    }))
                                  }
                                  className="h-3.5 w-3.5"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={canTrain[key] || false}
                                  onChange={(e) =>
                                    setCanTrain((p) => ({
                                      ...p,
                                      [key]: e.target.checked,
                                    }))
                                  }
                                  className="h-3.5 w-3.5"
                                />
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2">
                            <Input
                              value={remarks[key] || ""}
                              onChange={(e) =>
                                setRemarks((p) => ({
                                  ...p,
                                  [key]: e.target.value,
                                }))
                              }
                              className="h-7 text-xs"
                              placeholder="비고"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs">
                {sec.main} 평균:{" "}
                {sec.items.length
                  ? (
                      sec.items.reduce(
                        (a, it) => a + Number(scores[String(it.id)] || 5),
                        0
                      ) / sec.items.length
                    ).toFixed(2)
                  : "-"}
              </p>
            </div>
          ))}

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            {evalType === "kitchen" && (
              <p className="mb-2 text-xs text-muted-foreground">
                {t("eval_weight")}
              </p>
            )}
            <p className="text-sm font-bold">
              {t("eval_total_score")}:{" "}
              {computedTotal > 0 ? computedTotal.toFixed(2) : "-"}{" "}
              | {t("eval_final_grade_label")}:{" "}
              <select
                value={displayGrade || computedGrade}
                onChange={(e) => setFinalGrade(e.target.value)}
                className="ml-1 inline-block h-7 w-20 rounded border bg-background px-2 text-xs"
              >
                {EVAL_GRADE_LABEL.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h6 className="mb-3 border-b pb-2 text-sm font-bold">
              {t("eval_incident")}
            </h6>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2">{t("eval_issue_type")}</th>
                    <th className="w-[90px] px-3 py-2">{t("eval_occur")}</th>
                    <th className="w-[120px] px-3 py-2">{t("label_date")}</th>
                    <th className="px-3 py-2">{t("eval_detail")}</th>
                    <th className="w-[50px] px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((inc, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="px-3 py-2">
                        <select
                          value={inc.type}
                          onChange={(e) =>
                            setIncidents((p) => {
                              const n = [...p]
                              n[idx] = {
                                ...n[idx],
                                type: e.target.value,
                              }
                              return n
                            })
                          }
                          className="h-7 w-full rounded border bg-background px-2 text-xs"
                        >
                          {EVAL_INCIDENT_TYPES.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                          <option value="__기타__">기타(직접입력)</option>
                        </select>
                        {inc.type === "__기타__" && (
                          <Input
                            value={inc.typeOther}
                            onChange={(e) =>
                              setIncidents((p) => {
                                const n = [...p]
                                n[idx] = { ...n[idx], typeOther: e.target.value }
                                return n
                              })
                            }
                            placeholder="기타 유형"
                            className="mt-1 h-7 text-xs"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={inc.occurred}
                          onChange={(e) =>
                            setIncidents((p) => {
                              const n = [...p]
                              n[idx] = {
                                ...n[idx],
                                occurred: e.target.value as "Yes" | "No",
                              }
                              return n
                            })
                          }
                          className="h-7 w-full rounded border bg-background px-2 text-xs"
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          value={inc.date}
                          onChange={(e) =>
                            setIncidents((p) => {
                              const n = [...p]
                              n[idx] = { ...n[idx], date: e.target.value }
                              return n
                            })
                          }
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={inc.details}
                          onChange={(e) =>
                            setIncidents((p) => {
                              const n = [...p]
                              n[idx] = { ...n[idx], details: e.target.value }
                              return n
                            })
                          }
                          placeholder={t("eval_detail")}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeIncident(idx)}
                          className="text-destructive hover:underline"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addIncident}
              className="mt-2 text-xs text-primary hover:underline"
            >
              + 행 추가
            </button>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h6 className="mb-3 border-b pb-2 text-sm font-bold">
              {t("eval_action_plan")}
            </h6>
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="mb-1 block text-xs">{t("eval_training")}</label>
                <Input
                  value={trainingNeeded}
                  onChange={(e) => setTrainingNeeded(e.target.value)}
                  className="h-8 w-[180px] text-xs"
                  placeholder="Training Needed"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs">{t("eval_coach")}</label>
                <Input
                  value={coach}
                  onChange={(e) => setCoach(e.target.value)}
                  className="h-8 w-[180px] text-xs"
                  placeholder="Coach/Trainer"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs">
                  {t("eval_target_date")}
                </label>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs">
                  {t("eval_reeval_date")}
                </label>
                <Input
                  type="date"
                  value={reevalDate}
                  onChange={(e) => setReevalDate(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">
              {t("eval_total_comment")}
            </label>
            <textarea
              value={totalMemo}
              onChange={(e) => setTotalMemo(e.target.value)}
              rows={2}
              placeholder={t("placeholder_comment")}
              className="w-full rounded border bg-background px-3 py-2 text-xs"
            />
          </div>

          <Button
            className="w-full py-6 font-bold"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t("loading") : t("eval_save")}
          </Button>
        </>
      )}

      {sections.length === 0 && !loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("eval_no_items_hint")}
        </p>
      )}
    </div>
  )
}
