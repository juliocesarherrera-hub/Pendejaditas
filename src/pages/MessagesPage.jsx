import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,CalendarDays,Flag,MessageCircle,Phone,Send,ShieldBan,UserRound} from 'lucide-react';
import {chat} from '../lib/chat';
import {supabase} from '../lib/supabase';
import {EmptyState} from '../components/EmptyState';

const stamp = value => new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));

function Conversation({entry,user,navigate,inbox}) {
  const refreshInbox = inbox.refresh;
  const [messages,setMessages] = useState([]);
  const [draft,setDraft] = useState('');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [more,setMore] = useState(false);
  const [blocked,setBlocked] = useState(false);
  const [reporting,setReporting] = useState(false);
  const [reason,setReason] = useState('harassment');
  const [details,setDetails] = useState('');
  const pending = useRef(null);
  const bottom = useRef(null);
  const alive = useRef(true);
  const sync = useCallback(async () => {
    try {
      const rows = await chat.messages(entry.conversation_id);
      if (!alive.current) return;
      setMessages(current => {
        // Rejoin after a long outage without silently leaving a gap in history.
        const base = current.length && rows.at(-1)?.sequence > current.at(-1).sequence+1 ? [] : current;
        return [...new Map([...base,...rows].map(row=>[row.id,row])).values()].sort((a,b)=>a.sequence-b.sequence);
      });
      setMore(current => current || rows.length === 50);
      setLoading(false);
    } catch(failure) { if (alive.current) { setError(failure.message); setLoading(false); } }
  },[entry.conversation_id]);
  useEffect(() => {
    alive.current=true;
    Promise.resolve().then(sync);
    chat.blocks().then(rows=>{if(alive.current)setBlocked(rows.some(row=>row.blocked_id===entry.other_user_id));}).catch(failure=>{if(alive.current)setError(failure.message);});
    const channel = supabase.channel(`conversation-${entry.conversation_id}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:`conversation_id=eq.${entry.conversation_id}`},sync)
      .subscribe(status=>{if(status==='SUBSCRIBED')void sync();});
    const foreground=()=>{if(!document.hidden)void sync();};
    const timer=setInterval(foreground,15000);
    document.addEventListener('visibilitychange',foreground);
    return ()=>{alive.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',foreground);void supabase.removeChannel(channel);};
  },[entry.conversation_id,entry.other_user_id,sync]);
  const latest = messages.at(-1)?.sequence || 0;
  useEffect(()=>{
    bottom.current?.scrollIntoView({block:'nearest'});
    const read = async()=>{
      if(document.hidden || !latest || latest<=entry.last_read_sequence)return;
      try {await chat.read(entry.conversation_id,latest);refreshInbox();}
      catch(failure){if(alive.current)setError(failure.message);}
    };
    void read(); document.addEventListener('visibilitychange',read);
    return ()=>document.removeEventListener('visibilitychange',read);
  },[latest,entry.conversation_id,entry.last_read_sequence,refreshInbox]);
  async function send(event) {
    event.preventDefault(); if(busy||!draft.trim())return;
    setBusy(true);setError('');
    // Keep nonce after network errors: retry cannot create the same message twice.
    if(!pending.current || pending.current.body!==draft) pending.current={body:draft,nonce:crypto.randomUUID()};
    try {
      await chat.send(entry.conversation_id,pending.current.body,pending.current.nonce);
      if(!alive.current)return;
      pending.current=null;setDraft('');await sync();inbox.refresh();
    } catch(failure) {if(alive.current)setError(failure.message);}
    finally {if(alive.current)setBusy(false);}
  }
  async function older() {
    setBusy(true);setError('');
    try {const rows=await chat.messages(entry.conversation_id,messages[0]?.sequence);if(alive.current){setMessages(current=>[...new Map([...rows,...current].map(row=>[row.id,row])).values()].sort((a,b)=>a.sequence-b.sequence));setMore(rows.length===50);}}
    catch(failure){if(alive.current)setError(failure.message);}finally{if(alive.current)setBusy(false);}
  }
  async function block() {
    if(!window.confirm(blocked?'¿Desbloquear a esta persona?':'¿Bloquear a esta persona? Se impedirá enviar nuevos mensajes entre ambos.'))return;
    setBusy(true);setError('');
    try{await chat.block(entry.other_user_id,!blocked);if(alive.current){setBlocked(!blocked);setNotice(blocked?'Usuario desbloqueado.':'Usuario bloqueado. El historial se conserva.');inbox.refresh();}}
    catch(failure){if(alive.current)setError(failure.message);}finally{if(alive.current)setBusy(false);}
  }
  async function report(event) {
    event.preventDefault();setBusy(true);setError('');
    try{await chat.report(entry.conversation_id,reason,details);if(alive.current){setReporting(false);setDetails('');setNotice('Reporte guardado para revisión. No es un canal de atención inmediata.');}}
    catch(failure){if(alive.current)setError(failure.message);}finally{if(alive.current)setBusy(false);}
  }
  return <section className="conversation-panel" aria-label={`Conversación con ${entry.other_name}`}>
    <header className="conversation-header"><a className="chat-back" href="#messages" aria-label="Volver a conversaciones"><ArrowLeft size={20}/></a><span className="avatar"><UserRound size={22}/></span><div className="chat-person"><h2>{entry.other_name}</h2><p>{inbox.connection==='live'?'Chat conectado':'Reconectando · actualización de respaldo'}</p></div><button className="secondary-button voice-pending" disabled aria-describedby="voice-status"><Phone size={19}/><span>Voz pendiente</span></button></header>
    <p className="chat-context">{entry.product_title}</p><div className="chat-context-actions">{entry.product_id&&<button className="text-button" onClick={()=>navigate(`product/${entry.product_id}`)}>Ver publicación</button>}<button className="text-button" onClick={()=>navigate(`appointments/${entry.exchange_id}`)}><CalendarDays size={15}/> Ver solicitud y cita</button></div>
    <button className="text-button" onClick={()=>navigate(`appointments/${entry.exchange_id}`)}>Preparar o consultar entrega desde la cita</button>
    <p className="chat-voice-note" id="voice-status">Las llamadas requieren configurar LiveKit. No se utilizan números telefónicos.</p>
    <div className="chat-safety"><button className="text-button" disabled={busy} onClick={block}><ShieldBan size={15}/>{blocked?'Desbloquear':'Bloquear'}</button><button className="text-button" disabled={busy} onClick={()=>setReporting(!reporting)}><Flag size={15}/>Reportar</button></div>
    {reporting&&<form className="chat-report" onSubmit={report}><label>Motivo<select value={reason} onChange={event=>setReason(event.target.value)}><option value="harassment">Acoso</option><option value="spam">Spam</option><option value="fraud">Posible fraude</option><option value="other">Otro</option></select></label><label>Detalles opcionales<textarea maxLength={1000} value={details} onChange={event=>setDetails(event.target.value)}/></label><p>El reporte se almacenará para revisión; no hay atención inmediata desde esta sección.</p><button className="secondary-button" disabled={busy}>Enviar reporte</button></form>}
    {error&&<p className="field-error" role="alert">{error}</p>}{notice&&<p className="success-message" role="status">{notice}</p>}
    <div className="message-history" role="region" aria-label="Historial de mensajes" tabIndex={0}>
      {loading&&<p role="status">Cargando mensajes privados…</p>}{more&&<button className="text-button" disabled={busy} onClick={older}>Cargar mensajes anteriores</button>}
      {!loading&&!messages.length&&<div className="chat-first-message"><MessageCircle size={30}/><h3>Comiencen a coordinarse</h3><p>Pregunta por el artículo o acuerden los detalles del encuentro. Evita compartir información sensible.</p></div>}
      {messages.map(message=><article className={`chat-message ${message.sender_id===user.id?'mine':''}`} key={message.id}><p>{message.body}</p><time dateTime={message.created_at}>{message.sender_id===user.id?'Tú':'Otra persona'} · {stamp(message.created_at)}</time></article>)}<div ref={bottom}/>
    </div>
    {!entry.communication_allowed&&<p className="chat-unavailable" role="status">No se pueden enviar mensajes: hay un bloqueo o la solicitud de intercambio está cerrada. Puedes consultar el historial.</p>}
    <form className="message-composer" onSubmit={send}><label className="sr-only" htmlFor="message-body">Mensaje</label><textarea id="message-body" placeholder="Escribe un mensaje…" maxLength={4000} rows={2} value={draft} disabled={busy||!entry.communication_allowed} onChange={event=>setDraft(event.target.value)}/><button className="primary-button" disabled={busy||!entry.communication_allowed||!draft.trim()} aria-label="Enviar mensaje"><Send size={19}/><span>{busy?'Enviando…':'Enviar'}</span></button><span className="composer-count">{draft.length}/4000 · Texto privado entre participantes</span></form>
  </section>;
}

export function MessagesPage({user,id,navigate,inbox}) {
  const entry=inbox.rows.find(row=>row.conversation_id===id);
  if(inbox.loading)return <p role="status">Cargando conversaciones privadas…</p>;
  return <><section className="page-heading"><h1>Mensajes<span className="heading-dot">.</span></h1><p>Coordina tus intercambios sin compartir tu número telefónico.</p></section>
    {inbox.error&&<p className="field-error" role="alert">{inbox.error} <button className="text-button" onClick={inbox.refresh}>Reintentar</button></p>}
    <div className={`messages-layout ${id?'has-conversation':''}`}><aside className="conversation-list" aria-label="Tus conversaciones"><h2>Conversaciones</h2>{!inbox.rows.length?<EmptyState title="Todavía no tienes conversaciones" description="Abre un artículo y elige Contactar al vendedor para comenzar." action="Explorar artículos" onAction={()=>navigate('home')}/>:inbox.rows.map(row=><a href={`#messages/${row.conversation_id}`} className={`conversation-link ${row.conversation_id===id?'selected':''}`} key={row.conversation_id} aria-current={row.conversation_id===id?'page':undefined}><span className="avatar"><UserRound size={20}/></span><span className="conversation-preview"><strong>{row.other_name}</strong><span>{row.product_title}</span><p>{row.last_message||'Envía el primer mensaje'}</p>{row.last_message_at&&<time dateTime={row.last_message_at}>{stamp(row.last_message_at)}</time>}</span>{row.unread_count>0&&<span className="chat-unread" aria-label={`${row.unread_count} mensajes no leídos`}>{row.unread_count>99?'99+':row.unread_count}</span>}</a>)}</aside>
    {entry?<Conversation key={`${user.id}-${id}`} entry={entry} user={user} navigate={navigate} inbox={inbox}/>:<section className="chat-selection"><EmptyState title={id?'Conversación no disponible':'Tus acuerdos, en un solo lugar'} description={id?'Comprueba tu conexión y que seas participante de esta conversación.':'Selecciona una conversación para ver su historial privado.'} action={id?'Volver a conversaciones':undefined} onAction={()=>navigate('messages')}/></section>}</div></>;
}
