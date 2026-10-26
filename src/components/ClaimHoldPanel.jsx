import {useState} from 'react';
import {claims,claimTime,requireClaimSuccess} from '../lib/claims';
import {holdIsActive,matchingClaimHold} from '../lib/claim-holds';
export function ClaimHoldPanel({claimId,closed,holds=[],serverTime,busy,run}){
 const [scope,setScope]=useState('exchange'),[deliveryId,setDeliveryId]=useState(''),[hours,setHours]=useState(1),[reason,setReason]=useState(''),[releaseReason,setReleaseReason]=useState('');
 const duplicate=matchingClaimHold(holds,scope,deliveryId,serverTime),active=holds.filter(hold=>holdIsActive(hold,serverTime));
 return <section className="claim-section"><h2>Pausas preventivas de esta operación</h2><p>Detienen la coordinación o la entrega seleccionada. No suspenden cuentas, pujas ni pagos. Hay {active.length} pausa{active.length===1?'':'s'} vigente{active.length===1?'':'s'} en este expediente según la última consulta.</p>
  {holds.length>0&&<ul className="claim-records">{holds.map(hold=>{
   const current=holdIsActive(hold,serverTime);
   return <li key={hold.id}><div><strong>{current?'Vigente':hold.active?'Vencida':'Retirada'} · {hold.scope==='exchange'?'Coordinación completa':'Entrega específica'}</strong><p>Identificador: {hold.id}</p><p>Vencimiento: {claimTime(hold.expires_at)}</p><p className="claim-body">{hold.reason}</p>{current&&<button className="secondary-button" type="button" disabled={busy||releaseReason.trim().length<20} onClick={()=>{
    if(window.confirm('¿Retirar únicamente esta pausa? Otras pausas vigentes seguirán bloqueando la operación. Los QR y entregas canceladas no se reactivan.'))run(async()=>requireClaimSuccess(await claims.releaseHold(claimId,hold.id,releaseReason.trim())));
   }}>Retirar esta pausa</button>}</div></li>;
  })}</ul>}
  {active.length>0&&<div className="claim-form"><label>Justificación para retirar una pausa<textarea minLength={20} maxLength={1500} rows={3} disabled={busy} value={releaseReason} onChange={event=>setReleaseReason(event.target.value)} aria-describedby="hold-release-help"/></label><p className="field-hint" id="hold-release-help">Escribe al menos 20 caracteres; después pulsa «Retirar esta pausa» en la fila correspondiente. Se retira solo esa pausa y se conserva la bitácora.</p></div>}
  <details className="claim-section"><summary>Aplicar una pausa nueva</summary><form className="claim-form" onSubmit={event=>{
   event.preventDefault();if(duplicate||closed||busy)return;
   if(window.confirm('¿Aplicar una pausa a esta operación? Se cancelarán sus entregas pendientes y los QR anteriores no se reactivarán al retirarla.'))run(async()=>{requireClaimSuccess(await claims.hold(claimId,scope,scope==='delivery'?deliveryId:null,Number(hours),reason.trim()));setReason('');});
  }}><label>Alcance<select value={scope} onChange={event=>setScope(event.target.value)} disabled={busy||closed}><option value="exchange">Coordinación completa del intercambio</option><option value="delivery">Entrega específica</option></select></label>{scope==='delivery'&&<label>Identificador de entrega relacionada<input required disabled={busy||closed} value={deliveryId} onChange={event=>setDeliveryId(event.target.value)}/></label>}<label>Duración en horas<input required type="number" min={1} max={72} value={hours} onChange={event=>setHours(event.target.value)} disabled={busy||closed}/></label><label>Motivo visible para los participantes<textarea required minLength={20} maxLength={1500} rows={3} disabled={busy||closed} value={reason} onChange={event=>setReason(event.target.value)}/></label>{duplicate&&<p className="field-hint" role="status">Ya hay una pausa vigente que cubre este alcance. No necesitas aplicar otra. Puedes revisar o retirar la existente arriba.</p>}<button className="secondary-button" disabled={busy||closed||Boolean(duplicate)||reason.trim().length<20}>Aplicar pausa con vencimiento</button></form></details>
  <p className="field-hint">Retirar o vencer una pausa no revive los códigos QR ni las entregas canceladas. Si hay otras pausas vigentes, la operación seguirá bloqueada.</p>
 </section>;
}
