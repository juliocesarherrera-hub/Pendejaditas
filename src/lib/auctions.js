import {supabase} from './supabase';
import {createAuctionService} from './auctions-core';
export const auctions=createAuctionService(supabase);
export async function auctionQuery(query){const {data,error}=await query;if(error)throw new Error('No se pudo actualizar la subasta. Revisa internet y vuelve a intentar.');return data;}
export const fetchAuctionRows=()=>auctionQuery(supabase.from('auctions').select('id,product_id,initial_price,highest_amount,bid_count,ends_at,starts_at,status'));
