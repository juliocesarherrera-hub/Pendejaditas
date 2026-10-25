import {loadEnv} from 'vite';import {createClient} from '@supabase/supabase-js';import assert from 'node:assert/strict';import {fetchWithTimeout} from '../src/lib/fetch-timeout.js';
export const env=loadEnv('test',process.cwd(),'');
export const ok=async query=>{const result=await query;assert.ok(!result.error,`Backend rechazó la prueba (${result.error?.code||'sin código'}).`);return result.data;};
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function sessions(){
 if(!['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY',...['A','B','C'].flatMap(k=>[`TEST_USER_${k}_EMAIL`,`TEST_USER_${k}_PASSWORD`])].every(k=>env[k]))throw new Error('Faltan variables locales.');
 const make=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetchWithTimeout}});
 const clients=[make(),make(),make(),make()],users=[];
 for(let index=0;index<3;index++)users.push((await ok(clients[index].auth.signInWithPassword({email:env[`TEST_USER_${'ABC'[index]}_EMAIL`],password:env[`TEST_USER_${'ABC'[index]}_PASSWORD`]}))).user.id);
 assert.equal(new Set(users).size,3);return {clients,users};
}
export async function close(clients=[]){await Promise.allSettled(clients.slice(0,3).map(client=>client.auth.signOut({scope:'local'})));for(const client of clients){client.realtime.disconnect();await client.auth.stopAutoRefresh();}}
