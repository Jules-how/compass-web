import {applyPipelineJob,readPipelineJob,pipelineJobItems,pipelineExportResponse} from '@/lib/outbound-pipeline-jobs-server'
import {pipelineErrorResponse} from '@/lib/outbound-pipeline-http'
import {portalJson,readBoundedJson,requireSameOrigin} from '@/lib/portal-http'
import {getPortalAdminClient} from '@/lib/portal-admin'
import {requireAgentAuth} from '@/lib/agent-auth'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request){
const auth=requireAgentAuth(request);if(auth)return auth;try{const db=getPortalAdminClient();const p=new URL(request.url).searchParams;const id=p.get('job_id');if(!id)return portalJson({error:'pipeline_job_id_required'},{status:422});return await pipelineExportResponse(db,id,p.has('part')?(p.get('after')||''):undefined);}catch(error){return pipelineErrorResponse(error)}}
