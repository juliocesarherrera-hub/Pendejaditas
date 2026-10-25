import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {chat} from '../lib/chat';

export function useChatInbox(userId) {
  const [state,setState] = useState({owner:null,rows:[],loading:true,error:'',connection:'connecting',notification:null});
  const refreshRef = useRef(() => {});
  const refresh = useCallback(() => refreshRef.current(),[]);
  useEffect(() => {
    if (!userId || !supabase) return;
    let active = true, running = false, again = false, known = null;
    async function sync() {
      if (!active) return;
      if (running) { again = true; return; }
      running = true;
      try {
        const rows = await chat.inbox();
        if (active) {
          const incoming = known && rows.find(row => Number(row.unread_count) > (known.get(row.conversation_id) ?? 0));
          known = new Map(rows.map(row => [row.conversation_id,Number(row.unread_count)]));
          setState(current => ({...current,owner:userId,rows,loading:false,error:'',notification:incoming ? {id:incoming.conversation_id,name:incoming.other_name} : current.owner===userId ? current.notification : null}));
        }
      } catch (failure) { if (active) setState(current => ({...current,owner:userId,rows:current.owner===userId?current.rows:[],notification:null,loading:false,error:failure.message})); }
      finally { running = false; if (again && active) { again = false; void sync(); } }
    }
    refreshRef.current = sync;
    const channel = supabase.channel(`private-inbox-${userId}`);
    for (const table of ['chat_messages','chat_conversations','chat_reads']) {
      for (const event of ['INSERT','UPDATE']) channel.on('postgres_changes',{event,schema:'public',table},sync);
    }
    channel.subscribe(status => {
      if (!active) return;
      setState(current => ({...current,owner:userId,rows:current.owner===userId?current.rows:[],notification:current.owner===userId?current.notification:null,loading:current.owner===userId?current.loading:true,connection:status === 'SUBSCRIBED' ? 'live' : 'reconnecting'}));
      if (status === 'SUBSCRIBED') void sync();
    });
    const foreground = () => { if (!document.hidden) void sync(); };
    void sync();
    const timer = setInterval(foreground,15000);
    window.addEventListener('focus',foreground);
    window.addEventListener('pendejaditas:chat-changed',foreground);
    document.addEventListener('visibilitychange',foreground);
    return () => { active=false; refreshRef.current=()=>{}; clearInterval(timer); window.removeEventListener('focus',foreground); window.removeEventListener('pendejaditas:chat-changed',foreground); document.removeEventListener('visibilitychange',foreground); void supabase.removeChannel(channel); };
  },[userId]);
  const dismiss = () => setState(current => ({...current,notification:null}));
  const visible = userId && state.owner === userId ? state : {rows:[],loading:true,error:'',connection:'connecting',notification:null};
  return {...visible,refresh,dismiss,unread:visible.rows.reduce((sum,row)=>sum+Number(row.unread_count),0)};
}
