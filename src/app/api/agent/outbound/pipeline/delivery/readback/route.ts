import {applyPipelineReadback,readPipelineReadback,readPipelineReadbackResults} from '@/lib/outbound-pipeline-readback-server'
import {pipelineErrorResponse} from '@/lib/outbound-pipeline-http'
import {portalJson,readBoundedJson,requireSameOrigin} from '@/lib/portal-http'
import {getPortalAdminClient} from '@/lib/portal-admin'
import {requireAgentAuth} from '@/lib/agent-auth'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request){const auth=requireAgentAuth(request);if(auth)return auth;try{const db=getPortalAdminClient();const p=new URL(request.url).searchParams;const id=p.get('readback_id');if(!id)return portalJson({error:'pipeline_readback_id_required'},{status:422});return portalJson(p.get('items')==='1'?await readPipelineReadbackResults(db,id,p.get('after')||undefined):{readback:await readPipelineReadback(db,id)});}catch(error){return pipelineErrorResponse(error)}}
export async function POST(request:Request){const auth=requireAgentAuth(request);if(auth)return auth;try{const actor='agent',operator=undefined;return portalJson(await applyPipelineReadback(getPortalAdminClient(),await readBoundedJson(request,256*1024),actor));}catch(error){return pipelineErrorResponse(error)}}
