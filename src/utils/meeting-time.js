export function mexicoTimeInput(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function previousMeeting(exchange, appointment, now = Date.now()) {
  return ['rejected','cancelled'].includes(exchange.status) || appointment?.status === 'cancelled' || Boolean(appointment && new Date(appointment.starts_at).getTime() <= now);
}
