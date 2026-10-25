// Server-backed contract. No client clock, winner assignment or local bid ledger.
export const auctionRejections = {
  own_listing:'No puedes pujar por tu propio artículo.',
  below_minimum:'Otra puja pudo superar la tuya. Revisa el nuevo mínimo antes de confirmar.',
  not_active:'La subasta no está activa o ya terminó.',
  invalid_amount:'Usa pesos mexicanos enteros entre 1 y 1,000,000.',
  already_leading:'Ya tienes la puja más alta.',
  rate_limited:'Espera unos segundos antes de intentar otra puja.',
  communication_blocked:'No puedes pujar en esta publicación debido a un bloqueo.',
  unavailable:'La subasta no está disponible.',
  nonce_conflict:'Este intento ya se utilizó con otro importe. Actualiza antes de volver a pujar.',
};
export function createAuctionService(client) {
  async function rpc(name,args={}) {
    if(!client)throw new Error('Falta configurar Supabase.');
    const {data,error}=await client.rpc(name,args);
    if(error){
      if(['PGRST202','42P01'].includes(error.code))throw new Error('El motor de subastas todavía no está instalado.');
      if(error.code==='42501')throw new Error('Inicia sesión y comprueba que tengas permiso para esta acción.');
      if(['P0001','22023','23514'].includes(error.code))throw new Error(error.message);
      throw new Error('No se pudo confirmar la operación. Conserva el identificador del intento y consulta el estado antes de reintentar.');
    }
    return data;
  }
  return {
    create:(productId,rules)=>rpc('create_auction',{p_product_id:productId,p_initial_price:rules.initialPrice,p_min_increment:rules.minIncrement,p_duration_hours:rules.durationHours,p_terms:rules.terms,p_delay_minutes:rules.delayMinutes??0,p_image_paths:rules.imagePaths??null}),
    snapshot:id=>rpc('auction_snapshot',{p_auction_id:id}),
    bid:async(id,amount,nonce)=>{
      if(!nonce)throw new Error('Falta el identificador único de la puja.');
      const data=await rpc('place_auction_bid',{p_auction_id:id,p_amount:amount,p_client_nonce:nonce});
      if(!data||typeof data.accepted!=='boolean')throw new Error('El servidor no confirmó el resultado de la puja.');
      // HTTP 200 can contain a business rejection. Never turn it into success.
      return {...data,message:data.accepted?'Puja registrada. No se ha realizado ningún pago.':auctionRejections[data.code]||'Puja rechazada. Actualiza la subasta.'};
    },
    cancel:(id,reason)=>rpc('cancel_auction',{p_auction_id:id,p_reason:reason}),
    coordinate:id=>rpc('coordinate_auction',{p_auction_id:id}),
    readNotification:id=>rpc('read_auction_notification',{p_notification_id:id}),
  };
}
