import type { Metadata } from 'next'
import { AgreementSigning } from '@/components/AgreementSigning'
export const metadata:Metadata={title:'Your Switchflow agreement',robots:{index:false,follow:false},referrer:'no-referrer'}
export default async function SignPage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <AgreementSigning token={token}/>}
