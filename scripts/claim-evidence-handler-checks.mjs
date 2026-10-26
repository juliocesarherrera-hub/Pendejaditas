// Handler-level checks with injected clients. No credentials, network or Deno deployment.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformSync} from 'rolldown/utils';
import {validateEvidenceBytes,evidenceSha256} from '../supabase/functions/_shared/evidence-validation.js';
import './prepare-claim-evidence.mjs';
const source=await readFile('supabase/functions/claim-evidence/index.ts','utf8');
const {code,errors}=transformSync('claim-evidence.ts',source.replace(/^import .*;\r?\n/gm,''),{lang:'ts'});
assert.equal(errors.length,0);
const id='00000000-0000-4000-8000-000000000001',uid='00000000-0000-4000-8000-000000000002';
const bytes=new TextEncoder().encode('%PDF-technical handler fixture only'),hash=await evidenceSha256(bytes);
function setup(options={},handlerCode=code){
 let handler;const calls=[];
 const env={SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-service',ALLOWED_APP_ORIGINS:'http://localhost:5173'};
 const createClient=(_url,key)=>({
  auth:{getUser:async token=>({data:{user:token==='valid-session'?{id:uid}:null},error:token==='valid-session'?null:{}})},
  rpc:async(name,args)=>{calls.push({name,args,key});
   if(name==='claim_evidence_upload_context')return {data:options.deny?null:{path:'private/fixture.pdf',mime:options.mime||'application/pdf'},error:null};
   if(name==='seal_claim_evidence')return {data:{ok:true},error:null};
   if(name==='authorize_claim_evidence_download')return {data:{ok:!options.deny,path:'private/fixture.pdf',mime:'application/pdf',bytes:bytes.length,sha256:options.badHash?'0'.repeat(64):hash},error:null};
   throw Error('Unexpected RPC');},
  storage:{from:bucket=>({download:async path=>{calls.push({bucket,path,key});return {data:new Blob([bytes]),error:null};}})},
 });
 const Deno={env:{get:key=>env[key]},serve:fn=>{handler=fn;}};
 new Function('Deno','createClient','validateEvidenceBytes','evidenceSha256',handlerCode)(Deno,createClient,validateEvidenceBytes,evidenceSha256);
 const request=(body,headers={},method='POST')=>handler(new Request('https://example.invalid/functions/v1/claim-evidence',{method,headers:{Authorization:'Bearer valid-session','Content-Type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})}));
 return {request,calls};
}
const seal={action:'seal',evidenceId:id},download={action:'download',evidenceId:id,asModerator:false};
let s=setup();assert.equal((await s.request(seal,{Origin:'https://untrusted.invalid'})).status,403);assert.equal(s.calls.length,0);
assert.equal((await s.request(null,{Origin:'http://localhost:5173'},'OPTIONS')).status,204);
assert.equal((await s.request(seal,{Authorization:''})).status,401);assert.equal((await s.request(seal,{Authorization:'Bearer invalid-session'})).status,401);assert.equal(s.calls.length,0);
assert.equal((await s.request({...seal,evidenceId:'invalid'})).status,400);
s=setup({deny:true});assert.equal((await s.request(seal)).status,403);assert.equal((await s.request(download)).status,403);assert.ok(!s.calls.some(c=>c.bucket));
s=setup();let response=await s.request({...seal,userId:'forged-user',sha256:'0'.repeat(64)});assert.equal(response.status,200);const sealed=s.calls.find(c=>c.name==='seal_claim_evidence');assert.equal(sealed.key,'test-service');assert.equal(sealed.args.p_uploader_id,uid);assert.equal(sealed.args.p_sha256,hash);assert.equal(sealed.args.p_bytes,bytes.length);
s=setup({mime:'image/png'});assert.equal((await s.request(seal)).status,400);assert.ok(!s.calls.some(c=>c.name==='seal_claim_evidence'));
s=setup({badHash:true});assert.equal((await s.request(download)).status,409);
s=setup();response=await s.request(download,{Origin:'http://localhost:5173'});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(response.headers.get('Content-Type'),'application/octet-stream');assert.equal(response.headers.get('X-Evidence-Type'),'application/pdf');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
console.log('OK: handler Edge rejects invalid sessions/origins/access, uses verified identity and actual byte hash, denies wrong MIME/hash and preserves private binary downloads. Injected clients only; no deployment or remote tests.');
const generated=await readFile('.cache/claim-evidence-dashboard.ts','utf8');
const bundled=transformSync('dashboard.ts',generated.replace(/^import .*;\r?\n/gm,''),{lang:'ts'});assert.equal(bundled.errors.length,0);
const deployedVersion=setup({},bundled.code);assert.equal((await deployedVersion.request(seal)).status,200);const bundleSeal=deployedVersion.calls.find(c=>c.name==='seal_claim_evidence');assert.equal(bundleSeal.args.p_sha256,hash);assert.equal(bundleSeal.args.p_bytes,bytes.length);
console.log('OK: generated standalone TypeScript parses and computes the same hash from actual bytes. No generated mocks or editor declarations are deployed.');
