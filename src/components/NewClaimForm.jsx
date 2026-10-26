import {useRef,useState} from 'react';
import {claimReasons} from '../lib/claims-core';
import {claimTargets,selectedClaimTarget} from '../lib/claim-form';
export function NewClaimForm({exchanges=[],appointments=[],deliveries=[],initialExchangeId='',ready,busy,existing=[],onSubmit,onOpenExisting}){
 const [selected,setSelected]=useState(initialExchangeId),[target,setTarget]=useState(''),[reason,setReason]=useState('not_as_described'),[body,setBody]=useState('');
 const attempt=useRef(null);
 const exchange=exchanges.find(row=>row.id===selected),targets=claimTargets(exchange,appointments,deliveries),chosen=selectedClaimTarget(target,targets);
 const [targetKind,targetId]=chosen.split(':');
 const previous=existing.find(row=>row.exchange_id===selected&&row.target_kind===targetKind&&row.target_id===targetId&&row.status!=='resolved');
 const complete=ready&&Boolean(exchange&&chosen)&&body.trim().length>=20&&body.trim().length<=4000;
 return <form className="claim-form" onSubmit={async event=>{
  event.preventDefault();if(!complete||busy||previous)return;
  const payload={exchangeId:selected,targetKind,targetId,reason,body:body.trim()},key=JSON.stringify(payload);
  if(attempt.current?.key!==key)attempt.current={key,nonce:crypto.randomUUID()};
  await onSubmit({...payload,nonce:attempt.current.nonce});
 }}>
  <label>Operación<select required value={selected} disabled={busy||!ready} onChange={event=>{setSelected(event.target.value);setTarget('');}}><option value="">Selecciona una operación</option>{exchanges.map(row=><option key={row.id} value={row.id}>{row.product_title}</option>)}</select></label>
  <label>La reclamación se relaciona con<select required value={chosen} disabled={!exchange||busy||!ready} onChange={event=>setTarget(event.target.value)}><option value="">Primero selecciona una operación</option>{targets.map(row=><option key={`${row.kind}:${row.id}`} value={`${row.kind}:${row.id}`}>{row.label}</option>)}</select></label>
  <label>Motivo<select value={reason} onChange={event=>setReason(event.target.value)} disabled={busy||!ready}>{Object.entries(claimReasons).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label>Describe qué ocurrió<textarea required minLength={20} maxLength={4000} rows={6} value={body} disabled={busy||!ready} onChange={event=>setBody(event.target.value)} aria-describedby="claim-description-help"/></label>
  <p id="claim-description-help" className="field-hint">Seleccionar las opciones no guarda un caso. Describe lo ocurrido con al menos 20 caracteres y pulsa el botón de envío. Tu versión será visible para la otra parte.</p>
  <p className="field-hint" aria-live="polite">{body.trim().length.toLocaleString('es-MX')} de 4,000 caracteres.{ready&&!exchanges.length?' No tienes operaciones disponibles para abrir un caso.':''}</p>
  {previous?<div className="claim-existing" role="status"><p>Ya existe una reclamación abierta sobre este contexto. Puedes consultar el expediente y agregar tu versión.</p><button type="button" className="secondary-button" disabled={busy} onClick={()=>onOpenExisting(previous.id)}>Abrir reclamación existente</button></div>:<button className="primary-button" disabled={!complete||busy}>{busy?'Guardando reclamación…':'Enviar mi versión y abrir el caso'}</button>}
  <p className="field-hint">Después de guardar podrás adjuntar fotografías o documentos privados. Tu texto se conserva mientras completas este formulario; si sales de la pantalla no se guarda un borrador.</p>
 </form>;
}
