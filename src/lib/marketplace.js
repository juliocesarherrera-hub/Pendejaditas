import { supabase } from './supabase';
import { createMarketplace } from './marketplace-core';
export { productColumns } from './marketplace-core';
export const { serviceError, toProduct, fetchProducts, fetchProfile, saveProduct, deleteProduct } = createMarketplace(supabase);
