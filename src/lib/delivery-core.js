const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function parseDeliveryQr(payload){
 if(typeof payload!=='string'||payload.length>160)throw new Error('QR de entrega no válido.');
 const match=/^pjd:delivery:v1:([0-9a-f-]{36}):([0-9a-f]{64})$/.exec(payload);
 if(!match||!uuid.test(match[1]))throw new Error('QR de entrega no válido.');
 return {operationId:match[1],token:match[2]};
}
export const deliveryMessages={
 rate_limited:'Espera antes de volver a intentar.',unavailable:'No tienes acceso a esta operación.',
 context_changed:'El acuerdo o la cita cambiaron. Consulta sus detalles.',context_or_time:'Comprueba el acuerdo, los bloqueos y el horario de la cita.',
 product_unavailable:'El artículo no está disponible para otra entrega.',unsupported_sale:'La entrega está disponible para precio fijo o una subasta ganada.',winner_required:'La subasta debe estar cerrada y vinculada al ganador provisional.',
 buyer_required:'Esta acción corresponde al comprador.',seller_required:'Esta acción corresponde al vendedor.',not_ready:'El estado de la entrega cambió. Actualiza antes de continuar.',
 invalid_qr:'El QR no tiene un formato válido.',invalid_or_expired_qr:'El QR fue utilizado, revocado o caducó. Pide uno nuevo al comprador.',
 stale_revision:'La entrega cambió. Revisa el estado actual antes de confirmar.',confirmation_expired_or_unavailable:'La recepción no se confirmó a tiempo. Actualiza y genera un QR nuevo si corresponde.',
 nonce_conflict:'Este intento ya se utilizó para otra acción. Actualiza antes de continuar.',report_required:'Esta entrega necesita un reporte o revisión; no se puede cancelar directamente.',
 invalid_report:'Revisa el motivo y los detalles del reporte.',report_limit:'Se alcanzó el límite diario de reportes.',
};
export function createDeliveryService(client){
 async function rpc(name,args={}){
  if(!client)throw new Error('Falta configurar Supabase.');
  let response;
  try{response=await client.rpc(name,args);}catch{throw new Error('Conexión interrumpida. Consulta el estado antes de reintentar; no supongas que la entrega quedó registrada.');}
  const {data,error}=response;
  if(error){
   if(['PGRST202','42P01'].includes(error.code))throw new Error('La entrega por QR todavía no está instalada.');
   if(error.code==='42501')throw new Error('Inicia sesión y verifica que seas participante autorizado.');
   // Never echo RPC arguments/server errors: they could contain QR credentials.
   throw new Error('No se pudo confirmar con el servidor. Consulta el estado; no entregues de nuevo ni supongas que se registró.');
  }
  if(!data||typeof data.ok!=='boolean')throw new Error('Respuesta no confirmada. Consulta el estado de la entrega.');
  return {...data,requiresRefresh:true,message:data.ok?(data.duplicate?'La acción ya se procesó. Consulta su estado actual.':'Acción confirmada por el servidor. Consulta el estado actualizado.'):(deliveryMessages[data.code]||'Acción no confirmada. Actualiza la entrega.')};
 }
 function nonce(value){if(typeof value!=='string'||!uuid.test(value))throw new Error('Falta el identificador del intento.');return value;}
 return {
  create:exchangeId=>rpc('create_delivery',{p_exchange_id:exchangeId}),
  issue:async id=>{
   const result=await rpc('issue_delivery_qr',{p_operation_id:id});
   if(result.ok){const payload=parseDeliveryQr(result.payload);if(payload.operationId!==id||!Number.isFinite(Date.parse(result.expires_at)))throw new Error('El servidor no confirmó un QR válido para esta operación.');}
   return result;
  },
  // Call only AFTER the seller previews the operation and explicitly attests
  // handover. Merely decoding a camera frame must not invoke this mutation.
  redeem:(payload,attemptNonce)=>{const qr=parseDeliveryQr(payload);return rpc('redeem_delivery_qr',{p_operation_id:qr.operationId,p_token:qr.token,p_nonce:nonce(attemptNonce)});},
  confirm:(id,revision,attemptNonce)=>{if(!Number.isInteger(revision)||revision<1)throw new Error('Actualiza la revisión de la entrega.');return rpc('confirm_delivery',{p_operation_id:id,p_expected_revision:revision,p_nonce:nonce(attemptNonce)});},
  cancel:(id,revision)=>rpc('cancel_delivery',{p_operation_id:id,p_expected_revision:revision}),
  report:(id,reason,details,pause=false)=>rpc('report_delivery_incident',{p_operation_id:id,p_reason:reason,p_details:details,p_pause:pause}),
  load:async id=>{
   if(!client)throw new Error('Falta configurar Supabase.');
   const {data,error}=await client.from('delivery_operations').select('id,exchange_id,appointment_id,appointment_revision,product_id,product_title,agreed_reference_amount,source,buyer_id,seller_id,status,revision,seller_confirmed_at,confirm_by,recorded_at,created_at,updated_at').eq('id',id).maybeSingle();
   if(error)throw new Error('No se pudo consultar la entrega. Revisa tu sesión y conexión.');
   return data;
  },
 };
}
