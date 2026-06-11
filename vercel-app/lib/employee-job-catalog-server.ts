import 'server-only'

import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  DEFAULT_EMPLOYEE_JOB_CATALOG,
  EMPLOYEE_JOB_CATALOG_KEY,
  mergeMissingCoreEmployeeJobs,
  normalizeEmployeeJobCatalog,
} from '@/lib/employee-job-catalog'

export async function loadEmployeeJobCatalog(): Promise<string[]> {
  try {
    const rows = (await supabaseSelectFilter(
      'system_settings',
      `key=eq.${encodeURIComponent(EMPLOYEE_JOB_CATALOG_KEY)}`,
      { limit: 1 }
    )) as { value_json?: unknown }[] | null
    const raw = rows?.[0]?.value_json
    return mergeMissingCoreEmployeeJobs(normalizeEmployeeJobCatalog(raw))
  } catch {
    return mergeMissingCoreEmployeeJobs([...DEFAULT_EMPLOYEE_JOB_CATALOG])
  }
}

export async function saveEmployeeJobCatalog(jobs: string[]): Promise<void> {
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: EMPLOYEE_JOB_CATALOG_KEY,
        value_json: jobs,
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
}
