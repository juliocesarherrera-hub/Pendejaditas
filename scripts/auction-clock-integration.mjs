import {loadEnv} from 'vite';import {createClient} from '@supabase/supabase-js';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {fetchWithTimeout} from '../src/lib/fetch-timeout.js';
const env=loadEnv('test',process.cwd(),''),state=JSON.parse(await readFile('.cache/auction-test-state.json','utf8'));
const make=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchWithTimeout}}),clients=[make(),make(),make()];
let phase='sesiones',count=0;const ok=async q=>{const r=await q;assert.ok(!r.error);return r.data;};const pause=ms=>new Promise(r=>setTimeout(r,ms));const pass=()=>{count++;console.log(`APROBADA: ${phase}.`);};
try{
 const users=[];for(let i=0;i<3;i++)users.push((await ok(clients[i].auth.signInWithPassword({email:env[`TEST_USER_${'ABC'[i]}_EMAIL`],password:env[`TEST_USER_${'ABC'[i]}_PASSWORD`]}))).user.id);
 const [a,b,c]=clients;
 phase='espera del ajuste administrativo de las dos subastas de prueba';console.log('Esperando ajuste del reloj de pruebas; no se modifican plazos desde este script.');
 let row;const timeout=Date.now()+20*60000;
 while(Date.now()<timeout){row=await ok(a.from('auctions').select('*').eq('id',state.auction).single());const health=await ok(a.rpc('auctions_health'));const remaining=Date.parse(row.ends_at)-Date.parse(health.server_time);if(remaining>0&&remaining<60000)break;await pause(2000);}
 const health=await ok(a.rpc('auctions_health'));assert.ok(Date.parse(row.ends_at)>Date.parse(health.server_time)&&Date.parse(row.ends_at)-Date.parse(health.server_time)<60000);pass();
 phase='puja real dentro del último minuto extiende exactamente dos minutos';
 const previous=Date.parse(row.ends_at);const led=await ok(a.from('auction_bids').select('bidder_id').eq('id',row.highest_bid_id).single());const bidder=led.bidder_id===users[1]?c:b;
 const response=await ok(bidder.rpc('place_auction_bid',{p_auction_id:state.auction,p_amount:Number(row.highest_amount)+Number(row.min_increment),p_client_nonce:randomUUID()}));assert.equal(response.accepted,true);assert.equal(response.extended,true);assert.equal(Date.parse(response.ends_at)-previous,120000);pass();
 phase='fecha extendida idéntica para A/B/C';for(const client of clients){const view=await ok(client.from('auctions').select('ends_at').eq('id',state.auction).single());assert.equal(view.ends_at,response.ends_at);}pass();
 phase='Cron cierra sin visitas ni RPC de consulta que puedan cerrar';
 // Deliberately NEVER invoke auction_snapshot or bid after the deadline until
 // observing persisted terminal states: only Cron can have made these changes.
 const max=Date.now()+5*60000;let closed;
 while(Date.now()<max){closed=await ok(a.from('auctions').select('id,status').in('id',[state.auction,state.empty]));if(closed.every(r=>r.status.startsWith('ended_')))break;await pause(3000);}
 assert.equal(closed.find(r=>r.id===state.empty)?.status,'ended_no_bids');assert.equal(closed.find(r=>r.id===state.auction)?.status,'ended_winner');pass();
 phase='ganador provisional correcto y resultado privado';const result=await ok(a.from('auction_results').select('*').eq('auction_id',state.auction).single());assert.equal(result.winner_id,(await bidder.auth.getUser()).data.user.id);assert.equal(result.amount,Number(row.highest_amount)+Number(row.min_increment));const loser=bidder===b?c:b;assert.equal((await ok(loser.from('auction_results').select('*').eq('auction_id',state.auction))).length,0);pass();
 phase='pujas después del cierre rechazadas';for(const client of[b,c]){const rejected=await ok(client.rpc('place_auction_bid',{p_auction_id:state.auction,p_amount:999999,p_client_nonce:randomUUID()}));assert.equal(rejected.accepted,false);assert.equal(rejected.code,'not_active');}pass();
 phase='solo vendedor y ganador coordinan por chat/citas';assert.ok((await loser.rpc('coordinate_auction',{p_auction_id:state.auction})).error);const exchange=await ok(bidder.rpc('coordinate_auction',{p_auction_id:state.auction}));assert.equal(await ok(a.rpc('coordinate_auction',{p_auction_id:state.auction})),exchange);const chat=await ok(bidder.rpc('open_chat',{p_exchange_id:exchange}));assert.ok(chat);assert.ok((await loser.rpc('open_chat',{p_exchange_id:exchange})).error);pass();
 phase='cierre no declara pagos ni entrega';for(const client of clients){const snap=await ok(client.rpc('auction_snapshot',{p_auction_id:state.auction}));assert.equal(snap.payments_enabled,false);assert.equal(snap.auction.status,'ended_winner');}pass();
}catch{console.error(`FALLÓ: ${phase}. Sin imprimir respuestas privadas ni credenciales.`);process.exitCode=1;}
finally{await Promise.allSettled(clients.map(c=>c.auth.signOut({scope:'local'})));for(const c of clients){c.realtime.disconnect();await c.auth.stopAutoRefresh();}console.log(`Resultado: ${count} comprobaciones del reloj aprobadas. Se conserva el historial técnico.`);}
