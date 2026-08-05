export const TASK_LIST_COLUMNS =
  'id,title,status,priority,due,project_id,parent_task_id,business_function_id,task_type,execution_level,updated_at'

export const PROJECT_LIST_COLUMNS =
  'id,name,business_function_id,status,updated_at,created_at,mirrored_at,source,notes,external_id'

export const FUNCTION_LIST_COLUMNS = 'id,name,slug,sort_order,updated_at,created_at,mirrored_at'

export const LEAD_LIST_COLUMNS =
  'id,name,email,phone,company,role,vertical,source,tags,city,state,linkedin,outbound_status,interest_label,lead_status_source,instantly_campaign,instantly_campaign_id,instantly_campaign_ids,instantly_campaign_name,last_outbound_at,mirrored_at,updated_at'

export const TOP_TASK_LIMIT = 50
export const SUBTASK_LIMIT = 200
export const LEAD_PAGE_SIZE = 50
