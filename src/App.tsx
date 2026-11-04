import{useEffect,useRef,useState}from'react';import{Radio,Plus,LogOut,Send,Hash,Users}from'lucide-react';
type U={id:string;username:string};type G={id:string;name:string;description:string};type M={id:string;username:string;body:string;created_at:string};
async function api(
  p: string,
  o: RequestInit = {}
): Promise<any> {
  const r = await fetch(p, {
    ...o,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(o.headers || {})
    }
  });

  const d: any = await r.json();

  if (!r.ok) {
    throw new Error(d.error || "Request failed");
  }

  return d;
}
export default function App(){const[me,S]=useState<U|null>(null),[mode,SM]=useState('login'),[name,SN]=useState(''),[pass,SP]=useState(''),[err,SE]=useState(''),[groups,SG]=useState<G[]>([]),[active,SA]=useState<G|null>(null),[msgs,SMG]=useState<M[]>([]),[draft,SD]=useState(''),[newName,SNN]=useState(''),[creating,SC]=useState(false),[busy,SB]=useState(false);const ws=useRef<WebSocket|null>(null);
async function refreshGroups(){let d=await api('/api/groups');SG(d.groups);if(!active&&d.groups[0])SA(d.groups[0])}
useEffect(()=>{api('/api/me').then(async d=>{S(d.user);if(d.user)await refreshGroups()}).catch(e=>SE(e.message))},[]);
useEffect(()=>{if(!me||!active)return;api(`/api/groups/${active.id}/messages`).then(d=>SMG(d.messages));ws.current?.close();let w=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/live?group=${active.id}`);ws.current=w;w.onmessage=e=>{let p=JSON.parse(e.data);if(p.type==='message')SMG(old=>old.some(x=>x.id===p.message.id)?old:[...old,p.message])};return()=>w.close()},[me,active?.id]);
async function auth(e:React.FormEvent){e.preventDefault();SB(true);SE('');try{let d=await api('/api/'+(mode==='register'?'register':'login'),{method:'POST',body:JSON.stringify({username:name,password:pass})});S(d.user);SP('');await refreshGroups()}catch(e:any){SE(e.message)}finally{SB(false)}}
async function create(e:React.FormEvent){e.preventDefault();try{let d=await api('/api/groups',{method:'POST',body:JSON.stringify({name:newName})});SG([d.group,...groups]);SA(d.group);SNN('');SC(false)}catch(e:any){SE(e.message)}}
async function send(e:React.FormEvent){e.preventDefault();if(!active||!draft.trim())return;let body=draft.trim();SD('');try{await api(`/api/groups/${active.id}/messages`,{method:'POST',body:JSON.stringify({body})})}catch(e:any){SE(e.message);SD(body)}}
async function logout(){await api('/api/logout',{method:'POST'});ws.current?.close();S(null);SG([]);SA(null);SMG([])}
if(!me)return <main className="auth"><section className="card"><div className="logo"><Radio/></div><small>A NEW SIGNAL. A NEW SPACE.</small><h1>AXIOM<span>.</span></h1><p>Your people. Your channels. Your universe.</p><nav><button className={mode==='login'?'sel':''} onClick={()=>SM('login')}>Sign in</button><button className={mode==='register'?'sel':''} onClick={()=>SM('register')}>Create account</button></nav><form onSubmit={auth}><label>USERNAME</label><input value={name} onChange={e=>SN(e.target.value)} minLength={3} maxLength={24} required placeholder="Choose a username"/><label>PASSWORD</label><input type="password" value={pass} onChange={e=>SP(e.target.value)} minLength={8} required placeholder="At least 8 characters"/>{err&&<p className="error">{err}</p>}<button className="primary" disabled={busy}>{busy?'Please wait…':mode==='register'?'Create your account ↗':'Sign in ↗'}</button></form><footer>Accounts are stored securely on Cloudflare.</footer></section></main>;
return <main className="layout"><aside><h2><Radio/> AXIOM<span>.</span></h2><div className="sect">YOUR CHANNELS <button onClick={()=>SC(!creating)}><Plus size={16}/></button></div>{creating&&<form onSubmit={create}><input value={newName} onChange={e=>SNN(e.target.value)} placeholder="Channel name" required/><button className="primary">Create</button></form>}{groups.map(g=><button className={'channel '+(active?.id===g.id?'chosen':'')} key={g.id} onClick={()=>SA(g)}><Hash size={16}/>{g.name}</button>)}<div className="me"><b>{me.username}</b><button onClick={logout}><LogOut/></button></div></aside><section className="chat"><header><b><Hash/>{active?.name||'Welcome to AXIOM'}</b><small>Live channel chat · Cloudflare</small></header>{!active?<div className="empty"><Users/><h2>Create a channel to start chatting.</h2></div>:<><div className="messages">{msgs.map(m=><article key={m.id}><b>{m.username}</b><time>{new Date(m.created_at).toLocaleString()}</time><p>{m.body}</p></article>)}</div><form className="composer" onSubmit={send}><input value={draft} onChange={e=>SD(e.target.value)} placeholder={`Message #${active.name}`}/><button className="primary"><Send/></button></form></>}{err&&<button className="error toast" onClick={()=>SE('')}>{err} · dismiss</button>}</section></main>}
