export async function fetchWithTimeout(input, options = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort',cancel,{once:true});
  const timer = setTimeout(() => controller.abort(),20000);
  try { return await fetch(input,{...options,signal:controller.signal}); }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort',cancel); }
}
