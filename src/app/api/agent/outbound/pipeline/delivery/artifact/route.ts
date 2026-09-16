import {applyPipelineDelivery,readPipelineDelivery,readPipelineDeliveryItems,pipelineDeliveryArtifact} from '@/lib/outbound-pipeline-delivery-server'
import {pipelineErrorResponse} from '@/lib/outbound-pipeline-http'
import {portalJson,readBoundedJson,requireSameOrigin} from '@/lib/portal-http'
import {getPortalAdminClient} from '@/lib/portal-admin'
import {requireAgentAuth} from '@/lib/agent-auth'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request){const auth=requireAgentAuth(request);if(auth)return auth;try{const db=getPortalAdminClient();const p=new URL(request.url).searchParams;const id=p.get('manifest_id');if(!id)return portalJson({error:'pipeline_manifest_id_required'},{status:422});return await pipelineDeliveryArtifact(db,id);}catch(error){return pipelineErrorResponse(error)}}
