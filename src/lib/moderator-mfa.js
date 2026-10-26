// Auth only: no database privileges, administrative grants or persistent secrets.
export const isManagedTotp=factor=>factor.friendly_name==='Moderación Pendejaditas'||factor.friendly_name?.startsWith('Pendejaditas ');
export function totpState(data){
 const all=data?.all||data?.totp||[];
 return {verified:all.filter(row=>row.factor_type==='totp'&&row.status==='verified'),pending:all.filter(row=>row.factor_type==='totp'&&row.status==='unverified')};
}
function enrollmentError(error){
 if(error?.code==='mfa_factor_name_conflict')return new Error('Hay una configuración pendiente con ese nombre. Actualiza los factores y utiliza o reinicia la configuración pendiente.');
 if(error?.code==='mfa_max_enrolled_factors')return new Error('Tu cuenta alcanzó el límite de factores. No se eliminó ninguno; revisa tus configuraciones pendientes.');
 return new Error('No se pudo registrar el autenticador. Consulta los factores antes de reintentar; no se eliminó ningún factor verificado.');
}
export function createModeratorMfa(client){
 async function list(){
  const {data,error}=await client.auth.mfa.listFactors();if(error)throw new Error('No se pudieron consultar tus autenticadores. Comprueba la conexión y actualiza.');
  const {data:assurance,error:aalError}=await client.auth.mfa.getAuthenticatorAssuranceLevel();if(aalError)throw new Error('No se pudo comprobar el segundo factor de tu sesión.');
  return {...totpState(data),currentLevel:assurance.currentLevel};
 }
 async function enroll(){
  const state=await list();
  if(state.verified.length)throw new Error('Tu cuenta ya tiene un autenticador verificado. Utiliza su código; no hace falta crear otro.');
  if(state.pending.length)throw new Error('Existe una configuración pendiente. Si ya la escaneaste, introduce su código; si perdiste el QR, reiníciala con el botón indicado.');
  const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:`Pendejaditas ${crypto.randomUUID().slice(0,8)}`});
  if(error)throw enrollmentError(error);
  return {id:data.id,uri:data.totp.uri,secret:data.totp.secret};
 }
 return {list,enroll,
  restart:async(id,confirmed)=>{
   if(confirmed!==true)throw new Error('Debes confirmar que deseas descartar esta configuración pendiente.');
   const state=await list();const pending=state.pending.find(row=>row.id===id);
   if(state.verified.length||!pending||!isManagedTotp(pending))throw new Error('Solo puedes reiniciar una configuración pendiente de Pendejaditas. Los factores verificados se conservan.');
   const {error}=await client.auth.mfa.unenroll({factorId:id});if(error)throw new Error('No se pudo descartar la configuración pendiente. Actualiza antes de reintentar.');
   return enroll();
  },
  verify:async(id,code)=>{
   if(!/^\d{6}$/.test(code))throw new Error('Escribe los seis dígitos de tu autenticador.');
   const state=await list();if(![...state.verified,...state.pending].some(row=>row.id===id))throw new Error('Actualiza y selecciona un autenticador de tu cuenta.');
   const {error}=await client.auth.mfa.challengeAndVerify({factorId:id,code});if(error)throw new Error('Código incorrecto o vencido. Revisa tu autenticador y la hora automática del dispositivo.');
   const current=await list();if(current.currentLevel!=='aal2')throw new Error('El servidor no confirmó el segundo factor. Vuelve a consultar tu sesión.');
   return current;
  },
 };
}
