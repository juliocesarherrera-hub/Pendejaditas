import {useCallback,useEffect,useRef,useState} from 'react';
import {Gavel,RefreshCw} from 'lucide-react';
import {auctions,auctionQuery} from '../lib/auctions';
import {supabase} from '../lib/supabase';
import {chat} from '../lib/chat';
import {money} from '../data/products';
import {auctionStatus,remainingTime,serverClock,serverNow} from '../utils/auction-time';

export function AuctionPanel({product,user,navigate}){
  const [state,setState]=useState(null),[history,setHistory]=useState([]),[result,setResult]=useState(null);
  const [amount,setAmount]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[tick,setTick]=useState(0),[live,setLive]=useState(false),[reason,setReason]=useState('');
  const [limit,setLimit]=useState(30);
  const pending=useRef(null),active=useRef(true),version=useRef(0);
  const id=product.auction?.id;
  const refresh=useCallback(async()=>{
    if(!id)return;
    const request=++version.current;
    try{
      const snapshot=await auctions.snapshot(id);
      const clock=serverClock(snapshot.server_time);
      const [rows,results]=await Promise.all([
        auctionQuery(supabase.from('auction_bid_history').select('bid_id,sequence,amount,bidder_alias,created_at').eq('auction_id',id).order('sequence',{ascending:false}).limit(limit)),
        user?auctionQuery(supabase.from('auction_results').select('winner_id,amount,exchange_id').eq('auction_id',id)):Promise.resolve([]),
      ]);
      if(active.current&&request===version.current){setState({...snapshot.auction,clock});setHistory(rows);setResult(results[0]||null);setError('');}
    }catch(failure){if(active.current&&request===version.current)setError(failure.message);}
  },[id,user,limit]);
  useEffect(()=>{
    active.current=true;Promise.resolve().then(refresh);
    if(!id)return;
    const channel=supabase.channel(`auction-detail-${id}`);
    for(const table of ['auctions','auction_bid_history'])channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`${table==='auctions'?'id':'auction_id'}=eq.${id}`},refresh);
    channel.subscribe(status=>{if(active.current){setLive(status==='SUBSCRIBED');if(status==='SUBSCRIBED')void refresh();}});
    const sync=()=>{if(!document.hidden)void refresh();};
    const invalidate=()=>{version.current++;};
    const timer=setInterval(sync,10000);window.addEventListener('focus',sync);
    document.addEventListener('visibilitychange',sync);
    return()=>{active.current=false;invalidate();clearInterval(timer);window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);void supabase.removeChannel(channel);};
  },[id,refresh]);
  useEffect(()=>{const timer=setInterval(()=>setTick(n=>n+1),1000);return()=>clearInterval(timer);},[]);
  void tick;
  async function bid(event){
    event.preventDefault();if(!user){navigate('auth/login');return;}
    if(!window.confirm(`¿Confirmas una puja real de ${money(Number(amount))} MXN? No se realizará ningún cobro.`))return;
    setBusy(true);setError('');setNotice('');
    if(!pending.current||pending.current.amount!==amount)pending.current={amount,nonce:crypto.randomUUID()};
    try{const response=await auctions.bid(id,Number(amount),pending.current.nonce);if(!active.current)return;if(response.accepted){pending.current=null;setAmount('');}await refresh();if(response.accepted)setNotice(response.message);else setError(response.message);}
    catch(failure){if(active.current)setError(failure.message);}finally{if(active.current)setBusy(false);}
  }
  async function coordinate(){setBusy(true);setError('');try{const exchange=await auctions.coordinate(id);const conversation=await chat.open(exchange);navigate(`messages/${conversation}`);}catch(failure){setError(failure.message);}finally{setBusy(false);}}
  async function cancel(event){event.preventDefault();if(!window.confirm('¿Cancelar esta subasta sin pujas? El historial se conservará.'))return;setBusy(true);setError('');try{await auctions.cancel(id,reason);await refresh();}catch(failure){setError(failure.message);}finally{setBusy(false);}}
  if(!state)return <section className="auction-panel"><p role="status">Cargando subasta desde el servidor…</p>{error&&<p role="alert" className="field-error">{error}</p>}<button className="text-button" onClick={refresh}>Reintentar</button></section>;
  const now=serverNow(state.clock),deadline=Date.parse(state.status==='scheduled'?state.starts_at:state.ends_at);
  const current=Number(state.highest_amount??state.initial_price),minimum=state.bid_count?current+Number(state.min_increment):Number(state.initial_price);
  const own=user?.id===state.seller_id;
  const canBid=state.status==='active'&&now<Date.parse(state.ends_at)&&minimum<=1000000;
  return <section className="auction-panel" aria-label="Subasta real"><div className="auction-heading"><h2><Gavel size={20}/> Subasta</h2><span>{live?'Actualización en tiempo real':'Reconectando · respaldo cada 10 s'}</span></div>
    <p className="auction-state">{auctionStatus[state.status]}</p><p className="auction-price"><span>{state.bid_count?'Puja actual':'Precio inicial'}</span><strong>{money(current)} <small>MXN</small></strong></p>
    <dl className="auction-facts"><div><dt>Incremento mínimo</dt><dd>{money(Number(state.min_increment))}</dd></div><div><dt>Pujas válidas</dt><dd>{state.bid_count}</dd></div><div><dt>Mejor postor</dt><dd>{state.leader_alias||'Sin pujas'}</dd></div></dl>
    {['scheduled','active'].includes(state.status)&&<p className="auction-timer"><span>{state.status==='scheduled'?'Inicia en':'Tiempo restante'}</span><strong>{remainingTime(deadline,now)}</strong></p>}
    <p className="field-hint">Cierre: {new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'medium'}).format(new Date(state.ends_at))} · Querétaro. Último minuto: cada puja válida suma dos minutos al cierre.</p>
    {state.extension_count>0&&<p className="success-message">Anti-snipe: {state.extension_count} {state.extension_count===1?'extensión aplicada':'extensiones aplicadas'} por el servidor.</p>}
    <p className="demo-notice">Las pujas se guardan realmente. Ganar genera un resultado provisional para coordinar la cita y la entrega. La entrega puede registrarse mediante QR; ese registro no verifica un pago. Los pagos digitales siguen deshabilitados.</p>
    {error&&<p role="alert" className="field-error">{error}</p>}{notice&&<p role="status" className="success-message">{notice}</p>}
    {canBid&&!own&&(user?<form className="auction-bid-form" onSubmit={bid}><label>Tu puja en MXN<input type="number" min={minimum} max="1000000" step="1" required value={amount} onChange={event=>setAmount(event.target.value)} disabled={busy}/></label><p className="field-hint">Mínimo actual: {money(minimum)}. Puede cambiar si alguien puja antes.</p><button className="primary-button" disabled={busy}>{busy?'Confirmando con el servidor…':'Confirmar puja'}</button></form>:<button className="primary-button" onClick={()=>navigate('auth/login')}>Iniciar sesión para pujar</button>)}
    {own&&<p className="field-hint">Eres el vendedor; no puedes pujar por tu propio artículo.</p>}
    {state.status==='ended_winner'&&<div className="auction-result"><h3>Ganador provisional: {state.leader_alias}</h3><p>{result?.winner_id===user?.id?'Tu puja fue la más alta. No se ha realizado ningún pago.':'Resultado determinado por el servidor. No significa que la transacción esté pagada.'}</p>{result&&<button className="secondary-button" disabled={busy} onClick={coordinate}>Coordinar con la otra persona por chat</button>}</div>}
    {own&&state.bid_count===0&&['scheduled','active'].includes(state.status)&&now<Date.parse(state.ends_at)&&<details><summary>Cancelar subasta sin pujas</summary><form className="auction-bid-form" onSubmit={cancel}><label>Motivo público<textarea value={reason} onChange={event=>setReason(event.target.value)} required minLength={10} maxLength={500}/></label><button className="secondary-button" disabled={busy}>Cancelar con este motivo</button></form></details>}
    {state.cancellation_reason&&<p>Motivo de cancelación: {state.cancellation_reason}</p>}
    <details className="auction-terms"><summary>Condiciones de esta subasta</summary><p>{state.terms}</p><p>Reglas y publicación fijas desde el inicio. Sin pagos ni depósitos.</p></details>
    <div className="auction-history"><h3>Historial de pujas</h3><button className="text-button" onClick={refresh}><RefreshCw size={15}/> Actualizar</button>{!history.length?<p>Todavía no hay pujas válidas.</p>:<ol>{history.map(row=><li key={row.bid_id}><span>{row.bidder_alias}<time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('es-MX')}</time></span><strong>{money(Number(row.amount))}</strong></li>)}</ol>}{history.length===limit&&<button className="text-button" onClick={()=>setLimit(n=>n+30)}>Mostrar más pujas</button>}</div>
  </section>;
}
