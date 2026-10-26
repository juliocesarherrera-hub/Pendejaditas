// Opt-in real A/B/C checks. Only labeled technical fixtures; no admin grants,
// migrations, commercial operations, payments or credential logging.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {sessions,close,ok} from './delivery-test-support.mjs';
let clients=[],phase='sesiones',count=0;const pending=[];
const pass=label=>{count++;console.log(`APROBADA: ${label}.`);};
const rejected=async query=>{const result=await query;assert.ok(result.error||result.data?.ok===false);};
const noRows=async query=>{const result=await query;assert.ok(result.error||Array.isArray(result.data)&&result.data.length===0);};
const technicalPdf=()=>{
 const text='BT /F1 12 Tf 30 100 Td (Prueba tecnica privada. Sin incidente real.) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 450 150] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`];
 let out='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(out);out+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out);
};
try{
 const login=await sessions();clients=login.clients;const [a,b,c,anon]=clients,[seller,buyer]=login.users;
 pass('A, B y C inician sesión y son cuentas distintas');
 const health=await ok(a.rpc('claims_health'));assert.equal(health.version,7);assert.equal(health.evidence_private,true);assert.equal(health.payments_enabled,false);pass('servicio 7 y bucket privado, sin pagos');
 phase='selección de fixture técnico';
 const cases=JSON.parse(await readFile('.cache/delivery-test-cases.json','utf8')),fixture=cases.fixed;
 const exchange=await ok(a.from('exchange_requests').select('id,product_id,buyer_id,seller_id,product_title').eq('id',fixture.exchange).single());
 assert.equal(exchange.seller_id,seller);assert.equal(exchange.buyer_id,buyer);assert.equal(exchange.product_id,fixture.product);assert.ok(exchange.product_title.startsWith('Prueba técnica entrega QR '));
 const draft={p_exchange_id:exchange.id,p_target_kind:'publication',p_target_id:fixture.product,p_reason:'other',p_body:'Prueba técnica autorizada de reclamaciones. No existe un incidente real, acusación o solicitud de dinero.',p_nonce:randomUUID()};
 const existing=await ok(a.from('claims').select('id,status,opened_by').eq('exchange_id',exchange.id).eq('target_kind','publication').eq('target_id',fixture.product).neq('status','resolved'));
 let id;
 if(existing.length){assert.equal(existing.length,1);id=existing[0].id;const opening=await ok(a.from('claim_statements').select('body').eq('claim_id',id).eq('kind','opening').single());assert.ok(opening.body.startsWith('Prueba técnica autorizada de reclamaciones.'));}
 else{phase='A abre reclamación técnica';const created=await ok(a.rpc('open_claim',draft));assert.equal(created.ok,true);id=created.claim_id;const retry=await ok(a.rpc('open_claim',draft));assert.equal(retry.ok,true);assert.equal(retry.claim_id,id);const conflict=await ok(a.rpc('open_claim',{...draft,p_body:draft.p_body+' Cambio de contenido.'}));assert.equal(conflict.ok,false);pass('apertura persistente e idempotencia; nonce alterado rechazado');}
 await writeFile('.cache/claims-test-case.json',JSON.stringify({claim:id,exchange:exchange.id,product:fixture.product}));
 phase='lectura de participantes';
 assert.equal((await ok(b.from('claims').select('id').eq('id',id))).length,1);
 const statement=await ok(b.rpc('submit_claim_statement',{p_claim_id:id,p_body:'Versión técnica del comprador para verificar la persistencia y los permisos. No se denuncia ningún hecho real.',p_nonce:randomUUID(),p_request_id:null}));assert.equal(statement.ok,true);
 assert.equal((await ok(a.from('claim_statements').select('id,author_id,created_at').eq('id',statement.statement_id).single())).author_id,buyer);pass('B lee el caso y A recibe su versión con autor del servidor');
 phase='aislamiento de C y visitante';
 for(const table of ['claims','claim_statements','claim_events','claim_resolutions','claim_information_requests','claim_evidence','claim_holds','claim_admin_audit']){
  const key=table==='claims'?'id':'claim_id';for(const actor of [c,anon])await noRows(actor.from(table).select('id').eq(key,id));
 }
 pass('C y visitante no leen el expediente ni sus tablas privadas');
 phase='escritura no autorizada';
 await rejected(c.rpc('submit_claim_statement',{p_claim_id:id,p_body:'Intento técnico no autorizado: debe rechazarse por no participar.',p_nonce:randomUUID()}));
 await rejected(anon.rpc('open_claim',{...draft,p_nonce:randomUUID()}));
 await rejected(c.rpc('open_claim',{...draft,p_nonce:randomUUID()}));
 await rejected(c.from('claim_statements').insert({claim_id:id,author_id:seller,kind:'response',body:'Intento técnico de suplantación rechazado por permisos de base de datos.',nonce:randomUUID(),created_at:'2000-01-01T00:00:00Z'}));
 pass('sin sesión y C no abren casos ajenos, escriben ni suplantan autores');
 phase='historial inmutable';
 await noRows(b.from('claim_statements').update({body:'Cambio técnico que no debe permitirse en un registro histórico.'}).eq('id',statement.statement_id).select('id'));
 await noRows(b.from('claim_statements').delete().eq('id',statement.statement_id).select('id'));
 assert.equal((await ok(a.from('claim_statements').select('id').eq('id',statement.statement_id))).length,1);pass('autor no puede editar ni eliminar su versión enviada');
 phase='acceso administrativo';
 for(const actor of [a,b,c]){
  assert.equal(await ok(actor.rpc('my_moderation_role')),null);
  await rejected(actor.rpc('moderation_queue'));
  await rejected(actor.rpc('moderation_case',{p_claim_id:id}));
  await rejected(actor.rpc('moderate_claim',{p_claim_id:id,p_action:'resolve',p_expected_revision:1,p_message:'Intento técnico sin autorización administrativa. Debe rechazarse.',p_outcome:'other'}));
  await rejected(actor.rpc('set_moderation_staff',{p_user_id:seller,p_role:'supervisor',p_active:true,p_reason:'Intento técnico de autoasignación: debe rechazarse.'}));
 }
 pass('A/B/C sin rol y MFA no consultan moderación, resuelven ni se asignan permisos');
 phase='objetivo ajeno';
 await rejected(a.rpc('open_claim',{...draft,p_target_kind:'delivery',p_target_id:randomUUID(),p_nonce:randomUUID()}));pass('no se acepta un contexto de entrega inexistente o ajeno');
 phase='reserva de prueba privada';
 await rejected(c.rpc('reserve_claim_evidence',{p_claim_id:id,p_mime:'application/pdf'}));
 const reservation=await ok(a.rpc('reserve_claim_evidence',{p_claim_id:id,p_mime:'application/pdf',p_visibility:'moderators'}));assert.equal(reservation.ok,true);const bytes=technicalPdf();
 await ok(a.storage.from('claim-evidence').upload(reservation.path,bytes,{contentType:'application/pdf',upsert:false}));
 const original=await ok(a.storage.from('claim-evidence').download(reservation.path));assert.ok(Buffer.from(await original.arrayBuffer()).equals(bytes));
 for(const actor of [b,c,anon])assert.ok((await actor.storage.from('claim-evidence').download(reservation.path)).error);
 await noRows(b.from('claim_evidence').select('id').eq('id',reservation.evidence_id));await noRows(c.from('claim_evidence').select('id').eq('id',reservation.evidence_id));
 pass('PDF técnico real almacenado privadamente; B, C y visitante no acceden');
 phase='conservación del archivo';
 assert.ok((await a.storage.from('claim-evidence').upload(reservation.path,bytes,{contentType:'application/pdf',upsert:true})).error);
 await a.storage.from('claim-evidence').remove([reservation.path]);
 const retained=await ok(a.storage.from('claim-evidence').download(reservation.path));assert.ok(Buffer.from(await retained.arrayBuffer()).equals(bytes));
 await rejected(a.rpc('seal_claim_evidence',{p_evidence_id:reservation.evidence_id,p_uploader_id:seller,p_sha256:'0'.repeat(64),p_bytes:bytes.length,p_mime:'application/pdf'}));pass('sin reemplazo ni eliminación del archivo y sin sellado falsificado desde navegador');
 phase='función Edge de validación';
 const sealed=await a.functions.invoke('claim-evidence',{body:{action:'seal',evidenceId:reservation.evidence_id}});
 if(sealed.error||sealed.data?.ok!==true){pending.push('Sellado y descarga mediante Edge: falta comprobar/configurar claim-evidence. No se anunció el archivo como prueba sellada.');}
 else{const row=await ok(a.from('claim_evidence').select('status,byte_size,sha256_hex').eq('id',reservation.evidence_id).single());assert.equal(row.status,'sealed');assert.equal(row.byte_size,bytes.length);const {createHash}=await import('node:crypto');assert.equal(row.sha256_hex,createHash('sha256').update(bytes).digest('hex'));pass('Edge valida bytes y registra hash de prueba real');}
 phase='persistencia tras cerrar sesión';
 await ok(b.auth.signOut({scope:'local'}));
 const {env}=await import('./delivery-test-support.mjs');await ok(b.auth.signInWithPassword({email:env.TEST_USER_B_EMAIL,password:env.TEST_USER_B_PASSWORD}));
 assert.equal((await ok(b.from('claims').select('id').eq('id',id))).length,1);assert.equal((await ok(b.from('claim_statements').select('id').eq('id',statement.statement_id))).length,1);pass('caso y versiones permanecen después de cerrar y abrir sesión');
 pending.push('Moderación autorizada, conflicto de administrador participante, apelación por otro revisor y pausas: requieren cuentas de moderación designadas con MFA. No se concedieron roles automáticamente.');
 await writeFile('.cache/claims-integration-result.json',JSON.stringify({passed:count,pending,executed_at:new Date().toISOString(),payments_enabled:false},null,2));
}catch(error){console.error(`FALLÓ: ${phase}. ${error?.code||'Comprobación no superada; sin imprimir datos privados ni credenciales.'}`);process.exitCode=1;}
finally{await close(clients);console.log(`Resultado: ${count} comprobaciones aprobadas.`);for(const note of pending)console.log(`PENDIENTE: ${note}`);}
