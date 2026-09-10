'use client'
import {use,useEffect,useState} from 'react'
import Link from 'next/link'
import {safeLink,type OperatingRecord} from '@/lib/operating-core'
export default function Review({params}:{params:Promise<{id:string}>}){
 const {id}=use(params),[record,setRecord]=useState<OperatingRecord|null>(null),[error,setError]=useState('')
 useEffect(()=>{void fetch(`/api/operator/operating/preparation/${encodeURIComponent(id)}`).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);setRecord(b)}).catch(e=>setError(e.message))},[id])
 return <main className="folio-home operating-home"><header className="folio-page-heading"><div><h1>{record?.data.title||'Prepared review'}</h1><p>Exact recipients and complete messages.</p></div><Link className="compass-btn-secondary" href="/home">Back to your queue</Link></header><article className="folio-paper">{error?<p role="alert">{error}</p>:!record?<p role="status">Loading review…</p>:<><p>{record.data.lead_ids.length} recipients · {record.data.status} · {record.data.source}</p><p className="folio-small">{record.data.note}</p>{(record.data.messages||[]).map((m:any,i:number)=><section className="operating-section" key={m.lead_id||i}><h2>{i+1}. {m.company||m.email}</h2><p>{m.email}</p><p>{m.note}</p>{(m.steps||[]).map((step:any,j:number)=><div key={j} className="operating-section"><h3>Email {j+1}: {step.subject||'(subject not set)'}</h3><p style={{whiteSpace:'pre-wrap',lineHeight:1.8}}>{step.body}</p></div>)}{m.source&&safeLink(m.source)?<a href={m.source} target="_blank" rel="noreferrer">Published evidence</a>:null}</section>)}</>}</article></main>
}
