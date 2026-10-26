// Real opt-in Edge checks, scoped to the existing labeled technical claim.
// No migration, account-role changes, commercial cases or credential logging.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sessions,close,ok,env} from './delivery-test-support.mjs';
import {fetchWithTimeout} from '../src/lib/fetch-timeout.js';
let clients=[],phase='sesiones',count=0;const passed=[];
function pass(label){passed.push(label);count++;console.log(`APROBADA: ${label}.`);}
const origin='http://localhost:5174';
try{
 const login=await sessions();clients=login.clients;const [a,b,c,anon]=clients,[owner]=login.users;
 const fixture=JSON.parse(await readFile('.cache/claims-test-case.json','utf8'));
 const row=await ok(a.from('claims').select('id,status,opened_by,exchange_id').eq('id',fixture.claim).single());
 assert.equal(row.opened_by,owner);assert.equal(row.exchange_id,fixture.exchange);assert.notEqual(row.status,'resolved');
 const opening=await ok(a.from('claim_statements').select('body').eq('claim_id',row.id).eq('kind','opening').single());assert.ok(opening.body.startsWith('Prueba técnica autorizada de reclamaciones.'));
 pass('sesiones A/B/C y expediente exclusivamente técnico comprobados');
 const invoke=(actor,body,customOrigin=origin)=>actor.functions.invoke('claim-evidence',{body,headers:{Origin:customOrigin}});
 phase='preflight';
 const endpoint=env.VITE_SUPABASE_URL+'/functions/v1/claim-evidence';
 const preflight=await fetchWithTimeout(endpoint,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type'}});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
 const blocked=await fetchWithTimeout(endpoint,{method:'OPTIONS',headers:{Origin:'https://untrusted.invalid'}});assert.equal(blocked.status,403);pass('CORS permite 5174 y rechaza un origen ajeno');
 const oldPdf=await ok(a.from('claim_evidence').select('storage_path').eq('claim_id',row.id).eq('uploader_id',owner).eq('expected_mime','application/pdf').limit(1).single());
 const pdf=await ok(a.storage.from('claim-evidence').download(oldPdf.storage_path));
 const files=[{mime:'application/pdf',bytes:Buffer.from(await pdf.arrayBuffer()),visibility:'moderators'},{mime:'image/webp',bytes:await readFile('public/images/playstation-5-640.webp'),visibility:'participants'}];
 for(const file of files){
  phase=`subida y sellado ${file.mime}`;
  const reservation=await ok(a.rpc('reserve_claim_evidence',{p_claim_id:row.id,p_mime:file.mime,p_visibility:file.visibility}));assert.equal(reservation.ok,true);
  await ok(a.storage.from('claim-evidence').upload(reservation.path,file.bytes,{contentType:file.mime,upsert:false}));
  const sealed=await invoke(a,{action:'seal',evidenceId:reservation.evidence_id,sha256:'0'.repeat(64),userId:login.users[2]});
  assert.ok(!sealed.error&&sealed.data?.ok===true);
  const stored=await ok(a.from('claim_evidence').select('status,sha256_hex,byte_size,uploader_id').eq('id',reservation.evidence_id).single());
  assert.equal(stored.status,'sealed');assert.equal(stored.sha256_hex,createHash('sha256').update(file.bytes).digest('hex'));assert.equal(stored.byte_size,file.bytes.length);assert.equal(stored.uploader_id,owner);
  pass(`${file.mime}: subida y hash real del servidor; identidad y hash falsos del cliente no se utilizan`);
  phase=`descarga A ${file.mime}`;
  const download=await invoke(a,{action:'download',evidenceId:reservation.evidence_id,asModerator:false});
  assert.ok(!download.error&&download.data instanceof Blob);assert.ok(Buffer.from(await download.data.arrayBuffer()).equals(file.bytes));
  assert.equal(download.response.headers.get('Cache-Control'),'no-store');assert.equal(download.response.headers.get('X-Evidence-Type'),file.mime);assert.equal(download.response.headers.get('Access-Control-Allow-Origin'),origin);
  pass(`${file.mime}: A descarga bytes íntegros mediante Edge, sin caché y con CORS correcto`);
  phase=`aislamiento ${file.mime}`;
  for(const actor of [c,anon]){const denied=await invoke(actor,{action:'download',evidenceId:reservation.evidence_id,asModerator:false});assert.ok(denied.error);assert.ok((await actor.storage.from('claim-evidence').download(reservation.path)).error);}
  for(const actor of [b,c]){const forged=await invoke(actor,{action:'download',evidenceId:reservation.evidence_id,asModerator:true});assert.ok(forged.error);const sealing=await invoke(actor,{action:'seal',evidenceId:reservation.evidence_id});assert.ok(sealing.error);}
  pass(`${file.mime}: C y visitante no descargan; B/C no suplantan moderadores ni validan archivos de A`);
  const counterparty=await invoke(b,{action:'download',evidenceId:reservation.evidence_id,asModerator:false});
  if(file.visibility==='moderators'){assert.ok(counterparty.error);assert.ok((await b.storage.from('claim-evidence').download(reservation.path)).error);pass('PDF privado del autor: B tampoco puede acceder');}
  else{assert.ok(!counterparty.error&&counterparty.data instanceof Blob);assert.ok(Buffer.from(await counterparty.data.arrayBuffer()).equals(file.bytes));pass('imagen compartida expresamente: B descarga los mismos bytes y C sigue excluido');}
  phase=`integridad posterior ${file.mime}`;
  assert.ok((await a.storage.from('claim-evidence').upload(reservation.path,file.bytes,{contentType:file.mime,upsert:true})).error);
  await a.storage.from('claim-evidence').remove([reservation.path]);
  const retained=await invoke(a,{action:'download',evidenceId:reservation.evidence_id,asModerator:false});assert.ok(!retained.error&&Buffer.from(await retained.data.arrayBuffer()).equals(file.bytes));
  pass(`${file.mime}: reemplazo y eliminación bloqueados después del sellado`);
 }
 await writeFile('.cache/claim-evidence-integration-result.json',JSON.stringify({passed,executed_at:new Date().toISOString(),payments_enabled:false,administrator_roles_changed:false},null,2));
}catch{console.error(`FALLÓ: ${phase}. Sin imprimir documentos privados, tokens ni credenciales.`);process.exitCode=1;}
finally{await close(clients);console.log(`Resultado: ${count} comprobaciones reales de archivos aprobadas. No se concedieron roles ni se activaron pagos.`);}
