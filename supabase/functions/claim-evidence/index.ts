// Prepared Edge Function; not deployed. Supabase injects server secrets.
// No payload, access token, storage path or document content is logged.
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {validateEvidenceBytes,evidenceSha256} from '../_shared/evidence-validation.js';

Deno.serve(async(request:Request)=>{
 const origin=request.headers.get('Origin');
 const allowed=(Deno.env.get('ALLOWED_APP_ORIGINS')||'').split(',').map(value=>value.trim()).filter(Boolean);
 const headers:Record<string,string>={'Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
 if(origin&&!allowed.includes(origin))return new Response('Origin not allowed',{status:403,headers});
 if(origin)headers['Access-Control-Allow-Origin']=origin;
 headers['Access-Control-Allow-Headers']='authorization, apikey, x-client-info, content-type';
 headers['Access-Control-Allow-Methods']='POST, OPTIONS';
 headers['Access-Control-Expose-Headers']='X-Evidence-Type';
 const json=(status:number,code:string)=>new Response(JSON.stringify({ok:false,code}),{status,headers:{...headers,'Content-Type':'application/json'}});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return json(405,'method_not_allowed');
 const authorization=request.headers.get('Authorization');
 if(!authorization?.startsWith('Bearer '))return json(401,'authentication_required');
 try{
  const url=Deno.env.get('SUPABASE_URL'),publicKey=Deno.env.get('SUPABASE_ANON_KEY'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!publicKey||!serviceKey)return json(503,'server_not_configured');
  const userClient=createClient(url,publicKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:authError}=await userClient.auth.getUser(authorization.slice(7));
  if(authError||!identity.user)return json(401,'authentication_required');
  const text=await request.text();if(text.length>2048)return json(413,'request_too_large');
  const body=JSON.parse(text);
  if(!body||!['seal','download'].includes(body.action)||typeof body.evidenceId!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(body.evidenceId))return json(400,'invalid_request');
  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  if(body.action==='seal'){
   const {data:context,error:contextError}=await userClient.rpc('claim_evidence_upload_context',{p_evidence_id:body.evidenceId});
   if(contextError||!context)return json(403,'upload_unavailable');
   const {data:file,error:fileError}=await service.storage.from('claim-evidence').download(context.path);
   if(fileError||!file)return json(409,'upload_unavailable');
   if(file.size<1||file.size>5242880)return json(413,'invalid_size');
   const bytes=new Uint8Array(await file.arrayBuffer());
   const mime=validateEvidenceBytes(bytes,context.mime),hash=await evidenceSha256(bytes);
   const {data:result,error:sealError}=await service.rpc('seal_claim_evidence',{p_evidence_id:body.evidenceId,p_uploader_id:identity.user.id,p_sha256:hash,p_bytes:bytes.length,p_mime:mime});
   if(sealError||!result?.ok)return json(409,'seal_not_confirmed');
   return new Response(JSON.stringify({ok:true,evidenceId:body.evidenceId,authenticity:'not_determined'}),{status:200,headers:{...headers,'Content-Type':'application/json'}});
  }
  if(typeof body.asModerator!=='boolean')return json(400,'invalid_request');
  const {data:permit,error:permitError}=await userClient.rpc('authorize_claim_evidence_download',{p_evidence_id:body.evidenceId,p_as_moderator:body.asModerator});
  if(permitError||!permit?.ok)return json(403,'access_denied');
  const {data:file,error:fileError}=await service.storage.from('claim-evidence').download(permit.path);
  if(fileError||!file||file.size!==permit.bytes||file.size>5242880)return json(409,'integrity_not_confirmed');
  const bytes=new Uint8Array(await file.arrayBuffer());validateEvidenceBytes(bytes,permit.mime);
  if(await evidenceSha256(bytes)!==permit.sha256)return json(409,'integrity_not_confirmed');
  const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
  // The installed Functions SDK decodes image/* as text; octet-stream preserves bytes.
  return new Response(file,{status:200,headers:{...headers,'Content-Type':'application/octet-stream','X-Evidence-Type':permit.mime,'Content-Disposition':`attachment; filename="evidence.${extensions[permit.mime]}"`}});
 }catch{return json(400,'request_not_completed');}
});
