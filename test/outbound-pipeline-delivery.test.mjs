import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTypescript} from './helpers/load-typescript.mjs'
const {buildPipelineDeliveryItem,validatePipelineSendContext}=loadTypescript('src/lib/outbound-pipeline-delivery.ts')
const context={settings:{timezone:'Europe/London',email_list:['sender@example.test'],daily_limit:10,from:'09:00',to:'17:00'},sequence:{steps:[{subject:'{{subject}}',slots:[{id:'body',body:'{{personalization}}\n\nBody\n\nReply\n\nReply no thanks',required:true}]}]}}
const item={snapshot:{recipient:{id:'r',company_id:'c',mailbox:'a@example.test',name:null},company:{name:'Company',website:'https://example.test'},lead:{id:'lead'},draft:{id:'draft',copy:{subject:'Hello',opener:'Published fact',body:'Body',cta:'Reply',unsubscribe:'Reply no thanks',followups:[]}},reasons:[]}}
test('canonical delivery accepts exact saved copy and international timezone',()=>{assert.deepEqual(validatePipelineSendContext(context),[]);assert.equal(buildPipelineDeliveryItem(item,context).status,'pass')})
test('canonical delivery holds copy variants provider sequence cannot express',()=>{const changed=structuredClone(item);changed.snapshot.draft.copy.body='Different exact body';const result=buildPipelineDeliveryItem(changed,context);assert.equal(result.status,'hold');assert.ok(result.reasons.includes('provider_sequence_cannot_express_draft'));assert.equal(result.rendered,null)})
