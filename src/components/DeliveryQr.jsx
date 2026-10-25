import {useEffect,useState} from 'react';
export function DeliveryQr({payload,seconds}){
 const [image,setImage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true;import('qrcode').then(module=>(module.default||module).toString(payload,{type:'svg',errorCorrectionLevel:'M',margin:4,width:320})).then(svg=>{if(active)setImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));}).catch(()=>{if(active)setError('No se pudo dibujar el QR. Actualiza la conexión antes de emitir otro.');});return()=>{active=false;};},[payload]);
 return <div className="delivery-qr">{image?<img src={image} alt="QR temporal privado para el vendedor" width="320" height="320" draggable={false}/>:<p role="status">{error||'Preparando QR local…'}</p>}<strong>Caduca en {seconds} s</strong><p>No compartas capturas ni lo envíes por chat. Al ocultar esta página dejaremos de mostrarlo.</p></div>;
}
