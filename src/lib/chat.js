import {supabase} from './supabase';
import {createChatService} from './chat-core';
const service = createChatService(supabase);
export const chat = {...service, open: async (exchangeId) => {
  const id = await service.open(exchangeId);
  window.dispatchEvent(new Event('pendejaditas:chat-changed'));
  return id;
}};
