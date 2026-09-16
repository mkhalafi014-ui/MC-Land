const express=require('express');
const http=require('http');
const cors=require('cors');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const {Pool}=require('pg');
const {Server}=require('socket.io');

const PORT=process.env.PORT||3000;
const SECRET=process.env.JWT_SECRET||'CHANGE_ME_MCLAND_SECRET';
const DATABASE_URL=process.env.DATABASE_URL;
if(!DATABASE_URL) console.warn('DATABASE_URL is not set');
const pool=new Pool({connectionString:DATABASE_URL,ssl:DATABASE_URL?{rejectUnauthorized:false}:false});

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:'*',methods:['GET','POST']}});
app.use(cors({origin:'*'}));
app.use(express.json({limit:'2mb'}));

async function initDb(){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,avatar TEXT DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
  await pool.query(`CREATE TABLE IF NOT EXISTS friends(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(user_id,friend_id));`);
  await pool.query(`CREATE TABLE IF NOT EXISTS messages(id BIGSERIAL PRIMARY KEY,from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,text TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
}
const makeId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function auth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'ورود لازم است'});req.user=jwt.verify(h.slice(7),SECRET);next()}catch{return res.status(401).json({error:'توکن نامعتبر است'})}}

app.get('/api/health',async(_,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,service:'MC LAND',realtime:true,database:true})}catch(e){res.status(503).json({ok:false,error:'database unavailable'})}});
app.get('/chat-real.js',(_,r)=>r.sendFile(require('path').join(__dirname,'..','chat-real.js')));
app.get('/',(_,r)=>{try{const fs=require('fs'),path=require('path');const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');r.type('html').send(html.replace('</body>','<script src="/chat-real.js"></script></body>'));}catch{r.status(500).send('MC LAND site unavailable')}});

app.post('/api/auth/register',async(req,res)=>{try{const username=String(req.body.username||'').trim(),password=String(req.body.password||'');if(!/^[A-Za-z0-9_\u0600-\u06FF -]{3,16}$/.test(username)||password.length<6)return res.status(400).json({error:'نام کاربری باید ۳ تا ۱۶ کاراکتر و رمز عبور حداقل ۶ کاراکتر باشد'});const exists=await pool.query('SELECT id FROM users WHERE LOWER(username)=LOWER($1)',[username]);if(exists.rowCount)return res.status(409).json({error:'نام کاربری تکراری است'});const u={id:makeId(),username,passwordHash:await bcrypt.hash(password,10)};await pool.query('INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3)',[u.id,u.username,u.passwordHash]);const token=jwt.sign({id:u.id,username:u.username},SECRET,{expiresIn:'30d'});res.json({token,user:{id:u.id,username:u.username,avatar:''}})}catch(e){res.status(500).json({error:'خطا در ساخت حساب'})}});

app.post('/api/auth/login',async(req,res)=>{try{const username=String(req.body.username||'').trim(),password=String(req.body.password||'');const q=await pool.query('SELECT id,username,password_hash,avatar FROM users WHERE LOWER(username)=LOWER($1)',[username]);const u=q.rows[0];if(!u||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:'نام کاربری یا رمز عبور اشتباه است'});res.json({token:jwt.sign({id:u.id,username:u.username},SECRET,{expiresIn:'30d'}),user:{id:u.id,username:u.username,avatar:u.avatar||''}})}catch{res.status(500).json({error:'خطا در ورود'})}});

app.get('/api/me',auth,async(req,res)=>{const q=await pool.query('SELECT id,username,avatar,created_at FROM users WHERE id=$1',[req.user.id]);const u=q.rows[0];res.json({user:u?{id:u.id,username:u.username,avatar:u.avatar||'',createdAt:u.created_at}:null})});
app.put('/api/me/avatar',auth,async(req,res)=>{const avatar=String(req.body.avatar||'');if(avatar.length>1500000)return res.status(413).json({error:'عکس بزرگ است'});await pool.query('UPDATE users SET avatar=$1 WHERE id=$2',[avatar,req.user.id]);res.json({ok:true,avatar})});

app.post('/api/friends',auth,async(req,res)=>{const target=String(req.body.username||'').trim();const q=await pool.query('SELECT id,username,avatar FROM users WHERE LOWER(username)=LOWER($1)',[target]);const other=q.rows[0];if(!other||other.id===req.user.id)return res.status(404).json({error:'دوست پیدا نشد'});await pool.query('INSERT INTO friends(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,other.id]);await pool.query('INSERT INTO friends(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[other.id,req.user.id]);res.json({ok:true,friend:{id:other.id,username:other.username,avatar:other.avatar||''}})});
app.get('/api/friends',auth,async(req,res)=>{const q=await pool.query('SELECT u.id,u.username,u.avatar FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=$1 ORDER BY u.username',[req.user.id]);res.json({friends:q.rows.map(u=>({id:u.id,username:u.username,avatar:u.avatar||''}))})});
app.get('/api/leaderboard',async(_,res)=>{const q=await pool.query('SELECT id,username,avatar,created_at FROM users ORDER BY created_at ASC LIMIT 10');res.json({players:q.rows.map((u,i)=>({rank:i+1,username:u.username,avatar:u.avatar||'',score:0}))})});
app.get('/api/messages/:friendId',auth,async(req,res)=>{const q=await pool.query('SELECT from_id AS from,to_id AS to,text,created_at AS "createdAt",u.username AS "fromUsername" FROM messages m JOIN users u ON u.id=m.from_id WHERE (from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1) ORDER BY m.id DESC LIMIT 100',[req.user.id,req.params.friendId]);res.json({messages:q.rows.reverse()})});

io.use((socket,next)=>{try{socket.user=jwt.verify(socket.handshake.auth?.token||'',SECRET);next()}catch{next(new Error('unauthorized'))}});
io.on('connection',socket=>{socket.join(socket.user.id);socket.on('chat:send',async p=>{try{const to=String(p?.to||''),text=String(p?.text||'').trim().slice(0,500);if(!to||!text||to===socket.user.id)return;const ok=await pool.query('SELECT id FROM users WHERE id=$1',[to]);if(!ok.rowCount)return;const q=await pool.query('INSERT INTO messages(from_id,to_id,text) VALUES($1,$2,$3) RETURNING id,from_id AS from,to_id AS to,text,created_at AS "createdAt"',[socket.user.id,to,text]);const msg=q.rows[0];msg.fromUsername=socket.user.username;io.to(socket.user.id).to(to).emit('chat:message',msg)}catch(e){console.error(e)}})});

initDb().then(()=>server.listen(PORT,'0.0.0.0',()=>console.log('MC LAND backend running on '+PORT))).catch(e=>{console.error('DB init failed',e);process.exit(1)});
