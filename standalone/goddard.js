// ── State ──
let ws, rid=0, pend={}, isConn=false, sessions=[], crons=[], channels=null, gwInfo=null;
let clockIv, countIv;

// Topic name mapping
const TOPIC_NAMES = {
  '1': 'General',
  '5': 'Projects',
  '8': 'Town Skware',
  '28': 'Trading',
  '72': 'Trading Reports',
  '563': 'Dashboard'
};

// ── Persistence ──
const ls = (k,d) => { try { return localStorage.getItem('g_'+k)||d } catch { return d } };
const ss = (k,v) => { try { localStorage.setItem('g_'+k,v) } catch {} };

// ── Init ──
window.addEventListener('DOMContentLoaded', () => {
  // Auto-detect WebSocket URL from page origin
  const defaultWs = location.protocol === 'https:' 
    ? 'wss://' + location.host 
    : 'ws://' + location.host;
  document.getElementById('in-url').value = ls('url', defaultWs);
  document.getElementById('in-token').value = ls('token','');
  if (ls('token','')) doConnect();
  startClock();
  bindEvents();
});

// ── Event Delegation ──
function bindEvents() {
  // Connect button
  document.getElementById('btn-connect').addEventListener('click', doConnect);
  // Mobile sidebar toggle
  document.getElementById('btn-toggle-sidebar').addEventListener('click', toggleSidebar);
  // Panel overlay & close
  document.getElementById('panel-ov').addEventListener('click', closePanel);
  document.getElementById('btn-panel-close').addEventListener('click', closePanel);

  // Delegated click handler for data-action elements
  document.body.addEventListener('click', function(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'go') go(el.dataset.target);
    else if (action === 'trigger-job') triggerJob(el.dataset.job);
    else if (action === 'refresh') { refreshAll(); toast('Refreshed'); }
    else if (action === 'disconnect') doDisconnect();
    else if (action === 'refresh-sessions') loadSessions();
    else if (action === 'refresh-cron') loadCron();
    else if (action === 'refresh-channels') loadChannels();
    else if (action === 'show-cron-panel') showCronPanel(el.dataset.jobId);
    else if (action === 'run-job') runJob(el.dataset.jobId);
    else if (action === 'toggle-job') toggleJob(el.dataset.jobId, el.dataset.enable === 'true');
  });
}

// ── WebSocket ──
let connectNonce = null;
let connectSent = false;

function doConnect() {
  const url = document.getElementById('in-url').value.trim();
  const token = document.getElementById('in-token').value.trim();
  if (!url || !token) return connErr('Enter URL and token');
  connErr('');
  ss('url',url); ss('token',token);
  connectNonce = null;
  connectSent = false;
  try { ws = new WebSocket(url); } catch(e) { return connErr('Bad URL: '+e.message); }
  ws.onopen = () => {
    // Wait for connect.challenge event before sending connect
    // Set a timeout in case the gateway doesn't send a challenge (older protocol)
    setTimeout(() => { if (!connectSent) sendConnectRpc(token, null); }, 1500);
  };
  ws.onmessage = ev => {
    try {
      const m = JSON.parse(ev.data);
      // Handle connect.challenge event
      if (m.type === 'event' && m.event === 'connect.challenge') {
        connectNonce = m.payload?.nonce || null;
        if (!connectSent) sendConnectRpc(token, connectNonce);
        return;
      }
      // Handle RPC responses
      if (m.id && pend[m.id]) {
        const p = pend[m.id]; delete pend[m.id];
        (m.ok===false||m.error) ? p.rej(m.error||{message:'fail'}) : p.res(m.payload??m);
      }
    } catch {}
  };
  ws.onclose = () => { isConn=false; connectSent=false; updDot(); };
  ws.onerror = () => connErr('Connection failed — is the gateway running?');
}

function sendConnectRpc(token, nonce) {
  if (connectSent) return;
  connectSent = true;
  rpc('connect', {
    minProtocol:3, maxProtocol:3,
    client:{id:'webchat',version:'2.0',platform:navigator.platform,mode:'webchat'},
    role:'operator', scopes:['operator.read','operator.admin'], device:undefined, caps:[], 
    auth:{token:token},
    userAgent:navigator.userAgent, locale:navigator.language
  }).then(r => {
    isConn=true; gwInfo=r;
    document.getElementById('connect-screen').style.display='none';
    document.getElementById('app').style.display='flex';
    updDot();
    refreshAll();
    startCountdowns();
  }).catch(e => { connErr('Auth failed: '+(e.message||e)); ws.close(); });
}

function rpc(method, params={}) {
  return new Promise((res,rej) => {
    const id = String(++rid);
    pend[id] = {res,rej};
    ws.send(JSON.stringify({type:'req',id,method,params}));
    setTimeout(() => { if (pend[id]) { delete pend[id]; rej({message:'timeout'}); } }, 15000);
  });
}

function connErr(msg) {
  const el = document.getElementById('conn-err');
  el.textContent = msg; el.style.display = msg ? 'block' : 'none';
}

function doDisconnect() { ss('token',''); ws?.close(); location.reload(); }
function updDot() { document.getElementById('conn-dot').className = 'dot '+(isConn?'on':'off'); }

// ── Navigation ──
function go(page) {
  document.querySelectorAll('.page').forEach(p => p.style.display='none');
  document.getElementById('page-'+page).style.display='block';
  document.querySelectorAll('.nav-btn[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page===page));
  if (page==='sessions') loadSessions();
  if (page==='cron') loadCron();
  if (page==='channels') loadChannels();
  document.getElementById('sidebar').classList.remove('open');
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function toast(msg) { const t=document.getElementById('toast-el'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }

// ── Time ──
function ago(ms) {
  if (!ms) return 'never';
  const d = Date.now()-ms;
  if (d<60e3) return 'now';
  if (d<3600e3) return Math.floor(d/60e3)+'m ago';
  if (d<864e5) return Math.floor(d/36e5)+'h ago';
  return Math.floor(d/864e5)+'d ago';
}
function until(ms) {
  if (!ms) return '--';
  const d = ms-Date.now();
  if (d<0) return 'overdue';
  if (d<60e3) return '<1m';
  if (d<3600e3) return Math.floor(d/60e3)+'m';
  if (d<864e5) { const h=Math.floor(d/36e5), m=Math.floor((d%36e5)/60e3); return h+'h '+m+'m'; }
  return Math.floor(d/864e5)+'d';
}
function fmtTime(ms) {
  if (!ms) return '--';
  return new Date(ms).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
}
function fmtDate(ms) {
  if (!ms) return '--';
  return new Date(ms).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
}

function cronHuman(sch) {
  if (!sch) return '??';
  if (sch.kind==='cron') {
    const [min,hour,,,dow] = sch.expr.split(' ');
    const tz = sch.tz ? ' '+sch.tz.split('/')[1] : '';
    const days = {'*':'Daily','0':'Sun','1-5':'Weekdays','0,6':'Weekends'};
    const dayStr = days[dow] || dow.split(',').map(d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][+d]||d).join(', ');
    const h=+hour, m=+min;
    const ap = h>=12?'PM':'AM', h12 = h===0?12:h>12?h-12:h;
    return h12+':'+String(m).padStart(2,'0')+' '+ap+' \u00b7 '+dayStr+tz;
  }
  if (sch.kind==='every') return 'Every '+Math.floor(sch.everyMs/60e3)+'m';
  if (sch.kind==='at') return fmtDate(new Date(sch.at).getTime());
  return '??';
}

function jobEmoji(n) {
  if (!n) return '\u26a1';
  const l=n.toLowerCase();
  if (l.includes('premarket')||l.includes('morning')) return '\ud83c\udf05';
  if (l.includes('close')||l.includes('recap')) return '\ud83d\udd14';
  if (l.includes('sunday')||l.includes('future')) return '\ud83c\udf19';
  if (l.includes('dashboard')||l.includes('nightly')) return '\ud83d\udcca';
  return '\u26a1';
}

// ── Market Status ──
function updateMarket() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US',{timeZone:'America/New_York'}));
  const h = et.getHours(), m = et.getMinutes(), day = et.getDay();
  const mins = h*60+m;
  const isWeekday = day>=1 && day<=5;

  const dot = document.getElementById('mkt-dot');
  const label = document.getElementById('mkt-label');
  const fill = document.getElementById('mkt-fill');
  const info = document.getElementById('mkt-info');

  if (!isWeekday) {
    dot.style.background='var(--text-quaternary)';
    label.textContent='Market Closed';
    fill.style.width='0%'; fill.style.background='var(--text-quaternary)';
    info.textContent='Weekend';
  } else if (mins < 4*60) {
    dot.style.background='var(--text-quaternary)'; label.textContent='Overnight'; fill.style.width='0%'; info.textContent='Pre-market opens 4:00 AM';
  } else if (mins < 9*60+30) {
    dot.style.background='var(--amber)'; label.textContent='Pre-Market';
    const pct = ((mins-240)/(570-240))*100;
    fill.style.width=pct+'%'; fill.style.background='var(--amber)';
    info.textContent='Opens '+Math.floor((570-mins)/60)+'h '+((570-mins)%60)+'m';
  } else if (mins < 16*60) {
    dot.style.background='var(--green)'; label.textContent='Market Open';
    const pct = ((mins-570)/(960-570))*100;
    fill.style.width=pct+'%'; fill.style.background='var(--green)';
    const rem = 960-mins;
    info.textContent='Closes in '+Math.floor(rem/60)+'h '+(rem%60)+'m';
  } else if (mins < 20*60) {
    dot.style.background='var(--blue)'; label.textContent='After Hours';
    const pct = ((mins-960)/(1200-960))*100;
    fill.style.width=pct+'%'; fill.style.background='var(--blue)';
    info.textContent='Extended hours';
  } else {
    dot.style.background='var(--text-quaternary)'; label.textContent='Market Closed';
    fill.style.width='100%'; fill.style.background='var(--text-quaternary)'; info.textContent='Opens tomorrow';
  }
}

function startClock() {
  const tick = () => {
    const now = new Date();
    const et = now.toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
    document.getElementById('clock').textContent = et;
    updateMarket();
  };
  tick();
  clockIv = setInterval(tick, 1000);
}

// ── Data ──
async function refreshAll() {
  try {
    const [sessRes, cronRes, health] = await Promise.all([
      rpc('sessions.list',{limit:50}).catch(()=>({sessions:[]})),
      rpc('cron.list',{includeDisabled:true}).catch(()=>({jobs:[]})),
      rpc('status',{}).catch(()=>null)
    ]);
    sessions = sessRes?.sessions || [];
    crons = cronRes?.jobs || [];

    document.getElementById('s-gw').innerHTML = '<span style="color:var(--green)">Online</span>';
    if (health?.uptime) {
      const h=Math.floor(health.uptime/3600), m=Math.floor((health.uptime%3600)/60);
      document.getElementById('s-gw-sub').textContent = h+'h '+m+'m uptime';
    } else { document.getElementById('s-gw-sub').textContent = 'Connected'; }
    if (health?.version) document.getElementById('sidebar-ver').textContent = 'OpenClaw '+health.version;

    document.getElementById('s-sess').textContent = sessions.length;
    const grp = sessions.filter(s=>s.kind==='group').length;
    document.getElementById('s-sess-sub').textContent = grp+' topics, '+(sessions.length-grp)+' other';

    const en = crons.filter(j=>j.enabled!==false);
    const errs = crons.filter(j=>j.state?.lastRunStatus==='error');
    document.getElementById('s-cron').textContent = en.length;
    document.getElementById('s-cron-sub').innerHTML = errs.length ? '<span style="color:var(--red)">'+errs.length+' error'+(errs.length>1?'s':'')+'</span>' : 'All healthy';

    const nxt = crons.filter(j=>j.enabled!==false&&j.state?.nextRunAtMs).sort((a,b)=>a.state.nextRunAtMs-b.state.nextRunAtMs)[0];
    if (nxt) {
      document.getElementById('s-next').textContent = until(nxt.state.nextRunAtMs);
      document.getElementById('s-next-sub').textContent = nxt.name||'Unnamed';
    }

    document.getElementById('nav-sessions').textContent = sessions.length;
    document.getElementById('nav-cron').textContent = crons.length;

    renderTimeline();
    renderOverviewSessions();
  } catch(e) { toast('Error: '+(e.message||e)); }
}

function renderTimeline() {
  const el = document.getElementById('timeline');
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = todayStart.getTime() + 864e5;

  const items = [];
  for (const job of crons) {
    if (job.enabled === false) continue;

    if (job.state?.lastRunAtMs && job.state.lastRunAtMs >= todayStart.getTime() && job.state.lastRunAtMs < todayEnd) {
      items.push({
        time: job.state.lastRunAtMs,
        name: job.name || 'Unnamed',
        emoji: jobEmoji(job.name),
        status: job.state.lastRunStatus === 'ok' ? 'done' : 'error',
        sub: job.state.lastRunStatus === 'ok' ? 'completed '+ago(job.state.lastRunAtMs) : job.state.lastError || 'error',
        id: job.id
      });
    }

    if (job.state?.nextRunAtMs && job.state.nextRunAtMs >= todayStart.getTime() && job.state.nextRunAtMs < todayEnd) {
      if (!job.state?.lastRunAtMs || Math.abs(job.state.nextRunAtMs - job.state.lastRunAtMs) > 60000) {
        const isNext = crons.filter(j=>j.enabled!==false&&j.state?.nextRunAtMs).sort((a,b)=>a.state.nextRunAtMs-b.state.nextRunAtMs)[0]?.id === job.id;
        items.push({
          time: job.state.nextRunAtMs,
          name: job.name || 'Unnamed',
          emoji: jobEmoji(job.name),
          status: isNext ? 'next' : 'pending',
          sub: until(job.state.nextRunAtMs),
          countdown: job.state.nextRunAtMs,
          id: job.id
        });
      }
    }
  }

  items.sort((a,b) => a.time - b.time);

  if (!items.length) {
    el.innerHTML = '<div class="empty"><div class="emoji">\ud83d\udced</div><div class="title">No events scheduled today</div></div>';
    return;
  }

  el.innerHTML = items.map(it =>
    '<div class="tl-item '+it.status+'" data-action="show-cron-panel" data-job-id="'+it.id+'">' +
      '<span class="tl-time">'+fmtTime(it.time)+'</span>' +
      '<span style="font-size:15px">'+it.emoji+'</span>' +
      '<span class="tl-name">'+it.name+'</span>' +
      '<span class="tl-countdown"'+(it.countdown?' data-cd="'+it.countdown+'"':'')+'>'+it.sub+'</span>' +
      (it.status==='done' ? '<span class="pill ok">Done</span>' : it.status==='error' ? '<span class="pill err">Error</span>' : it.status==='next' ? '<span class="pill accent pulse">Next</span>' : '') +
    '</div>'
  ).join('');
}

function renderOverviewSessions() {
  const el = document.getElementById('overview-sessions');
  const sorted = [...sessions].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,6);
  if (!sorted.length) { el.innerHTML='<div class="empty"><div class="title">No sessions</div></div>'; return; }

  el.innerHTML = sorted.map(s => {
    const n = sessionName(s);
    const e = sessionEmoji(s);
    const pct = s.totalTokens && s.contextTokens ? Math.round(s.totalTokens/s.contextTokens*100) : null;
    const pctColor = pct>80?'var(--red)':pct>60?'var(--amber)':'var(--accent)';
    return '<div class="session-row">' +
      '<div class="session-avi" style="background:'+(s.kind==='group'?'var(--blue-dim)':'var(--purple-dim)')+'">'+e+'</div>' +
      '<div class="session-info">' +
        '<div class="session-name">'+n+'</div>' +
        '<div class="session-detail">'+(s.model||'?')+' \u00b7 '+(s.channel||'?')+'</div>' +
      '</div>' +
      '<div class="session-right">' +
        '<div class="session-time">'+ago(s.updatedAt)+'</div>' +
        (pct!==null ? '<div class="ctx-meter"><div class="ctx-bar"><div class="fill" style="width:'+pct+'%;background:'+pctColor+'"></div></div><span class="ctx-pct">'+pct+'%</span></div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function sessionName(s) {
  const key = s.key || '';
  const topicMatch = key.match(/topic:(\d+)/);
  if (topicMatch) {
    const topicId = topicMatch[1];
    return TOPIC_NAMES[topicId] || 'Topic '+topicId;
  }
  if (key.includes('direct:')) {
    const phone = key.match(/direct:(.+)/)?.[1] || '';
    if (phone.includes('+')) return '\ud83d\udcf1 ' + phone;
    return 'DM ' + phone;
  }
  if (key.endsWith(':main')) return '\ud83c\udfe0 Main Session';
  if (key.includes('subagent:') || key.includes('openai:')) return '\ud83e\udd16 Sub-agent';
  if (key.includes('cron:')) return '\u23f0 Cron Run';
  if (s.displayName) return s.displayName.replace('telegram:','').replace('g-','');
  return key.split(':').pop() || '?';
}

function sessionEmoji(s) {
  const key = s.key || '';
  if (key.includes('topic:')) return '\ud83d\udcac';
  if (key.includes('direct:')) return '\ud83d\udc64';
  if (key.endsWith(':main')) return '\ud83c\udfe0';
  if (key.includes('subagent:')||key.includes('openai:')) return '\ud83e\udd16';
  if (key.includes('cron:')) return '\u23f0';
  return '\u25cf';
}

// ── Sessions Page ──
async function loadSessions() {
  const el = document.getElementById('sessions-list');
  try {
    const res = await rpc('sessions.list',{limit:50});
    sessions = res?.sessions || [];
    if (!sessions.length) { el.innerHTML='<div class="empty"><div class="emoji">\ud83d\udcac</div><div class="title">No sessions</div></div>'; return; }

    const sorted = [...sessions].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    const topics = sorted.filter(s=>s.key?.includes('topic:'));
    const dms = sorted.filter(s=>s.key?.includes('direct:'));
    const other = sorted.filter(s=>!s.key?.includes('topic:')&&!s.key?.includes('direct:'));

    let html = '';
    if (topics.length) {
      html += '<div class="nav-group-label" style="padding:8px 0 4px">Telegram Topics</div>';
      html += topics.map(s=>sessionRowHTML(s)).join('');
    }
    if (dms.length) {
      html += '<div class="nav-group-label" style="padding:16px 0 4px">Direct Messages</div>';
      html += dms.map(s=>sessionRowHTML(s)).join('');
    }
    if (other.length) {
      html += '<div class="nav-group-label" style="padding:16px 0 4px">Internal Sessions</div>';
      html += other.map(s=>sessionRowHTML(s)).join('');
    }
    el.innerHTML = html;
  } catch(e) { el.innerHTML='<div class="empty"><div class="title">Failed: '+(e.message||e)+'</div></div>'; }
}

function sessionRowHTML(s) {
  const n = sessionName(s);
  const e = sessionEmoji(s);
  const pct = s.totalTokens && s.contextTokens ? Math.round(s.totalTokens/s.contextTokens*100) : null;
  const pctColor = pct>80?'var(--red)':pct>60?'var(--amber)':'var(--accent)';
  const chPill = s.channel==='telegram'?'info':s.channel==='bluebubbles'?'ok':'muted';
  return '<div class="session-row">' +
    '<div class="session-avi" style="background:'+(s.kind==='group'?'var(--blue-dim)':'var(--purple-dim)')+'">'+e+'</div>' +
    '<div class="session-info">' +
      '<div class="session-name">'+n+'</div>' +
      '<div class="session-detail">'+(s.model||'?')+' \u00b7 <span class="pill '+chPill+'">'+(s.channel||'?')+'</span></div>' +
    '</div>' +
    '<div class="session-right">' +
      '<div class="session-time">'+ago(s.updatedAt)+'</div>' +
      (pct!==null ? '<div class="ctx-meter"><div class="ctx-bar"><div class="fill" style="width:'+pct+'%;background:'+pctColor+'"></div></div><span class="ctx-pct">'+pct+'%</span></div>' : '') +
    '</div>' +
  '</div>';
}

// ── Cron Page ──
async function loadCron() {
  const el = document.getElementById('cron-list');
  try {
    const res = await rpc('cron.list',{includeDisabled:true});
    crons = res?.jobs || [];
    if (!crons.length) { el.innerHTML='<div class="empty"><div class="emoji">\u23f0</div><div class="title">No cron jobs</div></div>'; return; }

    el.innerHTML = crons.map(j => {
      const pill = j.enabled===false ? '<span class="pill warn">Disabled</span>'
        : j.state?.lastRunStatus==='error' ? '<span class="pill err">Error</span>'
        : j.state?.lastRunStatus==='ok' ? '<span class="pill ok">Healthy</span>'
        : '<span class="pill info">Ready</span>';
      const delivery = j.delivery?.mode || (j.sessionTarget==='main'?'main session':'announce');
      const next = j.state?.nextRunAtMs;

      return '<div class="card clickable" data-action="show-cron-panel" data-job-id="'+j.id+'">' +
        '<div class="card-top">' +
          '<span class="card-emoji">'+jobEmoji(j.name)+'</span>' +
          '<div class="card-info">' +
            '<div class="card-name">'+(j.name||'Unnamed')+'</div>' +
            '<div class="card-desc">'+cronHuman(j.schedule)+'</div>' +
          '</div>' +
          pill +
        '</div>' +
        '<div class="card-meta">' +
          '<div class="card-meta-item">\u23f1 Next: <strong'+(next?' data-cd="'+next+'"':'')+'>'+(next?until(next):'--')+'</strong></div>' +
          '<div class="card-meta-item">\ud83d\udce4 '+delivery+'</div>' +
          '<div class="card-meta-item">\ud83d\udd04 '+(j.state?.lastRunAtMs?ago(j.state.lastRunAtMs):'never')+'</div>' +
          (j.state?.consecutiveErrors?'<div class="card-meta-item" style="color:var(--red)">\u26a0 '+j.state.consecutiveErrors+' errors</div>':'') +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) { el.innerHTML='<div class="empty"><div class="title">Failed: '+(e.message||e)+'</div></div>'; }
}

async function showCronPanel(jobId) {
  const job = crons.find(j=>j.id===jobId);
  if (!job) return;
  const body = document.getElementById('panel-body');

  body.innerHTML =
    '<h3>'+jobEmoji(job.name)+' '+(job.name||'Unnamed')+'</h3>' +
    '<div class="panel-desc">'+(job.description||'No description')+'</div>' +
    '<div class="panel-section">' +
      '<div class="panel-section-title">Schedule</div>' +
      '<div class="panel-row"><span class="k">Schedule</span><span class="v">'+cronHuman(job.schedule)+'</span></div>' +
      '<div class="panel-row"><span class="k">Expression</span><span class="v" style="font-family:var(--mono);font-size:11px">'+(job.schedule?.expr||'--')+'</span></div>' +
      '<div class="panel-row"><span class="k">Timezone</span><span class="v">'+(job.schedule?.tz||'UTC')+'</span></div>' +
    '</div>' +
    '<div class="panel-section">' +
      '<div class="panel-section-title">Status</div>' +
      '<div class="panel-row"><span class="k">Enabled</span><span class="v">'+(job.enabled!==false?'\u2705':'\u274c')+'</span></div>' +
      '<div class="panel-row"><span class="k">Next Run</span><span class="v">'+(job.state?.nextRunAtMs?fmtDate(job.state.nextRunAtMs)+' ('+until(job.state.nextRunAtMs)+')':'--')+'</span></div>' +
      '<div class="panel-row"><span class="k">Last Run</span><span class="v">'+(job.state?.lastRunAtMs?fmtDate(job.state.lastRunAtMs):'Never')+'</span></div>' +
      '<div class="panel-row"><span class="k">Last Status</span><span class="v">'+(job.state?.lastRunStatus==='ok'?'\u2705 OK':job.state?.lastRunStatus==='error'?'\u274c Error':'--')+'</span></div>' +
      (job.state?.lastError?'<div class="panel-row"><span class="k">Error</span><span class="v" style="color:var(--red)">'+job.state.lastError+'</span></div>':'') +
      (job.state?.lastDurationMs?'<div class="panel-row"><span class="k">Duration</span><span class="v">'+(job.state.lastDurationMs/1000).toFixed(1)+'s</span></div>':'') +
    '</div>' +
    '<div class="panel-section">' +
      '<div class="panel-section-title">Config</div>' +
      '<div class="panel-row"><span class="k">Session</span><span class="v">'+(job.sessionTarget||'--')+'</span></div>' +
      '<div class="panel-row"><span class="k">Delivery</span><span class="v">'+(job.delivery?.mode||'default')+'</span></div>' +
      '<div class="panel-row"><span class="k">Payload</span><span class="v">'+(job.payload?.kind||'--')+'</span></div>' +
      (job.payload?.model?'<div class="panel-row"><span class="k">Model</span><span class="v">'+job.payload.model+'</span></div>':'') +
    '</div>' +
    '<div class="panel-section">' +
      '<div class="panel-section-title">Task</div>' +
      '<div class="panel-task">'+(job.payload?.text||job.payload?.message||'--').replace(/</g,'&lt;')+'</div>' +
    '</div>' +
    '<div class="panel-actions">' +
      '<button class="btn primary" data-action="run-job" data-job-id="'+job.id+'">\u25b6 Run Now</button>' +
      '<button class="btn" data-action="toggle-job" data-job-id="'+job.id+'" data-enable="'+(job.enabled===false)+'">'+(job.enabled===false?'Enable':'Disable')+'</button>' +
    '</div>' +
    '<div class="panel-section" style="margin-top:20px">' +
      '<div class="panel-section-title">Recent Runs</div>' +
      '<div id="panel-runs"><div class="loading" style="padding:8px"><div class="spin"></div></div></div>' +
    '</div>';
  openPanel();

  try {
    const r = await rpc('cron.runs',{jobId:job.id});
    const runs = r?.runs || [];
    const runsEl = document.getElementById('panel-runs');
    if (!runs.length) { runsEl.innerHTML='<div style="font-size:11px;color:var(--text-quaternary);padding:4px 0">No history</div>'; return; }
    runsEl.innerHTML = runs.slice(0,10).map(r =>
      '<div class="panel-run-item">' +
        '<span>'+(r.status==='ok'?'\u2705':r.status==='error'?'\u274c':'\u23f3')+'</span>' +
        '<span style="flex:1">'+fmtDate(r.startedAtMs||r.scheduledAtMs)+'</span>' +
        '<span style="color:var(--text-quaternary)">'+(r.durationMs?(r.durationMs/1000).toFixed(1)+'s':'--')+'</span>' +
      '</div>'
    ).join('');
  } catch { document.getElementById('panel-runs').innerHTML='<div style="font-size:11px;color:var(--text-quaternary)">Could not load</div>'; }
}

async function runJob(id) { try { await rpc('cron.run',{jobId:id}); toast('Job triggered!'); } catch(e) { toast('Failed: '+(e.message||e)); } }
async function toggleJob(id,enable) { try { await rpc('cron.update',{jobId:id,patch:{enabled:enable}}); toast(enable?'Enabled':'Disabled'); loadCron(); } catch(e) { toast('Failed: '+(e.message||e)); } }
function triggerJob(name) {
  const job = crons.find(j=>(j.name||'').toLowerCase().replace(/[^a-z]/g,'-')===name || j.name===name);
  if (job) runJob(job.id); else toast('Job not found: '+name);
}

// ── Channels ──
async function loadChannels() {
  const el = document.getElementById('channels-list');
  try {
    const res = await rpc('channels.status',{probe:false,timeoutMs:5000});
    const icons = {telegram:'\u2708\ufe0f',whatsapp:'\ud83d\udcf1',discord:'\ud83c\udfae',slack:'\ud83d\udcbc',signal:'\ud83d\udd10',bluebubbles:'\ud83e\udee7',imessage:'\ud83c\udf4e'};
    const arr = Array.isArray(res)?res:Object.entries(res||{}).map(([n,d])=>({name:n,...(typeof d==='object'?d:{})}));

    if (!arr.length) { el.innerHTML='<div class="empty"><div class="emoji">\ud83d\udce1</div><div class="title">No channels</div></div>'; return; }

    el.innerHTML = arr.map(ch => {
      const name = ch.name||ch.provider||'?';
      const ok = ch.connected||ch.status==='ok'||ch.ok;
      return '<div class="channels-row">' +
        '<span class="ch-icon">'+(icons[name.toLowerCase()]||'\ud83d\udce1')+'</span>' +
        '<div class="ch-info">' +
          '<div class="ch-name">'+name+'</div>' +
          '<div class="ch-status">'+(ok?'\ud83d\udfe2 Connected':'\ud83d\udd34 Disconnected')+(ch.accountId?' \u00b7 '+ch.accountId:'')+'</div>' +
        '</div>' +
        '<span class="pill '+(ok?'ok':'err')+'">'+(ok?'Online':'Offline')+'</span>' +
      '</div>';
    }).join('');
  } catch(e) { el.innerHTML='<div class="empty"><div class="title">Failed: '+(e.message||e)+'</div></div>'; }
}

// ── Panel ──
function openPanel() { document.getElementById('panel').classList.add('open'); document.getElementById('panel-ov').classList.add('open'); }
function closePanel() { document.getElementById('panel').classList.remove('open'); document.getElementById('panel-ov').classList.remove('open'); }

// ── Countdowns ──
function startCountdowns() {
  if (countIv) clearInterval(countIv);
  countIv = setInterval(() => {
    document.querySelectorAll('[data-cd]').forEach(el => {
      const ms = parseInt(el.dataset.cd);
      if (ms) el.textContent = until(ms);
    });
    const nxt = crons.filter(j=>j.enabled!==false&&j.state?.nextRunAtMs).sort((a,b)=>a.state.nextRunAtMs-b.state.nextRunAtMs)[0];
    if (nxt) document.getElementById('s-next').textContent = until(nxt.state.nextRunAtMs);
  }, 15000);
}

// Auto-refresh
setInterval(() => { if (isConn) refreshAll(); }, 120000);

// Keyboard
document.addEventListener('keydown', e => {
  if (e.key==='Escape') closePanel();
  if (e.metaKey && e.key==='1') { e.preventDefault(); go('overview'); }
  if (e.metaKey && e.key==='2') { e.preventDefault(); go('sessions'); }
  if (e.metaKey && e.key==='3') { e.preventDefault(); go('cron'); }
  if (e.metaKey && e.shiftKey && e.key==='r') { e.preventDefault(); refreshAll(); toast('Refreshed'); }
});
