import {applyPipelineJob,readPipelineJob,pipelineJobItems,pipelineExportResponse} from '@/lib/outbound-pipeline-jobs-server'
import {pipelineErrorResponse} from '@/lib/outbound-pipeline-http'
import {portalJson,readBoundedJson,requireSameOrigin} from '@/lib/portal-http'
import {getPortalAdminClient} from '@/lib/portal-admin'
import {requirePortalAccess} from '@/lib/portal-access'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request){
try{const {supabase:db}=await requirePortalAccess({operator:true});const p=new URL(request.url).searchParams;const id=p.get('job_id');if(!id)return portalJson({error:'pipeline_job_id_required'},{status:422});return portalJson(p.get('items')==='1'?await pipelineJobItems(db,id,p.get('after')||undefined):{job:await readPipelineJob(db,id)});}catch(error){return pipelineErrorResponse(error)}}
export async function POST(request:Request){const origin=requireSameOrigin(request);if(origin)return origin;try{const {user}=await requirePortalAccess({operator:true});const actor='operator:'+user.id;return portalJson(await applyPipelineJob(getPortalAdminClient(),await readBoundedJson(request,256*1024),actor));}catch(error){return pipelineErrorResponse(error)}}
