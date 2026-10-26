import {supabase} from './supabase';
import {createClaimsService} from './claims-core';
export {claimReasons,claimStates} from './claims-core';
export const claims=createClaimsService(supabase);
export const claimTime=value=>value?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
export const requireClaimSuccess=result=>{
 const messages={rate_limited:'Has alcanzado un límite temporal. Consulta tus casos existentes y vuelve a intentarlo más tarde.',stale_or_closed:'El expediente cambió. Actualízalo antes de actuar.',existing_case_or_attempt:'Ya existe un expediente para este contexto. Vuelve a Mis reclamaciones para consultarlo y agregar tu versión.',appeal_existing_case:'Este contexto ya tiene una resolución reciente. Consulta ese expediente para presentar una apelación.',invalid_input:'Revisa la operación, el contexto y tu descripción de entre 20 y 4,000 caracteres.',unavailable:'La operación o el contexto no están disponibles para tu cuenta.'};
 if(!result?.ok)throw new Error(messages[result?.code]||'El servidor no autorizó la acción. Consulta el expediente; puede existir un caso o una respuesta anterior.');return result;
};
export async function claimQuery(query){
 const {data,error}=await query;
 if(error)throw new Error('No se pudo consultar el expediente privado. Revisa tu sesión y vuelve a consultar.');
 return data;
}
export async function claimsReady(){
 if(!supabase)throw new Error('Configura Supabase antes de utilizar reclamaciones.');
 const {data,error}=await supabase.rpc('claims_health');
 if(error||data?.version!==7||data.evidence_private!==true||data.payments_enabled!==false)
  throw new Error('Reclamaciones pendiente de instalación y verificación. No se ha guardado ningún caso desde esta pantalla.');
}
export async function uploadClaimEvidence(claimId,file,visibility){
 if(!file||file.size<1||file.size>5242880||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))
  throw new Error('Selecciona JPG, PNG, WebP o PDF, de hasta 5 MB.');
 const reservation=await claims.reserveEvidence(claimId,file.type,visibility);
 if(!reservation.ok)throw new Error('No se pudo reservar el adjunto. Consulta el expediente antes de reintentar.');
 const {error}=await supabase.storage.from('claim-evidence').upload(reservation.path,file,{contentType:file.type,upsert:false});
 if(error)throw new Error('La subida no se confirmó. El adjunto seguirá pendiente; no se reemplazará ningún archivo anterior.');
 await claims.sealEvidence(reservation.evidence_id);
 return reservation.evidence_id;
}
export async function downloadClaimEvidence(id,moderator){
 const blob=await claims.downloadEvidence(id,moderator);
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[blob.type]||'bin';
 link.href=url;link.download=`prueba.${extension}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
