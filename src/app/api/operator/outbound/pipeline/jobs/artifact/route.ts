import {applyPipelineJob,readPipelineJob,pipelineJobItems,pipelineExportResponse} from '@/lib/outbound-pipeline-jobs-server'
import {pipelineErrorResponse} from '@/lib/outbound-pipeline-http'
import {portalJson,readBoundedJson,requireSameOrigin} from '@/lib/portal-http'
import {getPortalAdminClient} from '@/lib/portal-admin'
import {requirePortalAccess} from '@/lib/portal-access'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request){
try{const {supabase:db}=await requirePortalAccess({operator:true});const p=new URL(request.url).searchParams;const id=p.get('job_id');if(!id)return portalJson({error:'pipeline_job_id_required'},{status:422});return await pipelineExportResponse(db,id,p.has('part')?(p.get('after')||''):undefined);}catch(error){return pipelineErrorResponse(error)}}
