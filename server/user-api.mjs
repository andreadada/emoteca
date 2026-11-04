/**
 * Optional private Emoteca accounts API.
 * Only enabled when both GOOGLE_CLIENT_ID and DATABASE_URL are configured.
 * Google ID tokens are verified against Google's signing keys, never trusted by
 * decoding alone. User data are partitioned by the verified Google subject.
 */
import {createHash, createPublicKey, randomBytes, verify as verifySignature} from 'node:crypto';

const clientId=(process.env.GOOGLE_CLIENT_ID||'').trim();
const databaseUrl=(process.env.DATABASE_URL||'').trim();
const enabled=Boolean(clientId&&databaseUrl);
const cookieSession='emoteca_session',cookieCsrf='emoteca_csrf';
const sessionTtlDays=14;
const secureCookie=process.env.NODE_ENV!=='test';
const imageSafe=/^[a-z0-9][a-z0-9-]{0,89}$/;
const listSafe=/^[a-z0-9][a-z0-9-]{0,63}$/;
const defaultLists=()=>[{id:'mia-lista',name:'La mia lista',filmIds:[]}];
let poolPromise;
let keyCache={keys:[],expires:0};
const loginAttempts=new Map();
function checkLoginRate(req){
  const key=String(req.headers['x-real-ip']||req.socket.remoteAddress||'anonymous').slice(0,120);
  const now=Date.now();
  const current=loginAttempts.get(key);
  const record=!current||current.reset<now?{count:0,reset:now+15*60*1000}:current;
  record.count++;loginAttempts.set(key,record);
  if(loginAttempts.size>8000){
    for(const [ip,value] of loginAttempts)if(value.reset<now)loginAttempts.delete(ip);
  }
  return record.count<=15;
}

function json(res,status,body,headers={}){
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff','Vary':'Cookie',...headers
  });res.end(JSON.stringify(body));
}
function cookie(name,value,{maxAge=null,httpOnly=true}={}){
  return name+'='+encodeURIComponent(value)+'; Path=/; SameSite=Lax'+
    (secureCookie?'; Secure':'')+(httpOnly?'; HttpOnly':'')+
    (maxAge!==null?'; Max-Age='+maxAge:'');
}
function cookies(req){
  const out=Object.create(null);
  for(const pair of (req.headers.cookie||'').split(';')){
    const n=pair.indexOf('=');if(n>0){
      try{out[pair.slice(0,n).trim()]=decodeURIComponent(pair.slice(n+1).trim());}catch{}
    }
  }
  return out;
}
const hash=value=>createHash('sha256').update(value).digest('hex');
function authenticatedOrigin(req){
  const origin=req.headers.origin;
  const host=req.headers.host;
  if(!origin||!host)return false;
  try{
    const url=new URL(origin);
    return url.host===host &&
      (secureCookie?url.protocol==='https:':['http:','https:'].includes(url.protocol));
  }catch{return false;}
}
function csrfOk(req){
  const cs=cookies(req)[cookieCsrf];
  const header=req.headers['x-emoteca-csrf'];
  return typeof cs==='string'&&cs.length>=24&&cs===header&&authenticatedOrigin(req);
}
async function readJson(req,limit=2200000){
  let size=0,chunks=[];
  for await(const part of req){
    size+=part.length;
    if(size>limit){const error=Error('Richiesta troppo grande.');error.status=413;throw error;}
    chunks.push(part);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{const error=Error('JSON non valido.');error.status=400;throw error;}
}
async function database(){
  if(!enabled)throw Error('Account non configurati.');
  if(!poolPromise){
    poolPromise=(async()=>{
      const {Pool}=await import('pg');
      const pool=new Pool({connectionString:databaseUrl,max:6,idleTimeoutMillis:30000,connectionTimeoutMillis:7000});
      try{
        await pool.query(`CREATE TABLE IF NOT EXISTS emoteca_users (
          google_sub TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL,
          picture TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS emoteca_sessions (
          token_hash TEXT PRIMARY KEY, google_sub TEXT NOT NULL REFERENCES emoteca_users(google_sub) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS emoteca_sessions_expires ON emoteca_sessions(expires_at)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS emoteca_documents (
          google_sub TEXT PRIMARY KEY REFERENCES emoteca_users(google_sub) ON DELETE CASCADE,
          version INTEGER NOT NULL DEFAULT 0, films JSONB NOT NULL DEFAULT '[]'::jsonb,
          lists JSONB NOT NULL DEFAULT '[{"id":"mia-lista","name":"La mia lista","filmIds":[]}]'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
      }catch(error){await pool.end();throw error;}
      return pool;
    })().catch(error=>{poolPromise=null;throw error;});
  }
  return poolPromise;
}
async function googlePublicKeys(force=false){
  if(!force&&keyCache.expires>Date.now()&&keyCache.keys.length)return keyCache.keys;
  const response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw Error('Chiavi Google temporaneamente non disponibili.');
  const body=await response.json();
  if(!Array.isArray(body.keys))throw Error('Chiavi Google non valide.');
  const keys=body.keys.filter(key=>key.kty==='RSA'&&key.alg==='RS256'&&typeof key.kid==='string');
  if(!keys.length)throw Error('Chiavi Google non valide.');
  keyCache={keys,expires:Date.now()+45*60*1000};
  return keys;
}
async function verifyGoogle(token){
  if(typeof token!=='string'||token.length>12000)throw Error('Credenziale Google non valida.');
  const parts=token.split('.');
  if(parts.length!==3)throw Error('Credenziale Google non valida.');
  let header,payload;
  try{
    header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  }catch{throw Error('Credenziale Google non valida.');}
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('Firma Google non valida.');
  let key=(await googlePublicKeys()).find(k=>k.kid===header.kid);
  if(!key)key=(await googlePublicKeys(true)).find(k=>k.kid===header.kid);
  if(!key)throw Error('Chiave Google non riconosciuta.');
  const verified=verifySignature('RSA-SHA256',
    Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),
    Buffer.from(parts[2],'base64url'));
  const now=Math.floor(Date.now()/1000);
  if(!verified||!['accounts.google.com','https://accounts.google.com'].includes(payload.iss)||
    payload.aud!==clientId||!Number.isFinite(payload.exp)||payload.exp<=now||
    !Number.isFinite(payload.iat)||payload.iat>now+60||
    typeof payload.sub!=='string'||!/^\d{1,40}$/.test(payload.sub)||
    payload.email_verified!==true||typeof payload.email!=='string')
      throw Error('Identità Google non verificata.');
  return {sub:payload.sub,email:payload.email.slice(0,255),
    name:typeof payload.name==='string'?payload.name.slice(0,100):'Utente',
    picture:typeof payload.picture==='string'&&/^https:\/\//.test(payload.picture)?payload.picture.slice(0,500):''};
}
async function currentUser(req,db){
  const token=cookies(req)[cookieSession];
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const rows=await db.query(`SELECT u.google_sub,u.email,u.display_name,u.picture
    FROM emoteca_sessions s JOIN emoteca_users u ON s.google_sub=u.google_sub
    WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(token)]);
  return rows.rows[0]||null;
}
function validDocument(data){
  if(!data||typeof data!=='object'||!Array.isArray(data.films)||
    data.films.length>3000||!Array.isArray(data.lists)||!data.lists.length||data.lists.length>30)
    return false;
  const seen=new Set();
  for(const film of data.films){
    if(!film||typeof film!=='object'||Array.isArray(film)||typeof film.id!=='string'||
      !imageSafe.test(film.id)||seen.has(film.id))return false;
    seen.add(film.id);
  }
  const names=new Set();
  const ids=new Set();
  for(const list of data.lists){
    if(!list||typeof list!=='object'||Array.isArray(list)||typeof list.id!=='string'||
      !listSafe.test(list.id)||ids.has(list.id)||typeof list.name!=='string'||
      !list.name.trim()||list.name.length>60||!Array.isArray(list.filmIds)||list.filmIds.length>3000||
      list.filmIds.some(id=>typeof id!=='string'||!seen.has(id)))return false;
    ids.add(list.id);names.add(list.name);
  }
  return ids.has('mia-lista')&&Number.isInteger(data.expectedVersion)&&data.expectedVersion>=0&&
    data.expectedVersion<2147483646;
}
export async function handleUser(req,res,url){
  if(!url.pathname.startsWith('/api/user/'))return false;
  if(url.pathname==='/api/user/config'&&req.method==='GET'){
    if(!enabled){json(res,200,{enabled:false});return true;}
    let csrf=cookies(req)[cookieCsrf];
    if(!csrf||!/^[a-f0-9]{64}$/.test(csrf))csrf=randomBytes(32).toString('hex');
    json(res,200,{enabled:true,googleClientId:clientId,csrf},
      {'Set-Cookie':cookie(cookieCsrf,csrf,{httpOnly:false,maxAge:14*86400})});
    return true;
  }
  if(!enabled){json(res,503,{error:'Accesso Google non configurato sul server.'});return true;}
  try{
    const db=await database();
    if(url.pathname==='/api/user/session'&&req.method==='GET'){
      const user=await currentUser(req,db);
      json(res,200,{user:user?{name:user.display_name,email:user.email,picture:user.picture}:null});
      return true;
    }
    if(url.pathname==='/api/user/login'&&req.method==='POST'){
      if(!checkLoginRate(req)){json(res,429,{error:'Troppi tentativi di accesso: riprova più tardi.'});return true;}
      if(!csrfOk(req)){json(res,403,{error:'Controllo sicurezza non riuscito.'});return true;}
      const data=await readJson(req,16000);
      const user=await verifyGoogle(data.credential);
      await db.query(`INSERT INTO emoteca_users (google_sub,email,display_name,picture)
        VALUES($1,$2,$3,$4) ON CONFLICT(google_sub) DO UPDATE
        SET email=EXCLUDED.email, display_name=EXCLUDED.display_name,picture=EXCLUDED.picture`,
        [user.sub,user.email,user.name,user.picture]);
      await db.query(`INSERT INTO emoteca_documents(google_sub) VALUES($1)
        ON CONFLICT (google_sub) DO NOTHING`,[user.sub]);
      const session=randomBytes(32).toString('hex');
      await db.query('INSERT INTO emoteca_sessions(token_hash,google_sub,expires_at) VALUES($1,$2,now()+interval \'14 days\')',
        [hash(session),user.sub]);
      json(res,200,{user:{name:user.name,email:user.email,picture:user.picture}},
        {'Set-Cookie':cookie(cookieSession,session,{maxAge:sessionTtlDays*86400})});
      return true;
    }
    if(url.pathname==='/api/user/logout'&&req.method==='POST'){
      if(!csrfOk(req)){json(res,403,{error:'Controllo sicurezza non riuscito.'});return true;}
      const token=cookies(req)[cookieSession];
      if(token)await db.query('DELETE FROM emoteca_sessions WHERE token_hash=$1',[hash(token)]);
      json(res,200,{ok:true},{'Set-Cookie':cookie(cookieSession,'',{maxAge:0})});
      return true;
    }
    if(url.pathname==='/api/user/delete'&&req.method==='POST'){
      if(!csrfOk(req)){json(res,403,{error:'Controllo sicurezza non riuscito.'});return true;}
      const user=await currentUser(req,db);
      if(!user){json(res,401,{error:'Accedi prima di eliminare l’account.'});return true;}
      const body=await readJson(req,1000);
      if(body.confirm!=='ELIMINA'){json(res,400,{error:'Conferma non valida.'});return true;}
      // This deletes only the authenticated Google user's records, not browser data.
      await db.query('DELETE FROM emoteca_users WHERE google_sub=$1',[user.google_sub]);
      json(res,200,{deleted:true},{'Set-Cookie':cookie(cookieSession,'',{maxAge:0})});
      return true;
    }
    if(url.pathname==='/api/user/data'&&['GET','PUT'].includes(req.method)){
      const user=await currentUser(req,db);
      if(!user){json(res,401,{error:'Accedi per accedere ai tuoi dati cloud.'});return true;}
      if(req.method==='GET'){
        const data=await db.query('SELECT films,lists,version FROM emoteca_documents WHERE google_sub=$1',[user.google_sub]);
        const row=data.rows[0];
        json(res,200,row||{films:[],lists:defaultLists(),version:0});return true;
      }
      if(!csrfOk(req)){json(res,403,{error:'Controllo sicurezza non riuscito.'});return true;}
      const data=await readJson(req);
      if(!validDocument(data)){json(res,400,{error:'Archivio non valido o troppo grande.'});return true;}
      const changed=await db.query(`UPDATE emoteca_documents
        SET films=$1::jsonb,lists=$2::jsonb,version=version+1,updated_at=now()
        WHERE google_sub=$3 AND version=$4 RETURNING version`,
        [JSON.stringify(data.films),JSON.stringify(data.lists),user.google_sub,data.expectedVersion]);
      if(!changed.rowCount){json(res,409,{error:'Le liste sono cambiate su un altro dispositivo. Ricarica la pagina prima di salvare.'});return true;}
      json(res,200,{version:changed.rows[0].version});return true;
    }
    json(res,404,{error:'Endpoint account inesistente.'});return true;
  }catch(error){
    const status=error.status||(/Credenziale|Firma|Chiave|Identità/.test(error.message)?401:503);
    if(status>=500)console.error('Emoteca account unavailable:',error.message);
    json(res,status,{error:status>=500?'Servizio account temporaneamente non disponibile.':error.message});
    return true;
  }
}
