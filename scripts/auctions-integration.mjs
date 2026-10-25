import {loadEnv} from 'vite';
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {fetchWithTimeout} from '../src/lib/fetch-timeout.js';
const env=loadEnv('test',process.cwd(),'');
if(!['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY',...['A','B','C'].flatMap(k=>[`TEST_USER_${k}_EMAIL`,`TEST_USER_${k}_PASSWORD`])].every(k=>env[k])){console.error('Faltan variables locales; no se imprimen valores.');process.exit(1);}
const make=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchWithTimeout}});
const a=make(),b=make(),c=make(),anon=make();let count=0,phase='inicio',owner,auction,empty,cancelled;const channels=[];
const ok=async query=>{const r=await query;assert.ok(!r.error,`Fallo en ${phase} (${r.error?.code||'sin código'})`);return r.data;};
const pass=()=>{count++;console.log(`APROBADA: ${phase}.`);};
const bid=(client,amount,nonce=randomUUID(),id=auction)=>ok(client.rpc('place_auction_bid',{p_auction_id:id,p_amount:amount,p_client_nonce:nonce}));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function create(label){
 const path=`${owner}/${randomUUID()}.webp`,id=randomUUID();await ok(a.storage.from('product-images').upload(path,await readFile(new URL('../public/images/playstation-5-640.webp',import.meta.url)),{contentType:'image/webp'}));
 await ok(a.from('products').insert({id,owner_id:owner,title:`Prueba automática de subasta ${label}`,description:'Artículo de prueba automatizada de subastas. No es una oferta comercial ni admite compras.',category:'Consolas',condition:'Buen estado',sale_type:'fixed',price:1000,area:'Centro',image_path:path}));
 return ok(a.rpc('create_auction',{p_product_id:id,p_initial_price:1000,p_min_increment:100,p_duration_hours:1,p_terms:'Subasta de prueba técnica. No es una oferta comercial. Sin pagos.',p_delay_minutes:0}));
}
try{
 phase='motor versión 5 y pagos deshabilitados';const health=await ok(anon.rpc('auctions_health'));assert.equal(health.version,5);assert.equal(health.payments_enabled,false);pass();
 phase='sesiones A/B/C diferentes';const users=[];for(const[client,key]of[[a,'A'],[b,'B'],[c,'C']])users.push((await ok(client.auth.signInWithPassword({email:env[`TEST_USER_${key}_EMAIL`],password:env[`TEST_USER_${key}_PASSWORD`]}))).user.id);assert.equal(new Set(users).size,3);owner=users[0];pass();
 phase='A publica subasta y galería reales';auction=await create('con pujas');empty=await create('sin pujas');cancelled=await create('para cancelación');pass();
 phase='B recibe una puja mediante Realtime';let events=0;const channel=b.channel(`auction-test-${randomUUID()}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'auction_bid_history',filter:`auction_id=eq.${auction}`},()=>{events++;});channels.push(channel);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime timeout')),20000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}});});
 const nonce=randomUUID(),first=await bid(b,1000,nonce);assert.equal(first.accepted,true);assert.equal((await bid(b,1000,nonce)).bid_id,first.bid_id);
 await pause(1500);assert.ok(events>0);pass();
 phase='C supera a B y se crea notificación privada';assert.equal((await bid(c,1100)).accepted,true);const notifications=await ok(b.from('auction_notifications').select('id').eq('auction_id',auction));assert.ok(notifications.length);assert.equal((await ok(c.from('auction_notifications').select('id').in('id',notifications.map(n=>n.id)))).length,0);pass();
 phase='pujas propias y mínimos inválidos rechazados';assert.equal((await bid(a,1200)).code,'own_listing');assert.equal((await bid(b,1101)).code,'below_minimum');assert.equal((await bid(b,1200.5)).code,'invalid_amount');pass();
 phase='postores simultáneos serializados sin perder incrementos';await pause(11000);const concurrent=await Promise.all([bid(b,1200),bid(c,1200)]);assert.equal(concurrent.filter(r=>r.accepted).length,1);const snapshot=await ok(a.rpc('auction_snapshot',{p_auction_id:auction}));assert.equal(snapshot.auction.highest_amount,1200);assert.equal(snapshot.auction.bid_count,3);pass();
 phase='estado público consistente para A, B y C';for(const client of[a,b,c]){const rows=await ok(client.from('auctions').select('highest_amount,bid_count,ends_at').eq('id',auction).single());assert.equal(rows.highest_amount,1200);assert.equal(rows.ends_at,snapshot.auction.ends_at);}pass();
 phase='sin sesión no se puja y no se exponen identidades privadas';assert.ok((await anon.rpc('place_auction_bid',{p_auction_id:auction,p_amount:1300,p_client_nonce:randomUUID()})).error);assert.ok((await anon.from('auction_bids').select('*')).error);assert.equal((await ok(c.from('auction_bids').select('id').eq('id',first.bid_id))).length,0);pass();
 phase='mutaciones directas y funciones internas denegadas';for(const client of[a,b,c]){assert.ok((await client.from('auctions').update({highest_amount:999999,status:'ended_winner'}).eq('id',auction)).error);assert.ok((await client.from('auction_bids').update({amount:1}).eq('auction_id',auction)).error);assert.ok((await client.from('auction_results').insert({auction_id:auction,winning_bid_id:first.bid_id,winner_id:users[1],amount:1})).error);assert.ok((await client.rpc('advance_auction_clock')).error);assert.ok((await client.rpc('settle_auction_locked',{p_auction_id:auction})).error);}pass();
 phase='reglas/publicación/fotos protegidas y no hay intercambio prematuro';const product=await ok(a.from('auctions').select('product_id').eq('id',auction).single());assert.ok((await a.from('products').update({price:1}).eq('id',product.product_id)).error);assert.ok((await a.from('products').delete().eq('id',product.product_id)).error);assert.ok((await b.rpc('request_exchange',{p_product_id:product.product_id})).error);assert.ok((await a.rpc('cancel_auction',{p_auction_id:auction,p_reason:'Intento de cancelación con pujas.'})).error);pass();
 phase='cancelación justificada solo sin pujas';await ok(a.rpc('cancel_auction',{p_auction_id:cancelled,p_reason:'Prueba finalizada sin compradores ni pujas.'}));assert.equal((await bid(b,1000,randomUUID(),cancelled)).code,'not_active');pass();
 phase='reintentos excesivos limitados en servidor';const burst=await Promise.all(Array.from({length:8},()=>bid(b,1)));assert.ok(burst.some(r=>r.code==='rate_limited'));assert.equal((await bid(b,1000,nonce)).bid_id,first.bid_id);pass();
 await mkdir('.cache',{recursive:true});await writeFile('.cache/auction-test-state.json',JSON.stringify({auction,empty,cancelled}));
 // Explicit admin-only timing fixture for these test records. Not a migration,
 // no production RPC/backdoor, no rows deleted, and no existing user data touched.
 await writeFile('.cache/auction-clock-test.sql',`begin;\ndo $$ begin\n if (select count(*) from public.auctions a join public.products p on p.id=a.product_id where a.id in ('${auction}','${empty}') and p.title like 'Prueba automática de subasta %' and a.status='active')<>2 then raise exception 'No coinciden las dos subastas de prueba activas.'; end if;\n update public.auctions set starts_at=clock_timestamp()-interval '1 hour',original_ends_at=clock_timestamp()+interval '45 seconds',ends_at=clock_timestamp()+interval '45 seconds',revision=revision+1 where id in ('${auction}','${empty}');\n insert into public.auction_audit_events(auction_id,kind,details) select id,'admin_test_clock',jsonb_build_object('purpose','Prueba técnica solicitada; sin pagos') from public.auctions where id in ('${auction}','${empty}');\nend; $$;\ncommit;\n`);
 console.log('Preparado .cache/auction-clock-test.sql. Pendiente de ejecución manual por administrador para probar anti-snipe y Cron sin esperar una hora.');
}catch(failure){console.error(`FALLÓ: ${phase}. ${failure.message?.startsWith('Fallo en ')?failure.message:'Sin imprimir respuestas privadas ni credenciales.'}`);process.exitCode=1;}
finally{await Promise.allSettled(channels.map(channel=>b.removeChannel(channel)));await Promise.allSettled([a,b,c].map(client=>client.auth.signOut({scope:'local'})));for(const client of[a,b,c,anon]){client.realtime.disconnect();await client.auth.stopAutoRefresh();}console.log(`Resultado: ${count} comprobaciones aprobadas. Las subastas y fotos de prueba se conservan por las reglas de auditoría; no se borran datos.`);}
