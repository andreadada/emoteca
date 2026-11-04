import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Optional Google accounts and PostgreSQL module parse without needing credentials',()=>{
 for(const path of ['server/user-api.mjs','js/theme.js','js/cloud.js','js/db.js','js/app.js']){
  const result=spawnSync(process.execPath,['--check',new URL('../'+path,import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,path+' syntax: '+result.stderr);
 }
});
test('Google sessions are verified on server and user data remains isolated',()=>{
 const api=read('server/user-api.mjs');
 for(const text of ["createPublicKey({key,format:'jwk'})","verifySignature('RSA-SHA256'",
  "payload.aud!==clientId","payload.exp<=now","payload.email_verified!==true",
  "token_hash","randomBytes(32)","httpOnly=true","SameSite=Lax",
  "csrfOk(req)","authenticatedOrigin(req)","WHERE google_sub=$3 AND version=$4",
  "status>=500",'google_sub TEXT PRIMARY KEY'])assert.ok(api.includes(text),'missing control '+text);
 const proxy=read('server/catalog-api.mjs');
 assert.ok(proxy.includes("if (await handleUser(req,res,url)) return;"));
 const nginx=read('nginx.conf');
 assert.ok(nginx.includes('location ^~ /api/user/'));
 assert.ok(nginx.includes('client_max_body_size 3m'));
});
test('Theme and full page backdrop assets are shipped in the Docker build',()=>{
 const html=read('index.html'),css=read('styles-personalization.css'),app=read('js/app.js'),docker=read('Dockerfile');
 for(const id of ['account-button','account-dialog','account-import-dialog','detail-cinema-backdrop'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('data-theme-choice="dark"'));
 assert.ok(html.includes('data-theme-choice="light"'));
 assert.ok(html.indexOf('js/cloud.js')<html.indexOf('js/db.js'));
 assert.ok(html.indexOf('js/db.js')<html.indexOf('js/app.js'));
 assert.ok(app.includes("$('#detail-cinema-backdrop')"));
 assert.ok(app.includes('class="detail-cinema-image"'));
 assert.ok(css.includes('data-theme="dark"'));
 assert.ok(css.includes('.detail-cinema-backdrop'));
 assert.ok(css.includes('.detail-cinema-backdrop::after'));
 assert.ok(docker.includes('styles-personalization.css'));
 assert.ok(docker.includes('COPY server/user-api.mjs'));
 assert.ok(docker.includes('npm install --omit=dev'));
 const db=read('js/db.js'),cloud=read('js/cloud.js');
 assert.ok(db.includes('readLocal:guest.read'));
 assert.ok(db.includes('window.EmotecaCloud.write(films,lists)'));
 assert.ok(cloud.includes("if(guestFilms?.length&&remote.films.length===0&&remote.version===0)"));
 assert.ok(cloud.includes("expectedVersion:remote.version"));
});
test('User endpoints are unavailable until the admin configures accounts',async()=>{
 const port=28000+Math.floor(Math.random()*8000);
 const child=spawn(process.execPath,[new URL('../server/catalog-api.mjs',import.meta.url).pathname],{
  env:{...process.env,CATALOG_PORT:String(port),GOOGLE_CLIENT_ID:'',DATABASE_URL:'',TMDB_READ_TOKEN:''},
  stdio:['ignore','pipe','pipe']
 });
 try{
  let ready=false;
  for(let i=0;i<60;i++){
    try{const res=await fetch('http://127.0.0.1:'+port+'/api/user/config');if(res.ok){ready=true;break;}}
    catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(ready,true,'server should start without Google/Postgres');
  const config=await (await fetch('http://127.0.0.1:'+port+'/api/user/config')).json();
  assert.equal(config.enabled,false);
  for(const path of ['/api/user/data','/api/user/session']){
    const res=await fetch('http://127.0.0.1:'+port+path);
    assert.equal(res.status,503);
    assert.equal(res.headers.get('cache-control'),'private, no-store');
  }
 } finally{
  child.kill('SIGTERM');
  await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,500))]);
 }
});
