import type {Copy, TemplatePolicy} from './outbound-pipeline'
export type PipelineJobKind='template_apply'|'export'|'membership'
export type PipelineJob={id:string;kind:PipelineJobKind;status:'preview'|'running'|'completed'|'attention';revision:number;total_count:number;applied_count:number;conflicted_count:number;failed_count:number;config:Record<string,unknown>;created_at:string;updated_at:string}
export type PipelineJobItem={id:string;job_id:string;status:'queued'|'applied'|'conflicted'|'failed';payload:{recipient_id?:string;list_id?:string;previous_id?:string|null;previous_revision?:number;manual?:boolean;signals?:Record<string,string>;input_refs?:string[];row?:Record<string,unknown>};result:Record<string,unknown>}
export type PipelineJobCommand={schema_version:'outbound.pipeline.v1';request_id:string;source:string;action:'preview_apply'|'apply_chunk'|'create_export'|'export_chunk'|'preview_membership'|'membership_chunk';job_id:string;expected_revision:number;data:Record<string,unknown>}
export type ApplyPreviewData={current_list_id:string;list_ids?:string[];template_version_id:string}
export type ExportData={list_id:string;grain:'companies'|'recipients';columns:string[];filters?:Record<string,string>;company_ids?:string[]}
export type FrozenTemplateConfig={template_version_id:string;policy:TemplatePolicy;list_ids:string[];manual_count:number}
export type AppliedDraft={id:string;copy:Copy;previous_id:string|null}
export const COMPANY_EXPORT_COLUMNS=['id','name','website','country','city','suburb','administrative_region','timezone','fit','stage','stage_status','reason'] as const
export const RECIPIENT_EXPORT_COLUMNS=['id','company_id','company_name','name','role','mailbox','mailbox_result','checked_at','suppressed','eligibility','subject','opener','body','cta','unsubscribe'] as const
/** Protect spreadsheet consumers while preserving multiline text and RFC4180 quoting. */
export function pipelineCsvCell(value:unknown):string{let s=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
export function pipelineCsvRows(columns:string[],rows:Record<string,unknown>[]):string{return rows.map(row=>columns.map(c=>pipelineCsvCell(row[c])).join(',')+'\r\n').join('')}

export type MembershipPreviewData={list_id:string;operation:'add'|'remove';filters?:Record<string,string>;company_ids?:string[]}
