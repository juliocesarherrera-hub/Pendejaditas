import {useCallback,useEffect,useRef,useState} from 'react';
export function usePrivateLoad(load){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[refreshing,setRefreshing]=useState(true);
 const alive=useRef(true),version=useRef(0),actionPending=useRef(false);
 const refresh=useCallback(async({announce=false}={})=>{
  const current=++version.current;if(alive.current){setRefreshing(true);if(announce)setNotice('');}
  try{const result=await load();if(!alive.current||current!==version.current)return false;setData(result);setError('');if(announce)setNotice('Información actualizada desde el servidor.');return true;}
  catch(failure){if(alive.current&&current===version.current){setData(null);setError(failure.message);}return false;}
  finally{if(alive.current&&current===version.current)setRefreshing(false);}
 },[load]);
 useEffect(()=>{alive.current=true;Promise.resolve().then(refresh);const focus=()=>{if(!document.hidden)void refresh();};const invalidate=()=>{alive.current=false;version.current++;};window.addEventListener('focus',focus);return()=>{invalidate();window.removeEventListener('focus',focus);};},[refresh]);
 const run=async(action)=>{if(actionPending.current)return false;actionPending.current=true;setBusy(true);setError('');setNotice('');try{await action();if(!alive.current)return false;const fresh=await refresh();if(fresh)setNotice('Acción confirmada por el servidor.');return fresh;}catch(failure){if(alive.current){await refresh();setError(failure.message);}return false;}finally{actionPending.current=false;if(alive.current)setBusy(false);}};
 return {data,error,busy,notice,refresh,refreshing,run};
}
