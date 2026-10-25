// Real sessions and SDK requests. Secrets only from ignored local files.
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mexicoTimeInput } from '../src/utils/meeting-time.js';
import { fetchWithTimeout } from '../src/lib/fetch-timeout.js';
import { confirmsDeletion } from '../src/lib/storage-result.js';
const env = loadEnv('test',process.cwd(),'');
if (!['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','TEST_USER_A_EMAIL','TEST_USER_A_PASSWORD','TEST_USER_B_EMAIL','TEST_USER_B_PASSWORD'].every((key) => env[key])) { console.error('NO EJECUTADA: faltan las variables locales de las dos cuentas.'); process.exit(1); }
const create = () => createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchWithTimeout}});
const a=create(), b=create(), outsider=create(), stranger=create();
let productId, imagePath, exchangeId, phase='inicio', count=0;
let hasStranger=false;
const pass = (label) => { count++; console.log(`APROBADA: ${label}.`); };
const invoke = (client,name,args) => client.rpc(name,args);
const change = (client,action,revision,place=null,time=null) => invoke(client,'change_appointment',{p_exchange_id:exchangeId,p_action:action,p_expected_revision:revision,p_place_id:place,p_local_time:time});
async function appointment() { const r=await b.from('exchange_appointments').select('status,revision,place_id').eq('exchange_id',exchangeId).single(); assert.ok(!r.error&&r.data); return r.data; }
try {
  phase='comprobación de la nueva migración';
  const health=await a.rpc('meetings_health'); assert.ok(!health.error&&health.data?.version===3); pass(phase);
  phase='inicio de sesión de ambas cuentas';
  for(const [client,label]of [[a,'A'],[b,'B']]) assert.ok(!(await client.auth.signInWithPassword({email:env[`TEST_USER_${label}_EMAIL`],password:env[`TEST_USER_${label}_PASSWORD`]})).error);
  const owner=(await a.auth.getUser()).data.user.id, buyer=(await b.auth.getUser()).data.user.id; assert.notEqual(owner,buyer); pass(phase);
  if(env.TEST_USER_C_EMAIL&&env.TEST_USER_C_PASSWORD) {
    phase='inicio de sesión de cuenta C ajena';
    const login=await stranger.auth.signInWithPassword({email:env.TEST_USER_C_EMAIL,password:env.TEST_USER_C_PASSWORD});
    assert.ok(!login.error&&login.data.user&&![owner,buyer].includes(login.data.user.id)); hasStranger=true; pass(phase);
  } else console.log('PENDIENTE: cuenta C no configurada; no se afirmará haber probado un tercero autenticado.');
  phase='cuatro tablas, RPC de salud y lugares reales disponibles';
  for(const table of ['meeting_places','exchange_requests','exchange_appointments','appointment_events']) assert.ok(!(await a.from(table).select('id').limit(0)).error);
  const places=await outsider.from('meeting_places').select('id,name,address,latitude,longitude,source_url').eq('active',true);
  assert.ok(!places.error&&places.data.length>=2&&places.data.every(place=>place.address&&place.name&&place.latitude>20&&place.latitude<21&&place.longitude>-101&&place.longitude<-100)); pass(phase);
  phase='artículo temporal para intercambio';
  imagePath=`${owner}/${randomUUID()}.webp`; const image=await readFile(new URL('../public/images/playstation-5-640.webp',import.meta.url));
  assert.ok(!(await a.storage.from('product-images').upload(imagePath,image,{contentType:'image/webp'})).error);
  productId=randomUUID();
  assert.ok(!(await a.from('products').insert({id:productId,owner_id:owner,title:'Prueba automática de citas · temporal',description:'Artículo temporal de una prueba del sistema de citas, no disponible para compraventa.',category:'Consolas',condition:'Buen estado',sale_type:'fixed',price:1000,area:'Centro',image_path:imagePath})).error); pass(phase);
  phase='rechazo de solicitud sobre un artículo propio'; assert.ok((await invoke(a,'request_exchange',{p_product_id:productId})).error); pass(phase);
  phase='solicitud real de B e idempotencia';
  const request=await invoke(b,'request_exchange',{p_product_id:productId}); assert.ok(!request.error&&request.data); exchangeId=request.data;
  assert.equal((await invoke(b,'request_exchange',{p_product_id:productId})).data,exchangeId); pass(phase);
  phase='prohibición de proponer antes de aceptar y de autoaceptar solicitud';
  const time=mexicoTimeInput(new Date(Date.now()+86400000));
  assert.ok((await change(b,'propose',0,'antea',time)).error);
  assert.ok((await invoke(b,'respond_exchange',{p_exchange_id:exchangeId,p_action:'accept'})).error); pass(phase);
  phase='vendedor acepta y comprador propone';
  assert.ok(!(await invoke(a,'respond_exchange',{p_exchange_id:exchangeId,p_action:'accept'})).error);
  assert.ok(!(await change(b,'propose',0,'antea',time)).error);
  assert.equal((await appointment()).status,'proposed'); pass(phase);
  phase='proponente no puede confirmar su propia propuesta'; assert.ok((await change(b,'accept',1)).error); pass(phase);
  phase='confirmación concurrente: una sola respuesta válida';
  const concurrent=await Promise.all([change(a,'accept',1),change(a,'accept',1)]);
  assert.equal(concurrent.filter((result)=>!result.error).length,1); assert.equal((await appointment()).status,'confirmed'); pass(phase);
  phase='reprogramación exige aceptación nueva y rechaza revisión obsoleta';
  assert.ok(!(await change(b,'propose',2,'puerta-victoria',mexicoTimeInput(new Date(Date.now()+90000000)))).error);
  assert.equal((await appointment()).status,'proposed'); assert.ok((await change(a,'accept',2)).error); pass(phase);
  phase='rechazo de propuesta y nueva negociación';
  assert.ok(!(await change(a,'reject',3)).error); assert.equal((await appointment()).status,'declined');
  assert.ok(!(await change(a,'propose',4,'antea',time)).error); assert.ok(!(await change(b,'accept',5)).error); pass(phase);
  phase='servidor rechaza fechas pasadas'; assert.ok((await change(a,'propose',6,'antea',mexicoTimeInput(new Date(Date.now()-86400000)))).error); pass(phase);
  phase='RLS y permisos bloquean lecturas anónimas y escrituras directas';
  for(const table of ['exchange_requests','exchange_appointments','appointment_events']) {
    const result=await outsider.from(table).select('id').eq(table==='exchange_requests'?'id':'exchange_id',exchangeId);
    assert.ok(result.error||result.data?.length===0);
  }
  assert.ok((await b.from('exchange_appointments').update({status:'confirmed'}).eq('exchange_id',exchangeId)).error);
  assert.ok((await a.from('appointment_events').delete().eq('exchange_id',exchangeId)).error);
  assert.ok((await b.from('exchange_requests').update({seller_id:buyer}).eq('id',exchangeId)).error); pass(phase);
  if(hasStranger) {
    phase='RLS bloquea lectura y RPC a un tercero autenticado';
    for(const table of ['exchange_requests','exchange_appointments','appointment_events']) {
      const result=await stranger.from(table).select('id').eq(table==='exchange_requests'?'id':'exchange_id',exchangeId);
      assert.ok(!result.error&&result.data?.length===0);
    }
    const rejection=await change(stranger,'accept',6);
    assert.equal(rejection.error?.code,'42501');
    const invitation=await invoke(stranger,'respond_exchange',{p_exchange_id:exchangeId,p_action:'accept'});
    assert.equal(invitation.error?.code,'42501');
    assert.ok((await stranger.from('exchange_appointments').update({status:'cancelled'}).eq('exchange_id',exchangeId)).error);
    pass(phase);
  }
  phase='cancelación por participante y cierre de la cita';
  assert.ok(!(await change(b,'cancel',6)).error); assert.equal((await appointment()).status,'cancelled');
  assert.ok((await change(a,'propose',7,'antea',time)).error); pass(phase);
  phase='historial privado persistente para ambos participantes';
  for(const client of [a,b]) { const history=await client.from('appointment_events').select('action').eq('exchange_id',exchangeId); assert.ok(!history.error&&history.data.length===7&&history.data.some((event)=>event.action==='cancel')); }
  pass(phase);
} catch { console.error(`FALLÓ: ${phase}. No se imprimen respuestas privadas ni credenciales.`); process.exitCode=1; }
finally {
  if(exchangeId) {
    const current=await b.from('exchange_appointments').select('revision,status').eq('exchange_id',exchangeId).maybeSingle();
    if(current.data&&current.data.status!=='cancelled') await change(b,'cancel',current.data.revision);
    else if(!current.data) await invoke(b,'respond_exchange',{p_exchange_id:exchangeId,p_action:'cancel'});
  }
  let canClean=!productId;
  if(productId) { const result=await a.from('products').delete().eq('id',productId).select('id'); canClean=!result.error&&result.data?.some(row=>row.id===productId); if(!canClean) {console.error('Revisa el artículo temporal: limpieza no confirmada.');process.exitCode=1;} else pass('limpieza confirmada del artículo temporal'); }
  if(imagePath&&canClean) {const result=await a.storage.from('product-images').remove([imagePath]); if(!confirmsDeletion(result,imagePath)) {console.error('Revisa la fotografía temporal: limpieza no confirmada.');process.exitCode=1;} else pass('limpieza confirmada de fotografía temporal'); }
  await Promise.allSettled([a.auth.signOut({scope:'local'}),b.auth.signOut({scope:'local'}),stranger.auth.signOut({scope:'local'})]);
  console.log(`Resultado: ${count} comprobaciones aprobadas. El historial de la cita de prueba se conserva por diseño; no se borran eventos.`);
}
