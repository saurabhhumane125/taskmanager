import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Check, CheckCheck, Circle, ClipboardList, Clock3, LayoutGrid, ListTodo, LoaderCircle, LogOut, Menu, Pencil, Plus, Search, Sprout, Trash2, X } from 'lucide-react';
import Auth from './Auth';
import { api } from './api';
import './styles.css';
import './auth.css';

const blank = { title: '', description: '', dueDate: '', priority: 'Medium' };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'No due date';
function App({ user, onLogout }) {
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() { setLoggingOut(true); try { await onLogout(); } catch (err) { setError(err.message); setLoggingOut(false); } }
  const [tasks, setTasks] = useState([]), [filter, setFilter] = useState('All tasks'), [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [modal, setModal] = useState(null), [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false), [pending, setPending] = useState(new Set()), [sort, setSort] = useState('newest'), [menu, setMenu] = useState(false), [mode, setMode] = useState('');
  const opener = useRef(null), dialog = useRef(null);
  async function load() { setLoading(true); setError(''); try { const [rows, health] = await Promise.all([api('/tasks'), api('/health')]); setTasks(rows); setMode(health.storage); } catch (err) { setError(err.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement; opener.current = previous;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('input, button')?.focus();
    function keydown(event) {
      if (event.key === 'Escape' && !busy) setModal(null);
      if (event.key === 'Tab') {
        const items = [...dialog.current.querySelectorAll('button:not(:disabled), input, textarea, select')];
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [modal, busy]);
  const completed = tasks.filter(t => t.completed).length;
  const active = tasks.length - completed;
  const due = tasks.filter(t => !t.completed && t.dueDate === today()).length;
  const visible = tasks.filter(t => (filter === 'All tasks' || (filter === 'Active' && !t.completed) || (filter === 'Completed' && t.completed) || (filter === 'Due today' && !t.completed && t.dueDate === today())) && `${t.title} ${t.description}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'due' ? (a.dueDate || '9999').localeCompare(b.dueDate || '9999') : sort === 'priority' ? ['High','Medium','Low'].indexOf(a.priority) - ['High','Medium','Low'].indexOf(b.priority) : new Date(b.createdAt) - new Date(a.createdAt));
  function open(task = null) { setError(''); setForm(task ? { title: task.title, description: task.description, dueDate: task.dueDate, priority: task.priority } : { ...blank }); setModal({ type: 'form', task }); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const task = await api(modal.task ? `/tasks/${modal.task.id}` : '/tasks', { method: modal.task ? 'PATCH' : 'POST', body: JSON.stringify(form) }); setTasks(rows => modal.task ? rows.map(t => t.id === task.id ? task : t) : [task, ...rows]); setModal(null); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function toggle(task) {
    setPending(p => new Set(p).add(task.id)); setError('');
    try { const updated = await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !task.completed }) }); setTasks(rows => rows.map(t => t.id === task.id ? updated : t)); }
    catch (err) { setError(err.message); } finally { setPending(p => { const next = new Set(p); next.delete(task.id); return next; }); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await api(`/tasks/${modal.task.id}`, { method: 'DELETE' }); setTasks(rows => rows.filter(t => t.id !== modal.task.id)); setModal(null); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="app">
    <aside className={`sidebar ${menu ? 'mobile-open' : ''}`}>
      <a className="brand" href="/" aria-label="Taskflow home"><span className="brand-icon"><CheckCheck size={23}/></span>taskflow<span className="brand-dot">.</span></a>
      <div className="workspace"><span className="workspace-avatar">P</span><div>Personal workspace<small>A little more organized.</small></div><span className="workspace-dot"/></div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Task views">{[['All tasks',LayoutGrid,tasks.length],['Active',Circle,active],['Completed',CheckCheck,completed],['Due today',CalendarDays,due]].map(([name,Icon,count]) => <button key={name} className={`nav-item ${filter === name ? 'selected' : ''}`} onClick={() => { setFilter(name); setMenu(false); }}><Icon size={19}/><span>{name}</span><span className="nav-count">{count}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="growth"><Sprout size={27}/><h3>Small steps. Big progress.</h3><p>Make a little room for what matters. One task at a time.</p><div className="growth-line"><span style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }}/></div><small>{completed} of {tasks.length} tasks completed</small></div><div className="profile"><span className="profile-avatar">{user.name.slice(0,2).toUpperCase()}</span><div className="profile-details">{user.name}<small title={user.email}>{user.email}</small></div><button className="icon-button logout-button" onClick={logout} disabled={loggingOut} aria-label="Log out" title="Log out">{loggingOut ? <LoaderCircle size={18} className="spin"/> : <LogOut size={18}/>}</button></div></div>
    </aside>
    {menu && <button className="sidebar-shade" aria-label="Close menu" onClick={() => setMenu(false)}/>}
    <div className="main-wrap"><header className="topbar"><div className="breadcrumb"><button className="icon-button menu-button" aria-label="Open menu" onClick={() => setMenu(!menu)}><Menu size={21}/></button><span>Workspace</span><span className="slash">/</span><strong>{filter}</strong></div><span className="top-date"><CalendarDays size={16}/>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span></header>
    <main><div className="page-heading"><div><div className="eyebrow">A LITTLE FOCUS GOES A LONG WAY</div><h1>Your day, a little clearer<span>.</span></h1><p>Less on your mind. More getting done.</p></div><button className="primary" onClick={() => open()}><Plus size={19}/> New task</button></div>
      <section className="stats" aria-label="Task overview">{[['Total tasks',tasks.length,ClipboardList,'Everything in one place','mint'],['Active tasks',active,Clock3,'A little progress, every day','amber'],['Completed',completed,CheckCheck,'Look at you getting things done','green']].map(([label,value,Icon,note,color]) => <div className="stat" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${color}`}><Icon size={20}/></span></div><strong>{loading ? '—' : value.toString().padStart(2,'0')}</strong><p>{note}</p></div>)}</section>
      <section className="tasks-section"><div className="section-heading"><div><h2>{filter === 'All tasks' ? 'Your tasks' : filter}<span>{visible.length}</span></h2><p>A place for everything you want to get done.</p></div><label className="sort-label">Sort by<select aria-label="Sort tasks" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="due">Due date</option><option value="priority">Priority</option></select></label></div>
        <div className="toolbar"><div className="tabs" aria-label="Filter tasks">{['All tasks','Active','Completed'].map(name => <button className={filter === name ? 'current' : ''} key={name} onClick={() => setFilter(name)}>{name}<span>{name === 'All tasks' ? tasks.length : name === 'Active' ? active : completed}</span></button>)}</div><label className="search"><Search size={17}/><input placeholder="Search tasks…" aria-label="Search tasks" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button className="icon-button" onClick={() => setSearch('')} aria-label="Clear search"><X size={15}/></button>}</label></div>
        {error && !modal && <div role="alert" className="error">{error} <button onClick={load}>Retry</button></div>}
        {loading ? <div className="empty" role="status"><LoaderCircle className="spin"/><h3>Getting your workspace ready…</h3></div> : visible.length ? <div className="task-list">{visible.map(task => <article key={task.id} className={`task-card ${task.completed ? 'done' : ''}`}><button className={`checkbox ${task.completed ? 'checked' : ''}`} aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.title}`} disabled={pending.has(task.id)} onClick={() => toggle(task)}>{pending.has(task.id) ? <LoaderCircle size={14} className="spin"/> : task.completed && <Check size={15}/>}</button><div className="task-content"><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<div className="task-meta"><span className={`priority ${task.priority.toLowerCase()}`}><span/>{task.priority} priority</span><span className={`due-date ${!task.completed && task.dueDate && task.dueDate < today() ? 'overdue' : ''}`}><CalendarDays size={14}/>{task.dueDate === today() ? 'Today' : dateLabel(task.dueDate)}{!task.completed && task.dueDate && task.dueDate < today() ? ' · Overdue' : ''}</span></div></div><div className="task-actions"><span className={`status ${task.completed ? 'complete' : ''}`}>{task.completed ? 'Completed' : 'Active'}</span><button className="icon-button" aria-label={`Edit ${task.title}`} onClick={() => open(task)}><Pencil size={16}/></button><button className="icon-button delete" aria-label={`Delete ${task.title}`} onClick={() => { setError(''); setModal({ type: 'delete', task }); }}><Trash2 size={16}/></button></div></article>)}</div> : <div className="empty"><span className="empty-icon"><ListTodo size={30}/></span><h3>{search ? 'No matching tasks' : filter === 'Completed' ? 'Good things take a first step' : filter === 'Due today' ? 'A little breathing room today' : filter === 'Active' && tasks.length ? 'All caught up!' : 'A clear space. A fresh start.'}</h3><p>{search ? 'Try another word or clear your search.' : filter === 'Completed' ? 'Finish a task and it will appear here.' : filter === 'Due today' ? 'Tasks with today’s due date will appear here.' : 'Add a task and give your next idea a place to begin.'}</p>{!search && <button className="primary" onClick={() => open()}><Plus size={17}/> Add a task</button>}</div>}
        <button className="add-row" onClick={() => open()}><Plus size={17}/> Add a new task</button>
      </section><footer><span><span className="footer-dot"/>{mode === 'mongodb' ? 'Connected to MongoDB' : mode === 'demo' ? 'Demo mode · Saved on this computer' : 'Connecting to your workspace'}</span><span>Make space for a productive day.<Sprout size={15}/></span></footer>
    </main></div>
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setModal(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={dialog}><div className="modal-heading"><div><div className="eyebrow">YOUR PERSONAL WORKSPACE</div><h2 id="modal-title">{modal.type === 'delete' ? 'Delete this task?' : modal.task ? 'A little fine-tuning.' : 'Make room for what’s next.'}</h2></div><button className="icon-button" disabled={busy} aria-label="Close dialog" onClick={() => setModal(null)}><X size={21}/></button></div>{error && <p className="error" role="alert">{error}</p>}{modal.type === 'delete' ? <><p className="delete-copy">“{modal.task.title}” will be permanently removed.</p><div className="modal-buttons"><button className="secondary" disabled={busy} onClick={() => setModal(null)}>Keep task</button><button className="danger" disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete task'}</button></div></> : <form onSubmit={save}><label>Task title <span>*</span><input autoFocus required maxLength={120} placeholder="What would you like to get done?" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/></label><label>Description <small>(optional)</small><textarea maxLength={1000} rows={3} placeholder="A few details to keep you on track…" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label><div className="form-grid"><label>Due date<input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}/></label><label>Priority<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{['Low','Medium','High'].map(p => <option key={p}>{p}</option>)}</select></label></div><div className="modal-buttons"><button type="button" className="secondary" disabled={busy} onClick={() => setModal(null)}>Cancel</button><button className="primary" disabled={busy || !form.title.trim()}>{busy ? <LoaderCircle size={17} className="spin"/> : <Plus size={17}/ >}{busy ? 'Saving…' : modal.task ? 'Save changes' : 'Create task'}</button></div></form>}</section></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<Auth>{(user, logout) => <App key={user.id} user={user} onLogout={logout}/>}</Auth>);
