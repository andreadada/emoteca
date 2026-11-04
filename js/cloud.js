/* Account bootstrap. No Google token or session credential is stored in localStorage.
 * The server owns sessions (httpOnly cookie) and the PostgreSQL user snapshot.
 */
(function(){
 'use strict';
 let config={enabled:false},user=null,ready=null,active=false,snapshotCache=null;
 const $=s=>document.querySelector(s);
 const esc=t=>String(t||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function request(path,{method='GET',body}={}){
   const headers={'Accept':'application/json'};
   if(method!=='GET'){
     headers['Content-Type']='application/json';
     headers['X-Emoteca-CSRF']=config.csrf||'';
   }
   const response=await fetch(path,{method,credentials:'same-origin',headers,
     ...(body===undefined?{}:{body:JSON.stringify(body)})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Object.assign(Error(data.error||'Server temporaneamente non disponibile.'),{status:response.status});
   return data;
 }
 async function init(){
   if(ready)return ready;
   ready=(async()=>{
     config=await request('/api/user/config');
     if(config.enabled){
       const state=await request('/api/user/session');
       user=state.user;
       active=Boolean(user);
     }
     render();
     return user;
   })().catch(error=>{
     console.warn('Emoteca: stato account non disponibile:',error.message);
     config={enabled:false};
     user=null;active=false;render();return null;
   });
   return ready;
 }
 function render(){
   const button=$('#account-button');
   if(!button)return;
   button.textContent=user?(user.name||user.email||'Account'):'Accedi';
   button.title=user?'Account e sincronizzazione':'Accedi con Google';
   const name=$('#account-summary');
   if(name)name.textContent=user?
     'Connesso come '+user.name+' ('+user.email+'). Le tue liste e le note sono salvate nell’account.':
     config.enabled?'Accedi per sincronizzare le tue liste tra dispositivi.':'Per attivare Google, configura le credenziali su Coolify.';
   const sign=$('#google-signin-container');
   const logout=$('#account-logout');
   const deletion=$('#account-delete');
   if(sign)sign.hidden=Boolean(user);
   if(logout)logout.hidden=!user;
   if(deletion)deletion.hidden=!user;
 }
 async function loadGIS(){
   if(window.google?.accounts?.id)return;
   await new Promise((resolve,reject)=>{
     const existing=document.querySelector('script[data-google-identity]');
     if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
     const script=document.createElement('script');
     script.src='https://accounts.google.com/gsi/client';
     script.async=true;script.defer=true;script.dataset.googleIdentity='1';
     script.onload=resolve;script.onerror=()=>reject(Error('Impossibile caricare Google Sign-In.'));
     document.head.appendChild(script);
   });
 }
 async function openDialog(){
   await init();
   const dialog=$('#account-dialog');
   if(!dialog)return;
   render();
   if(!dialog.open)dialog.showModal();
   if(!user&&config.enabled){
     const container=$('#google-signin-container');
     container.innerHTML='';
     try{
       await loadGIS();
       window.google.accounts.id.initialize({client_id:config.googleClientId,
         callback:response=>completeGoogle(response.credential),
         auto_select:false,ux_mode:'popup'});
       window.google.accounts.id.renderButton(container,{
         type:'standard',theme:document.documentElement.dataset.theme==='dark'?'filled_black':'outline',
         size:'large',shape:'rectangular',text:'signin_with',width:246});
     }catch(error){container.textContent='Accesso Google non disponibile: '+error.message;}
   }
 }
 async function completeGoogle(credential){
   const feedback=$('#account-feedback');
   try{
     if(feedback)feedback.textContent='Verifica dell’account…';
     const guestFilms=await window.CatalogDB.readLocal();
     const guestLists=await window.CatalogDB.readLocalLists();
     const result=await request('/api/user/login',{method:'POST',body:{credential}});
     user=result.user;
     const remote=await request('/api/user/data');
     if($('#account-dialog')?.open)$('#account-dialog').close();
     if(guestFilms?.length&&remote.films.length===0&&remote.version===0){
       const pending=$('#account-import-dialog');
       $('#account-import-description').textContent='Hai '+guestFilms.length+
         ' titoli salvati in questo browser. Vuoi copiarli nel nuovo account? I dati locali resteranno intatti.';
       pending.dataset.ready='true';
       pending.showModal();
       pending.querySelector('[data-cloud-import]').onclick=async()=>{
         try{
           $('#account-import-description').textContent='Importazione in corso…';
           const lists=Array.isArray(guestLists)&&guestLists.length?
             guestLists:[{id:'mia-lista',name:'La mia lista',filmIds:guestFilms.map(f=>f.id)}];
           await request('/api/user/data',{method:'PUT',body:{films:guestFilms,lists,expectedVersion:remote.version}});
           location.reload();
         }catch(e){$('#account-import-description').textContent='Importazione non riuscita: '+e.message+
           '. Nessun dato locale è stato cancellato.';}
       };
       pending.querySelector('[data-cloud-skip]').onclick=()=>location.reload();
       return;
     }
     location.reload();
   }catch(error){
     if(feedback)feedback.textContent='Accesso non riuscito: '+error.message;
   }
 }
 async function logout(){
   await request('/api/user/logout',{method:'POST',body:{}});
   location.reload();
 }
 async function deleteAccount(){
   const answer=prompt('Per eliminare definitivamente il tuo account e tutte le liste e note cloud, digita ELIMINA. I dati di questo browser non saranno cancellati.');
   if(answer!=='ELIMINA')return;
   await request('/api/user/delete',{method:'POST',body:{confirm:'ELIMINA'}});
   location.reload();
 }
 async function snapshot(){
   await init();
   if(!active)throw Error('Utente non autenticato.');
   if(!snapshotCache)snapshotCache=await request('/api/user/data');
   return snapshotCache;
 }
 async function write(films,lists){
   const old=await snapshot();
   const result=await request('/api/user/data',{method:'PUT',body:{
     films,lists,expectedVersion:old.version
   }});
   snapshotCache={films,lists,version:result.version};
 }
 document.addEventListener('click',event=>{
   if(event.target.closest('#account-button'))openDialog();
   if(event.target.closest('#account-logout'))logout().catch(error=>alert(error.message));
   if(event.target.closest('#account-delete'))deleteAccount().catch(error=>alert(error.message));
   if(event.target.closest('[data-close-account]')){
     const dialog=event.target.closest('dialog');
     if(dialog?.open)dialog.close();
   }
 });
 window.EmotecaCloud={
   init,isSignedIn:()=>active,snapshot,write,openDialog,
   isConfigured:()=>Boolean(config.enabled),user:()=>user
 };
})();
