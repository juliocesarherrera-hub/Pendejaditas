// Explicitly creates real, labeled technical fixtures. Never prints QR secrets.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {parse,parsePlPgSQL} from 'libpg-query';import {mexicoTimeInput} from '../src/utils/meeting-time.js';import {sessions,close,ok} from './delivery-test-support.mjs';
let clients=[],phase='sesiones';
try{
 const login=await sessions();clients=login.clients;const [a,b]=clients,[seller,buyer]=login.users;
 phase='salud versión 6';const health=await ok(a.rpc('delivery_health'));if(health.version!==6||health.payments_enabled!==false)throw new Error('Versión incompatible.');
 const cases={};phase='artículos y acuerdos técnicos';
 for(const label of ['fixed','expiry','reprogram','cancel','incident','auction']){
  const product=randomUUID(),image=`${seller}/${randomUUID()}.webp`;
  await ok(a.storage.from('product-images').upload(image,await readFile(new URL('../public/images/playstation-5-640.webp',import.meta.url)),{contentType:'image/webp'}));
  await ok(a.from('products').insert({id:product,owner_id:seller,title:`Prueba técnica entrega QR ${label}`,description:'Artículo técnico para verificar entregas QR. No es una publicación comercial ni implica pagos.',category:'Consolas',condition:'Buen estado',sale_type:'fixed',price:1000,area:'Centro',image_path:image}));
  const entry={product,image,exchange:randomUUID(),appointment:randomUUID()};
  if(label==='auction'){
   entry.auction=await ok(a.rpc('create_auction',{p_product_id:product,p_initial_price:1000,p_min_increment:100,p_duration_hours:1,p_terms:'Prueba técnica de entrega de subasta. No hay compra ni cobros.'}));
   const bid=await ok(b.rpc('place_auction_bid',{p_auction_id:entry.auction,p_amount:1000,p_client_nonce:randomUUID()}));if(!bid.accepted)throw new Error('Puja no aceptada.');
  }else{
   entry.exchange=await ok(b.rpc('request_exchange',{p_product_id:product}));await ok(a.rpc('respond_exchange',{p_exchange_id:entry.exchange,p_action:'accept'}));
   entry.appointment=await ok(b.rpc('change_appointment',{p_exchange_id:entry.exchange,p_action:'propose',p_expected_revision:0,p_place_id:'antea',p_local_time:mexicoTimeInput(new Date(Date.now()+7200000))}));
   await ok(a.rpc('change_appointment',{p_exchange_id:entry.exchange,p_action:'accept',p_expected_revision:1}));
  }
  cases[label]=entry;
 }
 const auction=cases.auction;
 let sql=`begin;\ndo $$\nbegin\n if (select count(*) from public.products where id in (${Object.values(cases).map(c=>`'${c.product}'`).join(',')}) and owner_id='${seller}' and title like 'Prueba técnica entrega QR %')<>6 then raise exception 'Los artículos no coinciden con los fixtures técnicos.'; end if;\n`;
 sql+=`update public.auctions set starts_at=clock_timestamp()-interval '2 hours',original_ends_at=clock_timestamp()-interval '1 minute',ends_at=clock_timestamp()-interval '1 minute',revision=revision+1 where id='${auction.auction}' and status='active';\nperform public.advance_auction_clock();\nif not exists(select 1 from public.auction_results where auction_id='${auction.auction}' and winner_id='${buyer}') then raise exception 'No coincide el ganador de prueba.'; end if;\n`;
 sql+=`insert into public.exchange_requests(id,product_id,product_title,buyer_id,seller_id,status) values('${auction.exchange}','${auction.product}','Prueba técnica entrega QR auction','${buyer}','${seller}','accepted');\nupdate public.auction_results set exchange_id='${auction.exchange}' where auction_id='${auction.auction}';\ninsert into public.exchange_appointments(id,exchange_id,place_id,starts_at,proposed_by,status) values('${auction.appointment}','${auction.exchange}','antea',clock_timestamp()+interval '5 minutes','${buyer}','confirmed');\n`;
 for(const label of ['fixed','expiry','reprogram','cancel','incident'])sql+=`update public.exchange_appointments set starts_at=clock_timestamp()+interval '5 minutes' where id='${cases[label].appointment}' and status='confirmed';\n`;
 sql+=`insert into public.auction_audit_events(auction_id,kind,details) values('${auction.auction}','admin_delivery_test_fixture','{"purpose":"Prueba QR autorizada, sin pagos"}');\nend; $$;\ncommit;\n`;
 await parse(sql);await parsePlPgSQL(`create function parser_only() returns void language plpgsql as $$${sql.split('do $$')[1].split('$$;')[0]}$$;`);
 await mkdir('.cache',{recursive:true});await writeFile('.cache/delivery-test-cases.json',JSON.stringify(cases));await writeFile('.cache/delivery-test-window.sql',sql);
 console.log('APROBADA: sesiones A/B/C, salud 6, seis artículos técnicos, acuerdos y puja reales.');
 console.log('Preparado .cache/delivery-test-window.sql: solo ajusta fixtures técnicos para evitar esperar la ventana horaria. Requiere ejecución manual una vez; no es una migración.');
}catch{console.error(`FALLÓ: ${phase}. Sin imprimir credenciales ni datos privados.`);process.exitCode=1;}finally{await close(clients);}
