import { useState } from 'react';
import { LogIn, Mail } from 'lucide-react';
import { authRedirect, supabase } from '../lib/supabase';
export function AuthPage({ mode = 'login', navigate, user }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const title = mode === 'register' ? 'Únete a pendejaditas.' : mode === 'recover' ? 'Recupera tu acceso.' : mode === 'reset' ? 'Elige una nueva contraseña.' : 'Qué bueno verte de nuevo.';
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      if (!supabase) throw new Error('Falta configurar Supabase.');
      let result;
      if (mode === 'register') {
        if (name.trim().length < 2) throw new Error('Escribe tu nombre público.');
        result = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: authRedirect() } });
      } else if (mode === 'recover') result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect(true) });
      else if (mode === 'reset') {
        if (!user) throw new Error('Abre el enlace de recuperación en el navegador donde lo solicitaste.');
        result = await supabase.auth.updateUser({ password });
      } else result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        const code = result.error.code;
        throw new Error(code === 'invalid_credentials' ? 'Correo o contraseña incorrectos.' : code === 'email_not_confirmed' ? 'Confirma tu correo antes de iniciar sesión.' : code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' ? 'Se alcanzó el límite de solicitudes. Espera unos minutos.' : 'Supabase no pudo completar la solicitud. Comprueba tus datos y la configuración de correo del proyecto.');
      }
      if (mode === 'recover') setMessage('Si el correo tiene una cuenta, recibirás un enlace para recuperar el acceso. Revisa también spam y abre el enlace en este navegador.');
      else if (mode === 'register' && !result.data.session) setMessage('Revisa tu correo para confirmar el registro. Si ya tenías cuenta, inicia sesión o recupera tu contraseña.');
      else {
        if (mode === 'reset') { const url = new URL(window.location.href); url.searchParams.delete('flow'); url.searchParams.delete('code'); window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`); }
        navigate('profile');
      }
      setPassword('');
    } catch (failure) { setError(failure.message || 'No se pudo conectar con Supabase.'); }
    finally { setBusy(false); }
  }
  return <section className="auth-panel"><LogIn size={30} /><h1>{title}</h1><p>Tu cuenta permite publicar, conversar, pujar y coordinar citas y entregas QR. El QR registra la entrega, no un pago. Las compras en línea, los pagos digitales y las ofertas negociables siguen deshabilitados.</p><form onSubmit={submit}>
    {mode === 'register' && <label>Nombre público<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" minLength={2} maxLength={60} required /><small>Será visible en tu perfil y tus publicaciones. No uses información privada.</small></label>}
    {mode !== 'reset' && <label>Correo electrónico<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required /></label>}
    {mode !== 'recover' && <label>Contraseña<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required />{mode !== 'login' && <small>Utiliza al menos 12 caracteres.</small>}</label>}
    {error && <p className="field-error" role="alert">{error}</p>}{message && <p className="success-message" role="status"><Mail size={18} />{message}</p>}
    <button className="primary-button" disabled={busy || (mode === 'reset' && !user)}>{busy ? 'Conectando…' : mode === 'register' ? 'Crear cuenta' : mode === 'recover' ? 'Enviar enlace de recuperación' : mode === 'reset' ? 'Guardar nueva contraseña' : 'Iniciar sesión'}</button>
  </form><div className="auth-links"><button className="text-button" onClick={() => navigate(mode === 'register' ? 'auth/login' : 'auth/register')}>{mode === 'register' ? 'Ya tengo una cuenta' : 'Crear una cuenta'}</button><button className="text-button" onClick={() => navigate('auth/recover')}>Olvidé mi contraseña</button></div></section>;
}
