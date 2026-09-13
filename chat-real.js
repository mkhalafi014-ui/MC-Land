(() => {
  const API = window.MCLAND_API_BASE || 'https://mcland-chat-2026.onrender.com';
  let token = localStorage.getItem('mcland_token') || '';
  let user = null, selected = null, socket = null, online = false;
  const $ = s => document.querySelector(s);
  const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const avatar = n => 'https://mc-heads.net/avatar/'+encodeURIComponent(n)+'/64';
  const api = async (path,opt={}) => { const h={'Content-Type':'application/json',...(opt.headers||{})}; if(token)h.Authorization='Bearer '+token; const r=await fetch(API+path,{...opt,headers:h}); const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||'خطا در ارتباط با سرور'); return d; };
  const local = () => { try{return JSON.parse(localStorage.getItem('mcland_account')||'null')}catch{return null} };
  const modal = () => $('.modal-bg');
  function showModal(){const m=modal();if(!m)return;m.classList.add('open');renderAccount();}
  function hideModal(){const m=modal();if(m)m.classList.remove('open');}
  function renderAccount(){
    const m=modal(); if(!m)return; const box=m.querySelector('.modal'); if(!box)return;
    const u=user||local();
    box.innerHTML='<h3>حساب کاربری</h3><div id="real-account-body"></div><div class="modal-actions"><button class="btn" id="real-close">بستن</button></div>';
    $('#real-close').onclick=hideModal;
    if(u){
      $('#real-account-body').innerHTML=`<div class="account-mini"><img class="avatar" src="${u.avatar||avatar(u.username)}" alt=""><div><b>${esc(u.username)}</b><div class="note">${online&&user?'حساب واقعی MC LAND':'حساب محلی این دستگاه'}</div></div></div><div class="modal-actions"><button class="btn primary" id="real-logout">خروج از حساب</button></div>`;
      $('#real-logout').onclick=()=>{token='';user=null;localStorage.removeItem('mcland_token');localStorage.removeItem('mcland_account');if(socket)socket.disconnect();renderAccount();renderFriends([]);renderMessages([]);};
      return;
    }
    $('#real-account-body').innerHTML='<div class="field"><label>نام کاربری</label><input id="real-name" maxlength="16" placeholder="مثلاً MKiran"></div><div class="field"><label>رمز عبور</label><input id="real-pass" type="password" minlength="6" placeholder="حداقل ۶ کاراکتر"></div><div class="field"><label>عکس پروفایل</label><input id="real-avatar" type="file" accept="image/*"></div><div class="error" id="real-error"></div><div class="modal-actions"><button class="btn primary" id="real-register">ساخت حساب</button><button class="btn" id="real-login">ورود</button></div>';
    $('#real-register').onclick=()=>auth('register');$('#real-login').onclick=()=>auth('login');
  }
  async function auth(mode){
    const e=$('#real-error'),name=$('#real-name').value.trim(),pass=$('#real-pass').value;e.textContent='';
    if(!/^[A-Za-z0-9_\u0600-\u06FF -]{3,16}$/.test(name)||pass.length<6){e.textContent='نام کاربری باید ۳ تا ۱۶ کاراکتر و رمز عبور حداقل ۶ کاراکتر باشد.';return;}
    if(!online){if(mode==='register'){localStorage.setItem('mcland_account',JSON.stringify({username:name,avatar:''}));renderAccount();renderFriends([]);}else e.textContent='بک‌اند هنوز آنلاین نیست.';return;}
    try{const d=await api('/api/auth/'+mode,{method:'POST',body:JSON.stringify({username:name,password:pass})});token=d.token;user=d.user;localStorage.setItem('mcland_token',token);connect();await refresh();renderAccount();}catch(err){e.textContent=err.message;}
  }
  function connect(){if(!user||!token||typeof io!=='function')return;if(socket)socket.disconnect();socket=io(API,{auth:{token}});socket.on('chat:message',m=>{if(selected&&(m.from===selected.id||m.to===selected.id))loadMessages();});}
  function renderFriends(list){
    const box=$('#friends');if(!box)return;const me=user||local();if(!me){box.innerHTML='<div class="note">برای چت ابتدا حساب بساز.</div>';return;}
    list=list||JSON.parse(localStorage.getItem('mcland_friends')||'[]').map(x=>({id:x,username:x,avatar:''}));
    box.innerHTML='<div style="font-weight:800;margin-bottom:8px">دوستان</div>'+list.map(f=>`<div class="friend ${selected&&selected.id===f.id?'active':''}" data-id="${esc(f.id)}"><img class="avatar" style="width:32px;height:32px" src="${f.avatar||avatar(f.username)}"><span>${esc(f.username)}</span></div>`).join('')+'<div class="field"><input id="real-friend" maxlength="16" placeholder="نام کاربری دوست"><button class="btn">افزودن دوست</button></div>';
    box.querySelectorAll('.friend').forEach(el=>el.onclick=()=>{selected=list.find(x=>x.id===el.dataset.id);renderFriends(list);loadMessages();});
    box.querySelector('.field button').onclick=async()=>{const n=$('#real-friend').value.trim();if(!n)return;if(online&&user){try{await api('/api/friends',{method:'POST',body:JSON.stringify({username:n})});await refresh();}catch(e){alert(e.message);}}else{const f=JSON.parse(localStorage.getItem('mcland_friends')||'[]');if(!f.includes(n)&&n!==me.username)f.push(n);localStorage.setItem('mcland_friends',JSON.stringify(f));renderFriends();}};
  }
  function renderMessages(ms){const b=$('#messages');if(!b)return;b.innerHTML=ms.length?ms.map(m=>`<div class="msg ${user&&m.from===user.id||m.mine?'mine':''}"><div class="meta">${esc(m.fromUsername||m.user||'')}</div>${esc(m.text)}</div>`).join(''):'<div class="note">هنوز پیامی وجود ندارد.</div>';b.scrollTop=b.scrollHeight;}
  async function loadMessages(){if(!selected){renderMessages([]);return;}if(online&&user){try{const d=await api('/api/messages/'+encodeURIComponent(selected.id));renderMessages(d.messages||[]);return;}catch{}}const me=(user||local())?.username||'';const k='mcland_chat_'+[me,selected.username].sort().join('_');renderMessages(JSON.parse(localStorage.getItem(k)||'[]'));}
  async function refresh(){if(!online||!user){renderFriends();return;}try{const d=await api('/api/friends');renderFriends(d.friends||[]);}catch{renderFriends();}try{const d=await api('/api/leaderboard');const b=$('#leaderboard');if(b)b.innerHTML=(d.players||[]).map((p,i)=>`<div class="rank-row"><div class="rank">${p.rank||i+1}</div><img class="avatar" src="${p.avatar||avatar(p.username)}"><div class="rank-info"><div class="rank-name">${esc(p.username)}</div><div class="rank-stat">امتیاز ${p.score||0}</div></div></div>`).join('');}catch{}}
  async function start(){
    const sc=document.createElement('script');sc.src='https://cdn.socket.io/4.8.1/socket.io.min.js';document.head.appendChild(sc);
    const accountBtn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='حساب کاربری');if(accountBtn){const n=accountBtn.cloneNode(true);accountBtn.replaceWith(n);n.onclick=showModal;}
    const m=modal();if(m)m.onclick=e=>{if(e.target===m)hideModal();};
    const form=$('#chatForm');if(form){const n=form.cloneNode(true);form.replaceWith(n);n.onsubmit=async e=>{e.preventDefault();const input=$('#chatInput'),text=input.value.trim();if(!text||!selected)return;if(online&&user&&socket){socket.emit('chat:send',{to:selected.id,text});input.value='';return;}const me=(user||local()).username,k='mcland_chat_'+[me,selected.username].sort().join('_'),a=JSON.parse(localStorage.getItem(k)||'[]');a.push({user:me,text,mine:true});localStorage.setItem(k,JSON.stringify(a));input.value='';loadMessages();};}
    try{await api('/api/health');online=true;}catch{}
    if(token&&online){try{const d=await api('/api/me');user=d.user;connect();}catch{token='';localStorage.removeItem('mcland_token');}}
    await refresh();
  }
  start();
})();
