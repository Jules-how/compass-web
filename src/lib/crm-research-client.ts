'use client'
import { useEffect, useRef, useState } from 'react'
import { useCachedJson } from './use-cached-json'
import { CRM_RESEARCH_VERSION, type CrmCommand, type CrmOperation } from './crm-research-schema'

export const CRM_API='/api/operator/crm'
export async function crmGet<T>(path:string):Promise<T> {
  const response=await fetch(CRM_API+path,{cache:'no-store'})
  const data=await response.json()
  if (!response.ok) throw new Error(data.issues?.map((x:{path:string;message:string})=>`${x.path}: ${x.message}`).join('; ') || data.error || 'Unable to load research')
  return data
}
export function useCrmResource<T>(path:string|null) {
  const result=useCachedJson<T>(path ? CRM_API+path : null,path ? CRM_API+path : null,{staleMs:15000})
  const reload=result.reload
  useEffect(()=>{const changed=()=>void reload(true);window.addEventListener('crm-research-changed',changed);return()=>window.removeEventListener('crm-research-changed',changed)},[reload])
  return result
}
export const crmId=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`
export function crmOperation(kind:CrmOperation['kind'],record:Record<string,unknown>,revision=0):CrmOperation {return {kind,record:record as CrmOperation['record'],expected_revision:revision}}
export function useCrmMutation(scope:string) {
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [pending,setPending]=useState<CrmCommand|null>(null)
  const pendingRef=useRef<CrmCommand|null>(null)
  const key='compass.crm.pending.'+scope
  useEffect(()=>{try{const raw=sessionStorage.getItem(key);if(raw){const packet=JSON.parse(raw) as CrmCommand;pendingRef.current=packet;setPending(packet)}}catch{/* unavailable browser storage */}},[key])
  function remember(packet:CrmCommand|null){pendingRef.current=packet;setPending(packet);try{if(packet)sessionStorage.setItem(key,JSON.stringify(packet));else sessionStorage.removeItem(key)}catch{/* receipt remains available on server */}}
  async function execute(packet:CrmCommand) {
    setBusy(true);setError('');remember(packet)
    try {
      const existing=await fetch(`${CRM_API}/receipts/${encodeURIComponent(packet.request_id)}`,{cache:'no-store'})
      let receipt: {request_id:string;payload_hash:string;operations:unknown[]}
      if(existing.ok) receipt=await existing.json()
      else {
        if(existing.status!==404)throw new Error('Cannot check the previous save. Retry when research is available.')
        const response=await fetch(CRM_API+'/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet)})
        const data=await response.json()
        if(!response.ok){if(response.status>=400&&response.status<500)remember(null);throw new Error(data.issues?.map((x:{path:string;message:string})=>`${x.path}: ${x.message}`).join('; ') || data.error || 'Save failed')}
        receipt=data
      }
      const readback=await crmGet<typeof receipt>(`/receipts/${encodeURIComponent(packet.request_id)}`)
      if(readback.request_id!==packet.request_id || readback.payload_hash!==receipt.payload_hash || readback.operations.length!==packet.operations.length)throw new Error('Save readback did not reconcile. Retry this receipt.')
      remember(null);window.dispatchEvent(new Event('crm-research-changed'));return true
    }catch(e){setError(e instanceof Error ? e.message : 'Save failed');return false}
    finally{setBusy(false)}
  }
  return {busy,error,pending,save:async(operations:CrmOperation[])=>{
    if(pendingRef.current){setError('Resolve the previous save before making another change.');return false}
    return execute({schema_version:CRM_RESEARCH_VERSION,request_id:crmId('request'),source:'Compass CRM operator',operations})
  },retry:()=>pendingRef.current ? execute(pendingRef.current) : Promise.resolve(false)}
}
export function useCrmDraft(scope:string) {
  const [draft,setDraft]=useState<Record<string,string>>({})
  useEffect(()=>{try{setDraft(JSON.parse(sessionStorage.getItem('compass.crm.draft.'+scope)||'{}'))}catch{setDraft({})}},[scope])
  function set(key:string,value:string){setDraft(current=>{const next={...current,[key]:value};try{sessionStorage.setItem('compass.crm.draft.'+scope,JSON.stringify(next))}catch{}return next})}
  function clear(){setDraft({});try{sessionStorage.removeItem('compass.crm.draft.'+scope)}catch{}}
  return {draft,set,clear}
}
