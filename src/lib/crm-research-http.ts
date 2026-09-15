import { portalAccessResponse, portalJson } from './portal-http'
import { CrmValidationError } from './crm-research-schema'

export function crmErrorResponse(error: unknown) {
  const access=portalAccessResponse(error)
  if (access) return access
  if (error instanceof CrmValidationError) return portalJson({error:'validation_failed',issues:error.issues},{status:422})
  if (error instanceof SyntaxError) return portalJson({error:'invalid_json'},{status:400})
  const message=error instanceof Error ? error.message : 'crm_operation_failed'
  const status=/body is too large/.test(message) ? 413 : /crm_not_found/.test(message) ? 404 : /disabled|read_only|schema_unavailable/.test(message) ? 503 : /conflict|immutable|duplicate key/.test(message) ? 409 : /crm_|invalid|violates/.test(message) ? 422 : 500
  return portalJson({error:message},{status})
}
