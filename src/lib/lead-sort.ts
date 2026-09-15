import type { LeadColumnId } from './lead-columns'
export const LEAD_SORT_COLUMNS = ['company','email','phone','role','city','last_outbound_at','review_count','source','outbound_status','vertical','icp_status','email_origin','updated_at'] as const
export const LEAD_GRID_SORTS: Partial<Record<LeadColumnId,string>> = {company:'company',email:'email',phone:'phone',job_title:'role',location:'city',last_touch:'last_outbound_at',review_count:'review_count',source:'source',status:'outbound_status',vertical:'vertical',icp_status:'icp_status',email_origin:'email_origin'}
export function validatedLeadSort(raw: string|undefined, direction: string|undefined, mode: string) {
  if (raw && !(LEAD_SORT_COLUMNS as readonly string[]).includes(raw)) throw new Error('invalid_lead_sort')
  if (direction && !['asc','desc'].includes(direction)) throw new Error('invalid_lead_sort_direction')
  return { column:raw || (mode==='agent' ? 'email' : 'company'), direction:(direction || 'asc') as 'asc'|'desc' }
}
