export const auctionStatus={scheduled:'Programada',active:'Activa',ended_no_bids:'Finalizada sin pujas',ended_winner:'Ganador provisional · compra pendiente',cancelled:'Cancelada'};
export function serverClock(time,monotonic=performance.now()){return {epoch:Date.parse(time),monotonic};}
export function serverNow(clock,monotonic=performance.now()){return clock?clock.epoch+monotonic-clock.monotonic:NaN;}
export function remainingTime(deadline,now){
  if(!Number.isFinite(now)||!Number.isFinite(deadline))return 'Sincronizando…';
  const seconds=Math.max(0,Math.ceil((deadline-now)/1000));
  if(!seconds)return 'Verificando cierre…';
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
}
