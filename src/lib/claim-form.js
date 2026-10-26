export function claimTargets(exchange,appointments=[],deliveries=[]){
 if(!exchange)return [];
 return [
  ...(exchange.product_id?[{kind:'publication',id:exchange.product_id,label:'Publicación del artículo'}]:[]),
  ...appointments.filter(row=>row.exchange_id===exchange.id).map(row=>({kind:'appointment',id:row.id,label:'Cita de intercambio'})),
  ...deliveries.filter(row=>row.exchange_id===exchange.id).map(row=>({kind:'delivery',id:row.id,label:'Entrega del artículo'})),
  {kind:'exchange',id:exchange.id,label:'Solicitud de intercambio'},
 ];
}
export function selectedClaimTarget(target,targets){
 return targets.some(row=>`${row.kind}:${row.id}`===target)?target:(targets[0]?`${targets[0].kind}:${targets[0].id}`:'');
}
