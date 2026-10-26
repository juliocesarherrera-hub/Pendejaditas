export const claimReasons={counterfeit:'Producto falso',defective:'Producto defectuoso',not_as_described:'Diferente al anunciado',non_delivery:'Entrega incumplida',theft:'Robo reportado',threats:'Amenazas',other:'Otro'};
export const claimStates={open:'Abierta',awaiting_response:'Esperando respuesta',under_review:'En revisión',resolved:'Resuelta',appealed:'Apelada'};
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function requireNonce(value){if(typeof value!=='string'||!uuid.test(value))throw new Error('Falta el identificador del intento.');return value;}
export function validateClaim(input){
 if(!Object.hasOwn(claimReasons,input.reason)||!['publication','appointment','delivery','exchange'].includes(input.targetKind))throw new Error('Selecciona el motivo y un contexto válido.');
 if(typeof input.body!=='string'||input.body.trim().length<20||input.body.trim().length>4000)throw new Error('Describe tu versión con entre 20 y 4,000 caracteres.');
 if(!uuid.test(input.exchangeId||'')||!uuid.test(input.targetId||''))throw new Error('Selecciona una operación relacionada contigo.');
 return {...input,body:input.body.trim(),nonce:requireNonce(input.nonce)};
}
export function createClaimsService(client){
 async function raw(name,args={}){
  if(!client)throw new Error('Falta configurar Supabase.');
  let response;try{response=await client.rpc(name,args);}catch{throw new Error('Conexión interrumpida. Consulta el expediente antes de reintentar.');}
  if(response.error)throw new Error('No se pudo autorizar la acción. Revisa la sesión, el acceso y MFA cuando corresponda.');
  return response.data;
 }
 async function action(name,args){const data=await raw(name,args);if(!data||typeof data.ok!=='boolean')throw new Error('El servidor no confirmó la acción.');return {...data,requiresRefresh:true};}
 return {
  open:input=>{const v=validateClaim(input);return action('open_claim',{p_exchange_id:v.exchangeId,p_target_kind:v.targetKind,p_target_id:v.targetId,p_reason:v.reason,p_body:v.body,p_nonce:v.nonce});},
  statement:(id,body,nonce,requestId=null)=>action('submit_claim_statement',{p_claim_id:id,p_body:body,p_nonce:requireNonce(nonce),p_request_id:requestId}),
  attachMessage:(id,messageId,nonce)=>action('attach_claim_chat_message',{p_claim_id:id,p_message_id:messageId,p_nonce:requireNonce(nonce)}),
  appeal:(id,body,nonce)=>action('appeal_claim',{p_claim_id:id,p_body:body,p_nonce:requireNonce(nonce)}),
  reserveEvidence:(id,mime,visibility='moderators')=>action('reserve_claim_evidence',{p_claim_id:id,p_mime:mime,p_visibility:visibility}),
  sealEvidence:async id=>{
   let response;try{response=await client.functions.invoke('claim-evidence',{body:{action:'seal',evidenceId:id}});}catch{throw new Error('No se confirmó la integridad. Consulta el estado del adjunto antes de reintentar.');}
   if(response.error||response.data?.ok!==true)throw new Error('El archivo sigue pendiente de validación; no se anuncia como prueba recibida.');
   return {...response.data,requiresRefresh:true};
  },
  downloadEvidence:async(id,asModerator=false)=>{
   const response=await client.functions.invoke('claim-evidence',{body:{action:'download',evidenceId:id,asModerator}});
   if(response.error||!(response.data instanceof Blob))throw new Error('No se pudo autorizar o verificar el archivo privado.');
   const mime=response.response?.headers?.get('X-Evidence-Type');
   return ['image/jpeg','image/png','image/webp','application/pdf'].includes(mime)?new Blob([response.data],{type:mime}):response.data;
  },
  myRole:async()=>{const role=await raw('my_moderation_role');return ['reviewer','supervisor'].includes(role)?role:null;},
  queue:()=>action('moderation_queue',{p_limit:50}),
  moderationCase:id=>action('moderation_case',{p_claim_id:id}),
  moderate:(id,operation,revision,message,recipient=null,outcome=null)=>action('moderate_claim',{p_claim_id:id,p_action:operation,p_expected_revision:revision,p_message:message,p_recipient:recipient,p_outcome:outcome}),
  hold:(id,scope,deliveryId,hours,reason)=>action('set_claim_hold',{p_claim_id:id,p_scope:scope,p_delivery_id:deliveryId,p_hours:hours,p_reason:reason}),
  releaseHold:(id,holdId,reason)=>action('release_claim_hold',{p_claim_id:id,p_hold_id:holdId,p_reason:reason}),
 };
}
