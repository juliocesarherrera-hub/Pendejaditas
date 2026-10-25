import {useState} from 'react';
import {EmptyState} from '../components/EmptyState';
import {notificationLabels} from '../hooks/useAuctionNotifications';
export function NotificationsPage({notifications,navigate}){
 const [error,setError]=useState('');
 async function open(row){try{await notifications.read(row.id);navigate(`product/${row.auctions.product_id}`);}catch(failure){setError(failure.message);}}
 return <><section className="page-heading"><h1>Avisos de subastas<span className="heading-dot">.</span></h1><p>Resultados provisionales y cambios de puja. Ningún aviso confirma un pago.</p></section>{(error||notifications.error)&&<p role="alert" className="field-error">{error||notifications.error}</p>}{!notifications.rows.length?<EmptyState title="Todavía no tienes avisos" description="Aquí aparecerán las novedades de tus pujas y subastas." action="Explorar subastas" onAction={()=>navigate('auctions')}/>:<ul className="auction-notifications">{notifications.rows.map(row=><li key={row.id}><div><strong>{notificationLabels[row.kind]}</strong><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('es-MX')}</time>{!row.read_at&&<span className="neutral-badge">Sin leer</span>}</div><button className="secondary-button" onClick={()=>open(row)}>Ver subasta</button></li>)}</ul>}</>;
}
