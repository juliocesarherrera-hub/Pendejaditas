import {useEffect,useState} from 'react';
import {ProductImage} from './ProductCard';
import {supabase} from '../lib/supabase';
import {auctionQuery} from '../lib/auctions';
export function AuctionGallery({product}){
 const [paths,setPaths]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;auctionQuery(supabase.from('auction_photos').select('image_path,position').eq('auction_id',product.auction.id).order('position')).then(rows=>{if(active)setPaths(rows.map(row=>row.image_path));}).catch(failure=>{if(active)setError(failure.message);});return()=>{active=false;};},[product.auction.id]);
 const url=path=>supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
 return <><ProductImage src={selected?url(selected):product.image} title={product.title}/><div className="auction-gallery">{paths.map((path,index)=><button key={path} className={selected===path?'selected':''} aria-label={`Ver fotografía ${index+1}`} aria-pressed={(selected||product.imagePath)===path} onClick={()=>setSelected(path)}><ProductImage src={url(path)} title={`Fotografía ${index+1} de ${product.title}`}/></button>)}</div>{error&&<p className="field-error">{error}</p>}</>;
}
