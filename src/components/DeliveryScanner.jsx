import {useEffect,useRef,useState} from 'react';
import {Camera,ImagePlus} from 'lucide-react';
import {parseDeliveryQr} from '../lib/delivery-core';
export function DeliveryScanner({operationId,onDecoded,disabled}){
 const video=useRef(null),scanner=useRef(null),alive=useRef(true),starting=useRef(false);
 const [running,setRunning]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 function stop(){scanner.current?.destroy();scanner.current=null;starting.current=false;if(alive.current)setRunning(false);}
 useEffect(()=>{alive.current=true;const hide=()=>{if(document.hidden)stop();};const offline=()=>stop();document.addEventListener('visibilitychange',hide);window.addEventListener('offline',offline);return()=>{alive.current=false;scanner.current?.destroy();scanner.current=null;document.removeEventListener('visibilitychange',hide);window.removeEventListener('offline',offline);};},[]);
 useEffect(()=>{if(disabled&&scanner.current){scanner.current.destroy();scanner.current=null;Promise.resolve().then(()=>{if(alive.current)setRunning(false);});}},[disabled]);
 function decoded(value){try{const qr=parseDeliveryQr(value);if(qr.operationId!==operationId)throw new Error('Ese QR corresponde a otra operación. Abre la entrega correcta.');stop();onDecoded(value);setError('');}catch(failure){if(alive.current)setError(failure.message);}}
 async function start(){
  if(starting.current||disabled)return;starting.current=true;setBusy(true);setError('');
  try{
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('camera_unavailable');
   const {default:QrScanner}=await import('qr-scanner');if(!alive.current)return;
   const reader=new QrScanner(video.current,result=>decoded(result.data),{preferredCamera:'environment',maxScansPerSecond:4,returnDetailedScanResult:true,onDecodeError:()=>{}});scanner.current=reader;
   await reader.start();if(!alive.current||scanner.current!==reader){reader.destroy();return;}setRunning(true);
  }catch{stop();if(alive.current)setError('No se pudo abrir la cámara. Usa HTTPS o localhost, permite el acceso en tu navegador y cierra otras apps que usen la cámara. También puedes leer una imagen local.');}
  finally{starting.current=false;if(alive.current)setBusy(false);}
 }
 async function image(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;stop();setBusy(true);setError('');try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10485760)throw new Error('invalid_image');const {default:QrScanner}=await import('qr-scanner');const result=await QrScanner.scanImage(file,{returnDetailedScanResult:true});if(alive.current)decoded(result.data);}catch{if(alive.current)setError('No se encontró un QR de entrega legible. Elige una imagen JPG, PNG o WebP de hasta 10 MB.');}finally{if(alive.current)setBusy(false);}}
 return <section className="delivery-scanner" aria-label="Escáner de entrega"><video ref={video} playsInline muted aria-label="Vista de cámara para leer QR" hidden={!running}/><div className="delivery-actions"><button type="button" className="secondary-button" disabled={disabled||busy} onClick={running?stop:start}><Camera size={18}/>{busy?'Abriendo lector…':running?'Cerrar cámara':'Abrir cámara'}</button><label className="secondary-button scanner-file"><ImagePlus size={18}/> Leer imagen local<input type="file" accept="image/png,image/jpeg,image/webp" onChange={image} disabled={disabled||busy}/></label></div><p className="field-hint">La lectura es local. No se sube la imagen. Escanear no confirma nada: revisa el artículo y confirma expresamente.</p>{error&&<p className="field-error" role="alert">{error}</p>}</section>;
}
