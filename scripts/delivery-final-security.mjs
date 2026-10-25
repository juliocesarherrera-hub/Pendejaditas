import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {sessions,close,ok,pause} from './delivery-test-support.mjs';
let clients=[],phase='inicio',count=0;const channels=[];
try{
 const login=await sessions();clients=login.clients;const[a,,c]=clients;const cases=JSON.parse(await readFile('.cache/delivery-test-cases.json','utf8'));
 const operation=(await ok(a.from('delivery_operations').select('id').eq('exchange_id',cases.incident.exchange).order('created_at',{ascending:false}).limit(1).single())).id;
 phase='Realtime entrega estado al participante y no a C';let own=0,outsider=0;
 for(const[client,label]of[[a,'A'],[c,'C']]){
  const channel=client.channel(`delivery-security-${randomUUID()}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'delivery_operations',filter:`id=eq.${operation}`},()=>{if(label==='A')own++;else outsider++;});channels.push([client,channel]);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime timeout')),20000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(new Error('Realtime unavailable'));}});});
 }
 const report=await ok(a.rpc('report_delivery_incident',{p_operation_id:operation,p_reason:'other',p_details:'Validación técnica de aislamiento Realtime. No es un incidente real.',p_pause:true}));assert.equal(report.ok,true);
 const start=Date.now();while(!own&&Date.now()-start<15000)await pause(100);await pause(1200);assert.ok(own>0);assert.equal(outsider,0);assert.equal((await ok(c.from('delivery_incidents').select('id').eq('id',report.incident_id))).length,0);console.log(`APROBADA: ${phase}.`);count++;
 phase='rechazos no autorizados consumen el límite global';const responses=await Promise.all(Array.from({length:22},()=>ok(c.rpc('create_delivery',{p_exchange_id:cases.fixed.exchange}))));assert.ok(responses.every(r=>r.ok===false));assert.ok(responses.some(r=>r.code==='rate_limited'));assert.equal((await ok(c.from('delivery_operations').select('id').eq('exchange_id',cases.fixed.exchange))).length,0);console.log(`APROBADA: ${phase}.`);count++;
}catch{console.error(`FALLÓ: ${phase}. Sin imprimir respuestas privadas, QR ni credenciales.`);process.exitCode=1;}
finally{await Promise.allSettled(channels.map(([client,channel])=>client.removeChannel(channel)));await close(clients);console.log(`Resultado: ${count} comprobaciones finales aprobadas.`);}
