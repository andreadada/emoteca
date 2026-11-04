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
window.CatalogDB={read,write,isFallback:()=>useFallback};
})();
