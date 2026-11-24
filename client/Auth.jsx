import React, { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Eye, EyeOff, LoaderCircle, LockKeyhole, Sprout } from 'lucide-react';
import { api } from './api';

export default function Auth({ children }) {
  const [user, setUser] = useState(null), [checking, setChecking] = useState(true), [sessionError, setSessionError] = useState('');
  const requestVersion = useRef(0);
  async function readMe() {
    const version = ++requestVersion.current;
    try { const data = await api('/auth/me'); if (version === requestVersion.current) { setUser(data.user); setSessionError(''); } }
    catch (error) { if (version === requestVersion.current) { if (error.status === 401) setUser(null); else setSessionError(error.message); } }
    finally { if (version === requestVersion.current) setChecking(false); }
  }
  useEffect(() => {
    readMe();
    const expired = () => { requestVersion.current++; setUser(null); setSessionError('Your session has expired. Please log in again.'); };
    window.addEventListener('taskflow:session-expired', expired);
    window.addEventListener('focus', readMe);
    return () => { window.removeEventListener('taskflow:session-expired', expired); window.removeEventListener('focus', readMe); };
  }, []);
  async function logout() { await api('/auth/logout', { method: 'POST' }); requestVersion.current++; setUser(null); setSessionError(''); }
  if (checking) return <div className="auth-loading" role="status"><span className="brand-icon"><CheckCheck size={25}/></span><LoaderCircle className="spin" size={22}/><p>Opening your workspace…</p></div>;
  if (user) return children(user, logout);
  return <AuthForm onLogin={value => { requestVersion.current++; setUser(value); setSessionError(''); }} sessionError={sessionError} onRetry={readMe}/>;
}

function AuthForm({ onLogin, sessionError, onRetry }) {
  const [signup, setSignup] = useState(false), [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [showPassword, setShowPassword] = useState(false);
  const change = event => setValues(current => ({ ...current, [event.target.name]: event.target.value }));
  function switchMode() { setSignup(value => !value); setError(''); setValues(value => ({ ...value, password: '', confirm: '' })); setShowPassword(false); }
  async function submit(event) {
    event.preventDefault(); setError('');
    if (signup && values.password !== values.confirm) return setError('Your passwords do not match.');
    setBusy(true);
    try { const data = await api(`/auth/${signup ? 'signup' : 'login'}`, { method: 'POST', body: JSON.stringify({ name: values.name.trim(), email: values.email.trim(), password: values.password }) }); onLogin(data.user); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="auth-page"><aside className="auth-story"><a className="brand" href="/"><span className="brand-icon"><CheckCheck size={23}/></span>taskflow<span className="brand-dot">.</span></a><div className="auth-story-content"><span className="auth-story-icon"><Sprout size={37}/></span><div className="eyebrow">A LITTLE FOCUS. YOUR OWN SPACE.</div><h1>Good days start<br/>with a clearer mind<span>.</span></h1><p>A simple home for your plans, your progress, and everything you want to get done.</p><div className="auth-benefits">{['Your tasks, organized in one place','A private workspace for every account','Pick up right where you left off'].map(text => <div key={text}><Check size={17}/>{text}</div>)}</div></div><div className="auth-story-footer"><LockKeyhole size={15}/>Your space to make things happen.</div></aside><main className="auth-main"><div className="auth-card"><div className="eyebrow">YOUR PERSONAL WORKSPACE</div><h2>{signup ? 'Make a little room for you.' : 'Welcome back.'}</h2><p className="auth-intro">{signup ? 'Create an account and start your own task list.' : 'Log in and take the next small step.'}</p>{sessionError && <div className="error" role="alert">{sessionError} <button type="button" onClick={onRetry}>Retry connection</button></div>}{error && <div className="error" role="alert">{error}</div>}<form onSubmit={submit}>
    {signup && <label htmlFor="auth-name">Your name<input id="auth-name" name="name" autoComplete="name" placeholder="What should we call you?" required maxLength={60} value={values.name} onChange={change}/></label>}
    <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required maxLength={254} value={values.email} onChange={change}/></label>
    <label htmlFor="auth-password">Password<div className="password-input"><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'At least 8 characters' : 'Enter your password'} required minLength={signup ? 8 : undefined} maxLength={128} value={values.password} onChange={change}/><button type="button" className="icon-button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
    {signup && <label htmlFor="auth-confirm">Confirm password<input id="auth-confirm" name="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Enter your password again" required minLength={8} maxLength={128} value={values.confirm} onChange={change}/></label>}
    <button className="primary auth-submit" disabled={busy}>{busy && <LoaderCircle size={17} className="spin"/>}{busy ? (signup ? 'Creating your account…' : 'Logging in…') : (signup ? 'Create account' : 'Log in')}</button>
    </form><p className="auth-switch">{signup ? 'Already have an account?' : 'New to Taskflow?'} <button type="button" disabled={busy} onClick={switchMode}>{signup ? 'Log in' : 'Create an account'}</button></p><div className="auth-note"><LockKeyhole size={14}/>Your tasks are visible only to your account.</div></div></main></div>;
}
