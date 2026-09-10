import { requirePortalAccess } from '@/lib/portal-access'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { portalAccessResponse, portalJson } from '@/lib/portal-http'
import { operatingRecord } from '@/lib/operating-server'
export const dynamic='force-dynamic'
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{await requirePortalAccess({operator:true});const {id}=await params;const record=await operatingRecord(getPortalAdminClient(),id);if(!record||record.kind!=='preparation')return portalJson({error:'not_found'},{status:404});return portalJson(record)}
 catch(e){return portalAccessResponse(e)||portalJson({error:'Unable to load review'},{status:500})}
}
