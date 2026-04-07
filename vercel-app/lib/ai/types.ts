import type { JwtPayload } from "@/lib/jwt-auth"

export type AiIntent = "qa" | "reporting" | "ops_recommend"

export interface AiScopedAuth {
  auth: JwtPayload
  role: string
  name: string
  store: string
}

export interface AiCitation {
  id: string
  source: string
  title: string
  snippet: string
  updatedAt?: string | null
}

export interface AiKnowledgeChunk {
  id: string
  source: string
  title: string
  content: string
  storeScope: string | null
  roleScope: string | null
  updatedAt: string | null
}

export type AiActionType =
  | "create_notice_draft"
  | "create_followup_task"
  | "update_followup_task_status"
  | "save_accounting_workflow_status"
  | "create_weather_campaign_draft"
  | "create_shift_adjustment_draft"

