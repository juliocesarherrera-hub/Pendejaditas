// Opt-in preparation of one labeled technical operation. No migrations/admin grants.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {sessions,close,ok} from './delivery-test-support.mjs';
import {mexicoTimeInput} from '../src/utils/meeting-time.js';
const file='.cache/claims-hold-test-case.json',title='Prueba técnica de pausa preventiva';
let clients=[],phase='sesiones';
try{
 const login=await sessions();clients=login.clients;const [a,b]=clients,[seller,buyer]=login.users;
 const prior=await readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 const fixture=prior?JSON.parse(prior):{seller,buyer,product:randomUUID(),image:`${seller}/${randomUUID()}.webp`,nonce:randomUUID()};
 assert.equal(fixture.seller,seller);assert.equal(fixture.buyer,buyer);
 const save=()=>writeFile(file,JSON.stringify(fixture,null,2));await save();
 phase='imagen técnica';const photo=await a.storage.from('product-images').download(fixture.image);
 if(photo.error)await ok(a.storage.from('product-images').upload(fixture.image,await readFile('public/images/playstation-5-640.webp'),{contentType:'image/webp',upsert:false}));
 phase='publicación técnica';const current=await ok(a.from('products').select('id,title,owner_id').eq('id',fixture.product).maybeSingle());
 if(!current)await ok(a.from('products').insert({id:fixture.product,owner_id:seller,title,description:'Publicación técnica para comprobar pausas preventivas de reclamaciones. No es una oferta comercial, incidente real ni operación de pago.',category:'Consolas',condition:'Buen estado',sale_type:'fixed',price:1000,area:'Centro',image_path:fixture.image}));
 else{assert.equal(current.title,title);assert.equal(current.owner_id,seller);}
 phase='acuerdo técnico';if(!fixture.exchange){fixture.exchange=await ok(b.rpc('request_exchange',{p_product_id:fixture.product}));await save();}
 const exchange=await ok(a.from('exchange_requests').select('status,buyer_id,seller_id').eq('id',fixture.exchange).single());assert.equal(exchange.buyer_id,buyer);assert.equal(exchange.seller_id,seller);
 if(exchange.status==='pending')await ok(a.rpc('respond_exchange',{p_exchange_id:fixture.exchange,p_action:'accept'}));else assert.equal(exchange.status,'accepted');
 phase='cita técnica';let appointment=await ok(b.from('exchange_appointments').select('id,status,revision').eq('exchange_id',fixture.exchange).maybeSingle());
 if(!appointment){const health=await ok(b.rpc('claims_health'));await ok(b.rpc('change_appointment',{p_exchange_id:fixture.exchange,p_action:'propose',p_expected_revision:0,p_place_id:'antea',p_local_time:mexicoTimeInput(new Date(Date.parse(health.server_time)+7200000))}));appointment=await ok(b.from('exchange_appointments').select('id,status,revision').eq('exchange_id',fixture.exchange).single());}
 if(appointment.status==='proposed')await ok(a.rpc('change_appointment',{p_exchange_id:fixture.exchange,p_action:'accept',p_expected_revision:appointment.revision}));else assert.equal(appointment.status,'confirmed');fixture.appointment=appointment.id;await save();
 phase='entrega pendiente';if(!fixture.delivery){const delivery=await ok(a.rpc('create_delivery',{p_exchange_id:fixture.exchange}));assert.equal(delivery.ok,true);fixture.delivery=delivery.operation_id;await save();}
 const delivery=await ok(a.from('delivery_operations').select('status').eq('id',fixture.delivery).single());assert.ok(['ready','cancelled'].includes(delivery.status));
 phase='reclamación técnica';if(!fixture.claim){const claim=await ok(b.rpc('open_claim',{p_exchange_id:fixture.exchange,p_target_kind:'delivery',p_target_id:fixture.delivery,p_reason:'other',p_body:'Prueba técnica autorizada de pausa preventiva. Solo se verifica el bloqueo y retiro controlado de una operación técnica; no existe un incidente real ni dinero en movimiento.',p_nonce:fixture.nonce}));assert.equal(claim.ok,true);fixture.claim=claim.claim_id;await save();}
 const state=await ok(b.from('claims').select('status,revision').eq('id',fixture.claim).single());
 console.log(`PREPARADA: una publicación técnica, acuerdo aceptado, cita confirmada, entrega ${delivery.status} y reclamación ${state.status}.`);
 console.log('En el panel C, abrir solamente Otro · Abierta y comprobar el contexto «Prueba técnica de pausa preventiva». No se aplicó ninguna pausa ni permiso.');
}catch{console.error('FALLÓ: '+phase+'. No se borró información; los identificadores parciales están en .cache. Sin credenciales en la salida.');process.exitCode=1;}
finally{await close(clients);}
