// Real sessions, RPC, Realtime and RLS. Never log server payloads or credentials.
import {loadEnv} from 'vite';
import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {fetchWithTimeout} from '../src/lib/fetch-timeout.js';
import {confirmsDeletion} from '../src/lib/storage-result.js';
import {createChatService} from '../src/lib/chat-core.js';
const env=loadEnv('test',process.cwd(),'');
const required=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY',...['A','B','C'].flatMap(label=>[`TEST_USER_${label}_EMAIL`,`TEST_USER_${label}_PASSWORD`])];
if(!required.every(key=>env[key])){console.error('NO EJECUTADA: faltan variables locales para A, B o C.');process.exit(1);}
const make=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchWithTimeout}});
const a=make(),b=make(),c=make(),anon=make();
const serviceA=createChatService(a),serviceB=createChatService(b);
let owner,buyer,product,image,exchange,conversation,phase='inicio',count=0,blocked=false;
let receivedB=0,receivedC=0;
let blockEvents=0;
const channels=[];
const pass=label=>{count++;console.log(`APROBADA: ${label}.`);};
const args=body=>({p_conversation_id:conversation,p_body:body,p_client_nonce:randomUUID()});
const ok=async request=>{const response=await request;assert.ok(!response.error);return response.data;};
async function subscribe(client,label) {
  const channel=client.channel(`security-chat-${label}-${randomUUID()}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:`conversation_id=eq.${conversation}`},()=>{if(label==='B')receivedB++;else receivedC++;});
  channels.push([client,channel]);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime timeout')),20000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(new Error('Realtime unavailable'));}});});
}
try {
  phase='salud de chat versión 4';assert.equal(await ok(anon.rpc('chat_health')),4);pass(phase);
  phase='sesiones reales de A, B y C';
  for(const [client,label]of [[a,'A'],[b,'B'],[c,'C']])await ok(client.auth.signInWithPassword({email:env[`TEST_USER_${label}_EMAIL`],password:env[`TEST_USER_${label}_PASSWORD`]}));
  owner=(await a.auth.getUser()).data.user.id;buyer=(await b.auth.getUser()).data.user.id;const third=(await c.auth.getUser()).data.user.id;assert.equal(new Set([owner,buyer,third]).size,3);pass(phase);
  phase='siete tablas nuevas accesibles con sesión';
  for(const table of ['chat_conversations','chat_participants','chat_messages','chat_reads','user_blocks','user_reports','voice_call_requests'])await ok(a.from(table).select('*').limit(0));pass(phase);
  phase='artículo temporal de prueba e intercambio real';
  image=`${owner}/${randomUUID()}.webp`;
  await ok(a.storage.from('product-images').upload(image,await readFile(new URL('../public/images/playstation-5-640.webp',import.meta.url)),{contentType:'image/webp'}));
  product=randomUUID();await ok(a.from('products').insert({id:product,owner_id:owner,title:'Prueba automática de chat · temporal',description:'Artículo temporal para comprobar el chat privado. No está disponible para compraventa.',category:'Consolas',condition:'Buen estado',sale_type:'fixed',price:1000,area:'Centro',image_path:image}));
  exchange=await ok(b.rpc('request_exchange',{p_product_id:product}));pass(phase);
  phase='apertura autorizada e idempotente y dos participantes';conversation=await serviceB.open(exchange);assert.equal(await serviceA.open(exchange),conversation);
  const participants=await ok(a.from('chat_participants').select('user_id').eq('conversation_id',conversation));assert.equal(participants.length,2);pass(phase);
  phase='C no puede abrir ni comprobar pertenencia ajena';assert.equal((await c.rpc('open_chat',{p_exchange_id:exchange})).error?.code,'42501');assert.equal(await ok(c.rpc('chat_is_member',{p_conversation_id:conversation})),false);pass(phase);
  phase='suscripciones Realtime de B y C';await subscribe(b,'B');await subscribe(c,'C');pass(phase);
  phase='A envía y B recibe mediante Realtime';
  const nonce=randomUUID();const first=await serviceA.send(conversation,'Mensaje de prueba A a B',nonce);
  await new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(receivedB){clearInterval(timer);resolve();}else if(Date.now()-start>15000){clearInterval(timer);reject(new Error('No Realtime'));}},100);});
  assert.equal(receivedC,0);assert.ok((await serviceB.messages(conversation)).some(row=>row.id===first&&row.sender_id===owner));pass(phase);
  phase='reintentos no duplican mensajes';assert.equal(await serviceA.send(conversation,'Mensaje de prueba A a B',nonce),first);assert.equal((await serviceA.messages(conversation)).length,1);pass(phase);
  phase='no leídos y cursor propio monotónico';let inbox=(await serviceB.inbox()).find(row=>row.conversation_id===conversation);assert.equal(Number(inbox.unread_count),1);await serviceB.read(conversation,1);await serviceB.read(conversation,0);inbox=(await serviceB.inbox()).find(row=>row.conversation_id===conversation);assert.equal(inbox.last_read_sequence,1);assert.equal(Number(inbox.unread_count),0);assert.ok((await b.rpc('mark_chat_read',{p_conversation_id:conversation,p_upto_sequence:999})).error);pass(phase);
  phase='historial persistente después de cerrar y abrir sesión';await ok(b.auth.signOut({scope:'local'}));await ok(b.auth.signInWithPassword({email:env.TEST_USER_B_EMAIL,password:env.TEST_USER_B_PASSWORD}));assert.ok((await serviceB.messages(conversation)).some(row=>row.id===first));pass(phase);
  phase='respuesta real de B a A';await serviceB.send(conversation,'Respuesta de prueba de B',randomUUID());assert.equal((await serviceA.messages(conversation)).length,2);pass(phase);
  phase='C no lee tablas, bandeja ni eventos de la conversación';
  for(const [table,column] of [['chat_conversations','id'],['chat_participants','conversation_id'],['chat_messages','conversation_id'],['chat_reads','conversation_id'],['voice_call_requests','conversation_id']])assert.equal((await ok(c.from(table).select('*').eq(column,conversation))).length,0);
  assert.ok(!(await ok(c.rpc('chat_inbox'))).some(row=>row.conversation_id===conversation));assert.equal(receivedC,0);pass(phase);
  phase='C no puede enviar, marcar lectura ni reportar en conversación ajena';
  assert.equal((await c.rpc('send_chat_message',args('Ataque de tercero'))).error?.code,'42501');assert.equal((await c.rpc('mark_chat_read',{p_conversation_id:conversation,p_upto_sequence:1})).error?.code,'42501');assert.equal((await c.rpc('report_chat_user',{p_conversation_id:conversation,p_reason:'spam'})).error?.code,'42501');pass(phase);
  phase='no se puede suplantar remitente ni mutar mensajes o participantes directamente';
  assert.ok((await c.from('chat_messages').insert({conversation_id:conversation,sender_id:owner,sequence:3,client_nonce:randomUUID(),body:'Suplantación'})).error);
  assert.ok((await a.from('chat_messages').update({body:'Alteración'}).eq('id',first)).error);assert.ok((await a.from('chat_messages').delete().eq('id',first)).error);assert.ok((await b.from('chat_participants').insert({conversation_id:conversation,user_id:third,role:'buyer'})).error);pass(phase);
  phase='sesión anónima no lee ni envía';assert.ok((await anon.rpc('send_chat_message',args('Sin sesión'))).error);const anonymous=await anon.from('chat_messages').select('*').eq('conversation_id',conversation);assert.ok(anonymous.error||!anonymous.data.length);pass(phase);
  phase='bloqueo impide mensajes de ambos lados y apertura';await serviceB.block(owner,true);blocked=true;
  for(const client of [a,b]){assert.equal((await client.rpc('send_chat_message',args('Bloqueado'))).error?.code,'P0001');assert.equal((await client.rpc('open_chat',{p_exchange_id:exchange})).error?.code,'P0001');}
  assert.equal((await serviceA.inbox()).find(row=>row.conversation_id===conversation).communication_allowed,false);
  assert.equal((await ok(c.from('user_blocks').select('*').eq('blocker_id',buyer))).length,0);pass(phase);
  phase='tabla de bloqueos retirada de Realtime';
  const privacy=b.channel(`privacy-blocks-${randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'user_blocks'},()=>{blockEvents++;});
  channels.push([b,privacy]);
  await new Promise(resolve=>{const timer=setTimeout(resolve,10000);privacy.subscribe(status=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);resolve();}});});
  // Read remains available to the owner; publication exclusion prevents all events.
  assert.equal((await ok(b.from('user_blocks').select('blocked_id').eq('blocked_id',owner))).length,1);
  await serviceB.block(owner,false);blocked=false;await serviceB.block(owner,true);blocked=true;
  await new Promise(resolve=>setTimeout(resolve,1500));assert.equal(blockEvents,0);pass(phase);
  phase='solo el autor puede quitar su bloqueo';await serviceA.block(buyer,false);assert.ok((await a.rpc('send_chat_message',args('Sigue bloqueado'))).error);await serviceB.block(owner,false);blocked=false;await serviceA.send(conversation,'Mensaje después de desbloquear',randomUUID());pass(phase);
  phase='reportes privados guardados sin modificación del cliente';const report=await serviceB.report(conversation,'other','Reporte de prueba automatizada, no denuncia real.');assert.ok(report);assert.equal((await ok(c.from('user_reports').select('id').eq('id',report))).length,0);assert.equal((await ok(a.from('user_reports').select('id').eq('id',report))).length,0);assert.ok((await b.from('user_reports').update({status:'reviewed'}).eq('id',report)).error);pass(phase);
  phase='llamadas deshabilitadas y función interna no expuesta';assert.ok((await b.from('voice_call_requests').insert({conversation_id:conversation,caller_id:buyer,callee_id:owner,status:'ringing'})).error);assert.ok((await c.rpc('chat_pair_blocked',{p_a:owner,p_b:buyer})).error);pass(phase);
  phase='límite de envío aplicado por servidor';const burst=await Promise.all(Array.from({length:7},()=>a.rpc('send_chat_message',args('Prueba de límite'))));assert.ok(burst.some(row=>row.error?.code==='P0001'));assert.ok(burst.filter(row=>!row.error).length<=5);pass(phase);
} catch {console.error(`FALLÓ: ${phase}. No se imprimen datos privados ni credenciales.`);process.exitCode=1;}
finally {
  await Promise.allSettled(channels.map(([client,channel])=>client.removeChannel(channel)));
  if(blocked&&owner)try{await serviceB.block(owner,false);}catch{console.error('PENDIENTE: quitar bloqueo creado por la prueba.');process.exitCode=1;}
  if(exchange)await b.rpc('respond_exchange',{p_exchange_id:exchange,p_action:'cancel'});
  let removed=!product;
  if(product){const r=await a.from('products').delete().eq('id',product).select('id');removed=!r.error&&r.data?.some(row=>row.id===product);if(!removed){console.error('PENDIENTE: limpieza del producto temporal.');process.exitCode=1;}}
  if(image&&removed){if(!confirmsDeletion(await a.storage.from('product-images').remove([image]),image)){console.error('PENDIENTE: limpieza de fotografía temporal.');process.exitCode=1;}}
  await Promise.allSettled([a,b,c].map(client=>client.auth.signOut({scope:'local'})));
  for(const client of [a,b,c,anon]) { client.realtime.disconnect(); await client.auth.stopAutoRefresh(); }
  console.log(`Resultado: ${count} comprobaciones aprobadas. Solo se retiraron producto y foto temporales; el historial y reporte de prueba se conservan por diseño.`);
}
