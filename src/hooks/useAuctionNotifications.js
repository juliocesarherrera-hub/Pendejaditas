import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {auctionQuery,auctions} from '../lib/auctions';
export const notificationLabels={outbid:'Superaron tu puja',winner_provisional:'Tu puja ganó provisionalmente · sin pago',seller_result:'Tu subasta terminó · consulta el resultado',cancelled:'Subasta cancelada'};
export function useAuctionNotifications(userId){
 const [state,setState]=useState({owner:null,rows:[],error:''});
 useEffect(()=>{
  if(!userId||!supabase)return;let active=true;
  async function sync(){try{const rows=await auctionQuery(supabase.from('auction_notifications').select('id,auction_id,kind,read_at,created_at,auctions(product_id)').order('created_at',{ascending:false}).limit(100));if(active)setState({owner:userId,rows,error:''});}catch(failure){if(active)setState({owner:userId,rows:[],error:failure.message});}}
  Promise.resolve().then(sync);
  const channel=supabase.channel(`auction-notifications-${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'auction_notifications',filter:`user_id=eq.${userId}`},sync).subscribe(status=>{if(status==='SUBSCRIBED')void sync();});
  const foreground=()=>{if(!document.hidden)void sync();};const timer=setInterval(foreground,15000);window.addEventListener('focus',foreground);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',foreground);void supabase.removeChannel(channel);};
 },[userId]);
 const visible=state.owner===userId?state:{rows:[],error:''};
 return {...visible,unread:visible.rows.filter(row=>!row.read_at).length,read:async id=>{await auctions.readNotification(id);setState(current=>current.owner===userId?{...current,rows:current.rows.map(row=>row.id===id?{...row,read_at:new Date().toISOString()}:row)}:current);}};
}
