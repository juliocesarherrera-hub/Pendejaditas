import { supabase } from './supabase';
import { createMarketplace } from './marketplace-core';
export { productColumns } from './marketplace-core';
import {fetchAuctionRows} from './auctions';
import {serverClock} from '../utils/auction-time';
const marketplace=createMarketplace(supabase);
export const { serviceError, toProduct, fetchProfile, saveProduct, deleteProduct } = marketplace;
export async function fetchProducts(){
  const [products,rows,health]=await Promise.all([marketplace.fetchProducts(),fetchAuctionRows(),supabase.rpc('auctions_health').then(result=>({...result,clock:serverClock(result.data?.server_time)}))]);
  if(health.error||health.data?.version!==5)throw new Error('No se pudo verificar el motor de subastas. Actualiza la conexión; no repitas migraciones.');
  const clock=health.clock;
  return products.map(product=>{const auction=rows.find(row=>row.product_id===product.id);return auction?{...product,auction,price:Number(auction.highest_amount??auction.initial_price),endsAt:Date.parse(auction.ends_at),clock}:product;});
}
