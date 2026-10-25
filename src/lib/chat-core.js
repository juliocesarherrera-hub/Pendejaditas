export function chatError(error) {
  if (['PGRST202','PGRST205','42P01'].includes(error?.code)) return 'El chat no está disponible. Revisa la instalación de la migración 004.';
  if (error?.code === '42501') return 'No tienes acceso a esta conversación. Vuelve a iniciar sesión si corresponde.';
  if (['22023','P0001'].includes(error?.code)) return error.message || 'No se pudo enviar. Revisa el texto, los bloqueos y el estado del intercambio.';
  return 'No se pudo conectar con el chat. Conservamos tu texto; revisa internet y vuelve a intentar.';
}
export function createChatService(client) {
  async function result(request) {
    if (!client) throw new Error('Falta configurar Supabase.');
    const {data,error} = await request;
    if (error) throw new Error(chatError(error));
    return data;
  }
  const rpc = (name,args = {}) => {
    if (!client) return Promise.reject(new Error('Falta configurar Supabase.'));
    return result(client.rpc(name,args));
  };
  return {
    inbox: () => rpc('chat_inbox'),
    open: (exchangeId) => rpc('open_chat',{p_exchange_id:exchangeId}),
    send: (conversationId,body,nonce) => rpc('send_chat_message',{p_conversation_id:conversationId,p_body:body,p_client_nonce:nonce}),
    read: (conversationId,sequence) => rpc('mark_chat_read',{p_conversation_id:conversationId,p_upto_sequence:sequence}),
    block: (userId,blocked) => rpc('set_chat_block',{p_user_id:userId,p_blocked:blocked}),
    report: (conversationId,reason,details) => rpc('report_chat_user',{p_conversation_id:conversationId,p_reason:reason,p_details:details}),
    messages: (id,before) => result(client.from('chat_messages').select('id,sender_id,sequence,body,created_at').eq('conversation_id',id).lt('sequence',before || 2147483647).order('sequence',{ascending:false}).limit(50)),
    blocks: () => result(client.from('user_blocks').select('blocked_id')),
  };
}
