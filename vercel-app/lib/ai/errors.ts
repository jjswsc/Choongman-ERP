export type AiErrorCode =
  | "AI_VALIDATION_ERROR"
  | "AI_SCOPE_VIOLATION"
  | "AI_APPROVER_REQUIRED"
  | "AI_APPROVAL_CONFLICT"
  | "AI_REQUEST_NOT_FOUND"
  | "AI_UNAUTHORIZED"
  | "AI_FORBIDDEN"
  | "AI_RATE_LIMITED"
  | "AI_INVALID_JSON"
  | "AI_QUERY_REQUIRED"
  | "AI_OFFICE_REQUIRED"
  | "AI_INTERNAL_ERROR"

export class AiRouteError extends Error {
  code: AiErrorCode
  status: number

  constructor(code: AiErrorCode, message: string, status = 400) {
    super(message)
    this.name = "AiRouteError"
    this.code = code
    this.status = status
  }
}

export function isAiRouteError(err: unknown): err is AiRouteError {
  return err instanceof AiRouteError
}
