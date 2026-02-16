"use client"

import * as React from "react"
import { RotateCw } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import {
  getEvaluationItems,
  saveEvaluationResult,
  translateTexts,
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
import { compressImageForUpload } from "@/lib/utils"

const EVAL_WEIGHTS = { 메뉴숙련: 0.4, 원가정확도: 0.2, 위생: 0.2, 태도: 0.2 }
const EVAL_GRADE_CUT = [4.8, 4.5, 4.0, 3.5, 3.0, 2.0]
const EVAL_GRADE_LABEL = ["S", "A", "B", "C", "D", "E", "F"]
const EVAL_INCIDENT_KEYS = [
  "eval_incident_1",
  "eval_incident_2",
  "eval_incident_3",
  "eval_incident_4",
  "eval_incident_5",
] as const
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
  date: string
  details: string
  warningLetterChecked: boolean
  warningLetterUrl: string
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
  const [incidents, setIncidents] = React.useState<IncidentRow[]>(() => [
    { type: EVAL_INCIDENT_KEYS[0], typeOther: "", date: "", details: "", warningLetterChecked: false, warningLetterUrl: "" },
  ])
  const warningLetterInputRef = React.useRef<HTMLInputElement>(null)
  const warningLetterTargetIdxRef = React.useRef<number>(0)
  const [uploadingWarningForIdx, setUploadingWarningForIdx] = React.useState<number | null>(null)
  const [warningLetterViewUrl, setWarningLetterViewUrl] = React.useState<string | null>(null)
  const [trainingNeeded, setTrainingNeeded] = React.useState("")
  const [coach, setCoach] = React.useState("")
  const [targetDate, setTargetDate] = React.useState("")
  const [reevalDate, setReevalDate] = React.useState("")
  const [totalMemo, setTotalMemo] = React.useState("")
  const [finalGrade, setFinalGrade] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [evalTransMap, setEvalTransMap] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const isManager = isManagerRole(auth?.role || "")
    const userStore = (auth?.store || "").trim()
    if (isManager && userStore && stores.includes(userStore)) {
      setEvalStore(userStore)
    }
  }, [auth?.role, auth?.store, stores])
  const [userTextTrans, setUserTextTrans] = React.useState<{
    totalMemo: string
    incidents: { details: string; typeOther: string }[]
    remarks: Record<string, string>
    trainingNeeded: string
    coach: string
  }>({ totalMemo: "", incidents: [], remarks: {}, trainingNeeded: "", coach: "" })

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

  React.useEffect(() => {
    if (sections.length === 0) {
      setEvalTransMap({})
      return
    }
    const texts: string[] = []
    for (const sec of sections) {
      if (sec.main && sec.main.trim()) texts.push(sec.main.trim())
      for (const it of sec.items) {
        if (it.sub && it.sub.trim()) texts.push(it.sub.trim())
        if (it.name && it.name.trim()) texts.push(it.name.trim())
      }
    }
    const unique = [...new Set(texts)].filter(Boolean).slice(0, 100)
    if (unique.length === 0) {
      setEvalTransMap({})
      return
    }
    let cancelled = false
    translateTexts(unique, lang).then((translated) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      unique.forEach((txt, i) => {
        map[txt] = translated[i] ?? txt
      })
      setEvalTransMap(map)
    }).catch(() => setEvalTransMap({}))
    return () => { cancelled = true }
  }, [sections, lang])

  React.useEffect(() => {
    if (sections.length === 0) {
      setUserTextTrans({ totalMemo: "", incidents: [], remarks: {}, trainingNeeded: "", coach: "" })
      return
    }
    const texts: string[] = []
    const keys: { type: string; idx?: number; key?: string }[] = []
    if ((totalMemo || "").trim()) {
      texts.push(totalMemo.trim())
      keys.push({ type: "totalMemo" })
    }
    for (let i = 0; i < incidents.length; i++) {
      const d = (incidents[i]?.details || "").trim()
      if (d) {
        texts.push(d)
        keys.push({ type: "incident", idx: i })
      }
      const o = (incidents[i]?.typeOther || "").trim()
      if (o) {
        texts.push(o)
        keys.push({ type: "incidentOther", idx: i })
      }
    }
    if ((trainingNeeded || "").trim()) {
      texts.push(trainingNeeded.trim())
      keys.push({ type: "trainingNeeded" })
    }
    if ((coach || "").trim()) {
      texts.push(coach.trim())
      keys.push({ type: "coach" })
    }
    for (const [k, v] of Object.entries(remarks)) {
      if ((v || "").trim()) {
        texts.push(v.trim())
        keys.push({ type: "remark", key: k })
      }
    }
    if (texts.length === 0) {
      setUserTextTrans({ totalMemo: "", incidents: [], remarks: {}, trainingNeeded: "", coach: "" })
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      translateTexts(texts, lang).then((translated) => {
        if (cancelled) return
        const next: {
          totalMemo: string
          incidents: { details: string; typeOther: string }[]
          remarks: Record<string, string>
          trainingNeeded: string
          coach: string
        } = {
          totalMemo: "",
          incidents: incidents.map(() => ({ details: "", typeOther: "" })),
          remarks: {},
          trainingNeeded: "",
          coach: "",
        }
        keys.forEach((key, i) => {
          const t = translated[i] ?? texts[i] ?? ""
          if (key.type === "totalMemo") next.totalMemo = t
          else if (key.type === "trainingNeeded") next.trainingNeeded = t
          else if (key.type === "coach") next.coach = t
          else if (key.type === "incident" && key.idx !== undefined) {
            if (!next.incidents[key.idx]) next.incidents[key.idx] = { details: "", typeOther: "" }
            next.incidents[key.idx].details = t
          } else if (key.type === "incidentOther" && key.idx !== undefined) {
            if (!next.incidents[key.idx]) next.incidents[key.idx] = { details: "", typeOther: "" }
            next.incidents[key.idx].typeOther = t
          } else if (key.type === "remark" && key.key) next.remarks[key.key] = t
        })
        setUserTextTrans(next)
      }).catch(() =>
        setUserTextTrans({ totalMemo: "", incidents: [], remarks: {}, trainingNeeded: "", coach: "" })
      )
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [totalMemo, incidents, remarks, trainingNeeded, coach, lang, sections.length])

  const getEvalTrans = (text: string) =>
    (text && evalTransMap[text]) || text || ""

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
          date: r.date,
          details: r.details,
          warningLetterChecked: r.warningLetterChecked,
          warningLetterUrl: r.warningLetterUrl || "",
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
      alert(t("eval_saved_ok"))
      setEvalId("")
      setTotalMemo("")
      setTrainingNeeded("")
      setCoach("")
      setTargetDate("")
      setReevalDate("")
      setIncidents([
        {
          type: EVAL_INCIDENT_KEYS[0],
          typeOther: "",
          date: "",
          details: "",
          warningLetterChecked: false,
          warningLetterUrl: "",
        },
      ])
      onSaved?.()
    } catch (e) {
      console.error(e)
      alert(t("eval_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  const addIncident = () => {
    setIncidents((p) => [
      ...p,
      {
        type: EVAL_INCIDENT_KEYS[0],
        typeOther: "",
        date: "",
        details: "",
        warningLetterChecked: false,
        warningLetterUrl: "",
      },
    ])
  }

  const handleWarningLetterChange = async (idx: number, file: File | null) => {
    if (!file) return
    setUploadingWarningForIdx(idx)
    try {
      const url = await compressImageForUpload(file)
      setIncidents((p) => {
        const n = [...p]
        n[idx] = { ...n[idx], warningLetterUrl: url, warningLetterChecked: true }
        return n
      })
    } catch (err) {
      console.error(err)
      alert(t("msg_upload_fail"))
    } finally {
      setUploadingWarningForIdx(null)
      if (warningLetterInputRef.current) warningLetterInputRef.current.value = ""
    }
  }

  const removeIncident = (idx: number) => {
    setIncidents((p) => p.filter((_, i) => i !== idx))
  }

  const sectionTitles: Record<string, string> =
    evalType === "service"
      ? { 서비스: t("eval_section_service") }
      : {
          메뉴숙련: t("eval_section_menu"),
          원가정확도: t("eval_section_cost"),
          위생: t("eval_section_hygiene"),
          태도: t("eval_section_attitude"),
        }

  const hasUserTrans =
    userTextTrans.totalMemo ||
    userTextTrans.trainingNeeded ||
    userTextTrans.coach ||
    userTextTrans.incidents.some((i) => i.details || i.typeOther) ||
    Object.keys(userTextTrans.remarks).length > 0

  return (
    <div className="relative space-y-4">
      {sections.length > 0 && hasUserTrans && (
        <div className="fixed right-4 top-20 z-50 max-h-[calc(100vh-6rem)] w-72 overflow-auto rounded-lg border border-border bg-card p-3 shadow-lg">
          <h6 className="mb-2 border-b pb-2 text-xs font-bold">
            {t("eval_translation_preview")}
          </h6>
          <div className="space-y-2 text-xs">
            {userTextTrans.totalMemo && (
              <div>
                <span className="font-medium text-muted-foreground">{t("eval_total_comment")}:</span>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{userTextTrans.totalMemo}</p>
              </div>
            )}
            {userTextTrans.incidents.map((inc, i) =>
              inc.details || inc.typeOther ? (
                <div key={i}>
                  <span className="font-medium text-muted-foreground">
                    {t("eval_incident")} #{i + 1}:
                  </span>
                  {(inc.details || inc.typeOther) && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words">
                      {[inc.typeOther, inc.details].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ) : null
            )}
            {userTextTrans.trainingNeeded && (
              <div>
                <span className="font-medium text-muted-foreground">{t("eval_training")}:</span>
                <p className="mt-0.5">{userTextTrans.trainingNeeded}</p>
              </div>
            )}
            {userTextTrans.coach && (
              <div>
                <span className="font-medium text-muted-foreground">{t("eval_coach")}:</span>
                <p className="mt-0.5">{userTextTrans.coach}</p>
              </div>
            )}
            {Object.entries(userTextTrans.remarks).length > 0 && (
              <div>
                <span className="font-medium text-muted-foreground">{t("eval_notes")}:</span>
                <div className="mt-0.5 space-y-1">
                  {Object.entries(userTextTrans.remarks).map(([k, v]) => (
                    <p key={k} className="whitespace-pre-wrap break-words">
                      #{k}: {v}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
              {t("eval_list_type")}
            </label>
            <Select
              value={evalType}
              onValueChange={(v) => setEvalType(v as "kitchen" | "service")}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kitchen">{t("eval_type_kitchen_emp")}</SelectItem>
                <SelectItem value="service">{t("eval_type_service_emp")}</SelectItem>
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
                {sectionTitles[sec.main] || getEvalTrans(sec.main) || sec.main}
              </h6>
              <div className="overflow-x-auto">
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col style={{ width: "36px" }} />
                    <col style={{ width: sec.main === "메뉴숙련" ? "70px" : "8px" }} />
                    <col style={{ width: sec.main === "메뉴숙련" ? "100px" : undefined }} />
                    <col style={{ width: "64px" }} />
                    <col style={{ width: "44px" }} />
                    <col style={{ width: "44px" }} />
                    <col style={{ width: "52px" }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-2 py-2 text-center font-semibold">NO</th>
                      <th className="px-2 py-2 text-left font-semibold">
                        {sec.main === "메뉴숙련" ? t("eval_col_category") : ""}
                      </th>
                      <th className="px-2 py-2 text-left font-semibold">
                        {sec.main === "메뉴숙련" ? t("eval_col_menu_item") : t("eval_item")}
                      </th>
                      <th className="px-2 py-2 text-center font-semibold w-16 shrink-0">{t("eval_score_range")}</th>
                      <th className="px-2 py-2 text-center font-semibold">{sec.main === "메뉴숙련" ? t("eval_solo_ok") : ""}</th>
                      <th className="px-2 py-2 text-center font-semibold">{sec.main === "메뉴숙련" ? t("eval_peak_ok") : ""}</th>
                      <th className="px-2 py-2 text-center font-semibold">{sec.main === "메뉴숙련" ? t("eval_can_train") : ""}</th>
                      <th className="px-2 py-2 text-left font-semibold">{t("eval_notes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.items.map((it) => {
                      const key = String(it.id)
                      return (
                        <tr key={key} className="border-b">
                          <td className="px-2 py-2 text-center font-medium shrink-0">{it.id}</td>
                          {sec.main === "메뉴숙련" ? (
                            <>
                              <td className="px-2 py-2 truncate">{getEvalTrans(it.sub) || it.sub}</td>
                              <td className="px-2 py-2 truncate">{getEvalTrans(it.name) || it.name}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-2 py-2" />
                              <td className="px-2 py-2 truncate">{getEvalTrans(it.name) || it.name}</td>
                            </>
                          )}
                          <td className="px-2 py-2 w-16 shrink-0">
                            <select
                              value={scores[key] || "5"}
                              onChange={(e) =>
                                setScores((p) => ({
                                  ...p,
                                  [key]: e.target.value,
                                }))
                              }
                              className="h-7 w-full min-w-[3rem] rounded border bg-background px-1 text-center text-xs"
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </td>
                          {sec.main === "메뉴숙련" ? (
                            <>
                              <td className="px-2 py-2 text-center shrink-0">
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
                              <td className="px-2 py-2 text-center shrink-0">
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
                              <td className="px-2 py-2 text-center shrink-0">
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
                          ) : (
                            <>
                              <td className="px-2 py-2" />
                              <td className="px-2 py-2" />
                              <td className="px-2 py-2" />
                            </>
                          )}
                          <td className="px-2 py-2 min-w-[80px]">
                            <Input
                              value={remarks[key] || ""}
                              onChange={(e) =>
                                setRemarks((p) => ({
                                  ...p,
                                  [key]: e.target.value,
                                }))
                              }
                              className="h-7 w-full text-xs"
                              placeholder={t("placeholder_remarks")}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs">
                {sectionTitles[sec.main] || getEvalTrans(sec.main) || sec.main} {t("eval_section_avg")}:{" "}
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
            <input
              ref={warningLetterInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleWarningLetterChange(warningLetterTargetIdxRef.current, file)
                e.target.value = ""
              }}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <colgroup>
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "120px" }} />
                  <col />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "50px" }} />
                </colgroup>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2">{t("eval_issue_type")}</th>
                    <th className="px-3 py-2">{t("label_date")}</th>
                    <th className="px-3 py-2">{t("eval_detail")}</th>
                    <th className="px-3 py-2 text-center">{t("eval_warning_letter")}</th>
                    <th className="px-3 py-2"></th>
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
                          {EVAL_INCIDENT_KEYS.map((key) => (
                            <option key={key} value={key}>
                              {t(key)}
                            </option>
                          ))}
                          <option value="__기타__">{t("eval_incident_other")}</option>
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
                            placeholder={t("eval_incident_type_other_ph")}
                            className="mt-1 h-7 text-xs"
                          />
                        )}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1 text-xs shrink-0">
                            <input
                              type="checkbox"
                              checked={inc.warningLetterChecked}
                              onChange={(e) =>
                                setIncidents((p) => {
                                  const n = [...p]
                                  n[idx] = { ...n[idx], warningLetterChecked: e.target.checked }
                                  return n
                                })
                              }
                              className="rounded"
                            />
                            {t("eval_warning_letter_issued")}
                          </label>
                          {inc.warningLetterUrl ? (
                            <button
                              type="button"
                              className="h-6 w-6 shrink-0 rounded border border-border bg-muted/50 hover:bg-muted flex items-center justify-center text-[10px]"
                              onClick={() => setWarningLetterViewUrl(inc.warningLetterUrl)}
                              title={t("eval_warning_letter_view")}
                            >
                              📷
                            </button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs shrink-0"
                              disabled={uploadingWarningForIdx === idx}
                              onClick={() => {
                                warningLetterTargetIdxRef.current = idx
                                setUploadingWarningForIdx(idx)
                                warningLetterInputRef.current?.click()
                              }}
                            >
                              {uploadingWarningForIdx === idx ? "..." : t("eval_warning_letter_upload")}
                            </Button>
                          )}
                        </div>
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
{t("eval_add_row")}
            </button>
          </div>

          {warningLetterViewUrl && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={() => setWarningLetterViewUrl(null)}
            >
              <div className="relative max-w-[90vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
                <img src={warningLetterViewUrl} alt={t("eval_warning_letter")} className="max-w-full max-h-[80vh] rounded-lg object-contain" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute -top-2 -right-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                  onClick={() => setWarningLetterViewUrl(null)}
                >
                  ✕
                </Button>
              </div>
            </div>
          )}

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
                  placeholder={t("eval_training")}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs">{t("eval_coach")}</label>
                <Input
                  value={coach}
                  onChange={(e) => setCoach(e.target.value)}
                  className="h-8 w-[180px] text-xs"
                  placeholder={t("eval_coach")}
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
