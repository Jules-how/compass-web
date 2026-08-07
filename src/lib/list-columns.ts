export const TASK_LIST_COLUMNS =
  'id,title,status,priority,due,project_id,parent_task_id,business_function_id,task_type,execution_level,updated_at'

export const PROJECT_LIST_COLUMNS =
  'id,name,business_function_id,client_id,status,priority,health,start_date,target_date,labels,summary,updated_at,created_at,mirrored_at,source,notes,external_id'

export const CLIENT_LIST_COLUMNS =
  'id,name,industry,website,main_contact_name,main_contact_role,engagement_type,retainer_status,status,priority,health,summary,tags,notes,archived_at,vault_dossier_id,portal_client_slug,last_touch_at,created_at,updated_at,mirrored_at'

export const CLIENT_UPDATE_COLUMNS = 'id,client_id,health,body,created_at,mirrored_at'

export const CLIENT_ACTIVITY_COLUMNS = 'id,client_id,actor,action,body,created_at'

export const CLIENT_ISSUE_COLUMNS =
  'id,client_id,title,status,priority,due,notes,project_id,sort_order,created_at,updated_at,mirrored_at'

export const CLIENT_OFFER_COLUMNS =
  'id,client_id,channel,title,description,status,amount,currency,created_at,updated_at'

export const CLIENT_AD_SPEND_COLUMNS =
  'id,client_id,channel,spend_date,amount,currency,campaign_name,notes,created_at,updated_at'

export const CLIENT_CHANNEL_NOTE_COLUMNS = 'id,client_id,channel,body,created_at'

export const META_CAMPAIGN_COLUMNS =
  'id,client_id,name,objective,status,buying_type,special_ad_categories,budget_type,daily_budget,lifetime_budget,currency,notes,created_at,updated_at'

export const META_AD_SET_COLUMNS =
  'id,client_id,campaign_id,name,status,optimization_goal,billing_event,bid_strategy,budget_type,daily_budget,lifetime_budget,currency,start_date,end_date,age_min,age_max,genders,locations,detailed_targeting,placements,placement_notes,destination_type,notes,created_at,updated_at'

export const META_AD_COLUMNS =
  'id,client_id,ad_set_id,name,status,format,primary_text,headline,description,call_to_action,destination_url,display_link,media_notes,notes,created_at,updated_at'

export const PROJECT_MILESTONE_COLUMNS =
  'id,project_id,title,description,target_date,sort_order,completed,created_at,updated_at,mirrored_at'

export const PROJECT_UPDATE_COLUMNS = 'id,project_id,health,body,created_at,mirrored_at'

export const FUNCTION_LIST_COLUMNS = 'id,name,slug,sort_order,updated_at,created_at,mirrored_at'

export const LEAD_LIST_COLUMNS =
  'id,name,email,phone,company,role,vertical,source,tags,city,state,linkedin,outbound_status,interest_label,lead_status_source,instantly_campaign,instantly_campaign_id,instantly_campaign_ids,instantly_campaign_name,last_outbound_at,mirrored_at,updated_at'

export const TOP_TASK_LIMIT = 50
export const SUBTASK_LIMIT = 200
export const LEAD_PAGE_SIZE = 50
