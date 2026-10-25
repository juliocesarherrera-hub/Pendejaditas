import {supabase} from './supabase';
import {createDeliveryService} from './delivery-core';
export const deliveries=createDeliveryService(supabase);
export const deliveryStatus={ready:'Lista para coordinar',awaiting_confirmation:'Falta confirmar recepción',recorded:'Entrega registrada por ambas partes',cancelled:'Cancelada',review:'En revisión'};
export const deliveryEvents={created:'Operación preparada',qr_issued:'QR temporal emitido',seller_confirmed:'El vendedor confirmó la entrega',buyer_confirmed_delivery:'El comprador confirmó la recepción',cancelled:'Operación cancelada',context_changed:'Acuerdo o cita modificados',paused_for_review:'Operación pausada para revisión',review_decision:'Decisión administrativa registrada',review_completed:'Revisión finalizada'};
export async function deliveryQuery(query){const{data,error}=await query;if(error)throw new Error('No se pudo consultar la entrega. Revisa la sesión y conexión.');return data;}
export const deliveryHealth=()=>deliveryQuery(supabase.rpc('delivery_health'));
