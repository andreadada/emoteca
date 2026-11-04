/* IndexedDB con fallback localStorage. Un unico salvataggio atomico per import batch. */
(function(){
'use strict';
const NAME='afterframe-catalog-v1',KEY='all-films',FALLBACK='afterframe-local-backup-v1';
let dbHandle=null, useFallback=false;
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Errore IndexedDB'));});}
async function open(){
 if(useFallback)return null;
 if(dbHandle)return dbHandle;
 try{
  if(!('indexedDB' in window))throw Error('IndexedDB non disponibile');
  const req=indexedDB.open(NAME,1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('state'))db.createObjectStore('state');};
  dbHandle=await request(req);dbHandle.onversionchange=()=>{dbHandle.close();dbHandle=null;};return dbHandle;
 }catch(e){useFallback=true;return null;}
}
async function read(){
 const db=await open();
 if(!db){try{return JSON.parse(localStorage.getItem(FALLBACK)||'null');}catch{return null;}}
 return request(db.transaction('state','readonly').objectStore('state').get(KEY));
}
async function write(films){
 const db=await open();
 if(!db){try{localStorage.setItem(FALLBACK,JSON.stringify(films));return;}catch(e){throw Error('Impossibile salvare i dati su questo dispositivo: '+e.message);}}
 await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(films,KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Salvataggio fallito'));tx.onabort=()=>reject(tx.error||Error('Salvataggio annullato'));});
}
const LIST_KEY='personal-lists-v1',LIST_FALLBACK='emoteca-personal-lists-v1';
async function readLists(){
 const db=await open();
 if(!db){
   try{return JSON.parse(localStorage.getItem(LIST_FALLBACK)||'null');}
   catch{return null;}
 }
 const data=await request(db.transaction('state','readonly').objectStore('state').get(LIST_KEY));
 return data===undefined?null:data;
}
async function writeLists(lists){
 const db=await open();
 if(!db){
   try{localStorage.setItem(LIST_FALLBACK,JSON.stringify(lists));return;}
   catch(e){throw Error('Salvataggio liste impossibile: '+e.message);}
 }
 await new Promise((resolve,reject)=>{
   const tx=db.transaction('state','readwrite');
   tx.objectStore('state').put(lists,LIST_KEY);
   tx.oncomplete=resolve;
   tx.onerror=()=>reject(tx.error||Error('Errore salvataggio liste'));
   tx.onabort=()=>reject(tx.error||Error('Salvataggio liste annullato'));
 });
}
async function writeSnapshot(films,lists){
 const db=await open();
 if(!db){
   // Best effort fallback when IndexedDB is not available.
   const previousFilms=localStorage.getItem(FALLBACK);
   const previousLists=localStorage.getItem(LIST_FALLBACK);
   try{
     localStorage.setItem(FALLBACK,JSON.stringify(films));
     localStorage.setItem(LIST_FALLBACK,JSON.stringify(lists));
   }catch(e){
     if(previousFilms===null)localStorage.removeItem(FALLBACK);
     else localStorage.setItem(FALLBACK,previousFilms);
     if(previousLists===null)localStorage.removeItem(LIST_FALLBACK);
     else localStorage.setItem(LIST_FALLBACK,previousLists);
     throw Error('Impossibile salvare il backup: '+e.message);
   }
   return;
 }
 await new Promise((resolve,reject)=>{
   const tx=db.transaction('state','readwrite');
   tx.objectStore('state').put(films,KEY);
   tx.objectStore('state').put(lists,LIST_KEY);
   tx.oncomplete=resolve;
   tx.onerror=()=>reject(tx.error||Error('Errore salvataggio dati e liste'));
   tx.onabort=()=>reject(tx.error||Error('Salvataggio annullato'));
 });
}
window.CatalogDB={read,write,readLists,writeLists,writeSnapshot,isFallback:()=>useFallback};
})();
