import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {createModeratorMfa,isManagedTotp} from '../lib/moderator-mfa';
const mfa=createModeratorMfa(supabase);
export function ModeratorMfa({onVerified}){
 const [factors,setFactors]=useState(null),[factorId,setFactorId]=useState(''),[setup,setSetup]=useState(null),[code,setCode]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const alive=useRef(true),pendingAction=useRef(false);
 const refresh=useCallback(async()=>{
  try{const state=await mfa.list();if(alive.current){setFactors(state);setFactorId(current=>[...state.verified,...state.pending].some(row=>row.id===current)?current:(state.verified[0]?.id||state.pending[0]?.id||''));setError('');}return state;}
  catch(failure){if(alive.current)setError(failure.message);return null;}
  finally{if(alive.current)setLoading(false);}
 },[]);
 useEffect(()=>{alive.current=true;Promise.resolve().then(refresh);return()=>{alive.current=false;};},[refresh]);
 async function run(action){
  if(pendingAction.current)return;pendingAction.current=true;setBusy(true);setError('');setNotice('');
  try{await action();}catch(failure){if(alive.current){await refresh();setError(failure.message);}}finally{pendingAction.current=false;if(alive.current)setBusy(false);}
 }
 async function showSetup(value){
  // Keep the new factor ID even if QR rendering fails, so the user can retry
  // verification/manual setup without creating a second factor.
  if(alive.current){setSetup(value);setFactorId(value.id);setCode('');}
  const {default:QRCode}=await import('qrcode');const qr=await QRCode.toDataURL(value.uri,{width:256,margin:4,errorCorrectionLevel:'M'});
  if(alive.current)setSetup({...value,qr});await refresh();
 }
 const options=[...(factors?.verified||[]),...(factors?.pending||[])],selected=options.find(row=>row.id===factorId),pending=selected?.status==='unverified';
 return <section className="claim-section mfa-panel"><h2>Acceso autorizado con segundo factor</h2><p>MFA protege tu sesión. Solo una cuenta nombrada expresamente como moderador puede acceder al panel; configurar el autenticador no concede ese permiso.</p>
  {loading&&<p role="status">Consultando tus autenticadores…</p>}
  {factors?.currentLevel==='aal2'&&<p className="success-message" role="status">Segundo factor verificado en esta sesión. Si no aparece el panel, falta el nombramiento administrativo; no vuelvas a crear un autenticador.</p>}
  {!loading&&!factors&&<button className="secondary-button" disabled={busy} onClick={refresh}>Reintentar consulta de autenticadores</button>}
  {factors&&!options.length&&!setup&&<button className="secondary-button" disabled={busy} onClick={()=>run(async()=>showSetup(await mfa.enroll()))}>Configurar mi autenticador</button>}
  {options.length>0&&<label className="mfa-factor-choice">Autenticador de tu cuenta<select value={factorId} disabled={busy} onChange={event=>{setFactorId(event.target.value);setCode('');}}>{options.map(row=><option key={row.id} value={row.id}>{row.friendly_name||'Autenticador'} · {row.status==='verified'?'Verificado':'Pendiente de verificar'}</option>)}</select></label>}
  {pending&&setup?.id!==factorId&&<div className="mfa-pending"><p>Quedó una configuración sin terminar. Si ya la agregaste a tu autenticador, introduce su código. El QR anterior no puede recuperarse después de salir de esta pantalla.</p>{isManagedTotp(selected)&&<button className="secondary-button" disabled={busy} onClick={()=>{
   if(window.confirm('¿Descartar únicamente esta configuración pendiente y generar un QR nuevo? Su código anterior dejará de servir. No se eliminará ningún autenticador verificado.'))run(async()=>showSetup(await mfa.restart(factorId,true)));
  }}>Perdí el QR: reiniciar configuración pendiente</button>}</div>}
  {setup?.id===factorId&&<div className="mfa-setup">{setup.qr?<img className="moderator-mfa-qr" src={setup.qr} width={256} height={256} alt="QR privado para configurar tu autenticador"/>:<p role="status">Preparando QR. También puedes usar la clave manual.</p>}<p>Escanea con una aplicación de autenticación, como Google Authenticator, Microsoft Authenticator o una compatible con TOTP. Este QR no se lee con el escáner de entregas de Pendejaditas.</p><a className="text-button" href={setup.uri}>Abrir en mi autenticador, si el dispositivo lo permite</a><details><summary>No puedo escanear: configurar con clave manual</summary><p>En tu autenticador agrega una clave de tipo «basada en tiempo» y escribe esta clave privada:</p><code className="mfa-private-key">{setup.secret}</code></details><p className="field-hint">No compartas este QR, la clave ni los códigos. Se mantienen únicamente en memoria mientras estás en esta pantalla.</p></div>}
  {options.length>0&&factors?.currentLevel!=='aal2'&&<form className="claim-form" onSubmit={event=>{event.preventDefault();run(async()=>{const state=await mfa.verify(factorId,code);if(alive.current){setFactors(state);setCode('');setSetup(null);setNotice('Segundo factor confirmado por Supabase.');}await onVerified();});}}><label>Código de seis dígitos de tu autenticador<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} disabled={busy}/></label><button className="primary-button" disabled={busy||code.length!==6}>{busy?'Verificando…':'Verificar segundo factor'}</button></form>}
  {error&&<p className="field-error" role="alert">{error}</p>}{notice&&<p className="success-message" role="status">{notice}</p>}
 </section>;
}
