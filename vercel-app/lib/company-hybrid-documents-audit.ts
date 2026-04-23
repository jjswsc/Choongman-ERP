import { supabaseInsert } from '@/lib/supabase-server'

type AuditAction = 'create' | 'update' | 'delete' | 'view'

export async function logCompanyHybridDocumentEvent(
  documentId: number,
  action: AuditAction,
  store: string,
  actor: { name?: string; store?: string },
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseInsert('company_hybrid_document_events', {
      document_id: documentId,
      action,
      store: String(store || '').trim(),
      actor_name: actor.name != null ? String(actor.name) : null,
      actor_store: actor.store != null ? String(actor.store) : null,
      detail: detail && Object.keys(detail).length ? detail : null,
    })
  } catch (e) {
    console.error('company_hybrid_document_events:', e)
  }
}
