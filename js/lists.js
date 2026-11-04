/* Emoteca personal collections (v1).
 * Film metadata/diary remains in the existing film array. Lists only store
 * membership by stable local film ID; a film may belong to many lists.
 */
(function(){
 'use strict';
 const DEFAULT_ID='mia-lista';
 // List IDs are short; film IDs follow validateFilm() and may reach 90 characters.
 const listIdPattern=/^[a-z0-9][a-z0-9-]{0,63}$/;
 const filmIdPattern=/^[a-z0-9][a-z0-9-]{0,89}$/;
 const own=(v)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
 function initial(films=[]){
   return [{id:DEFAULT_ID,name:'La mia lista',filmIds:films.map(f=>f.id)}];
 }
 function normalize(raw,films=[]){
   if(!Array.isArray(raw)||!raw.length||raw.length>30)throw Error('Liste non valide (massimo 30).');
   const known=new Set(films.map(f=>f.id));
   const ids=new Set();
   if(!raw.some(item=>item?.id===DEFAULT_ID))throw Error('La lista iniziale non è presente.');
   return raw.map(item=>{
     if(!own(item)||typeof item.id!=='string'||!listIdPattern.test(item.id)||ids.has(item.id))
       throw Error('Identificativo lista non valido o duplicato.');
     ids.add(item.id);
     if(typeof item.name!=='string'||item.name.trim().length<1||item.name.trim().length>60)
       throw Error('Il nome della lista deve contenere da 1 a 60 caratteri.');
     if(!Array.isArray(item.filmIds)||item.filmIds.length>3000||
       item.filmIds.some(id=>typeof id!=='string'||!filmIdPattern.test(id)))
       throw Error('Film della lista non validi.');
     return {id:item.id,name:item.name.trim(),
       filmIds:[...new Set(item.filmIds)].filter(id=>known.has(id))};
   });
 }
 function create(lists,name,films=[]){
   if(!Array.isArray(lists)||lists.length>=30)throw Error('Puoi creare al massimo 30 liste.');
   if(typeof name!=='string'||!name.trim()||name.trim().length>60)
     throw Error('Inserisci un nome valido (massimo 60 caratteri).');
   const clean=name.trim();
   if(lists.some(l=>l.name.toLocaleLowerCase('it')===clean.toLocaleLowerCase('it')))
     throw Error('Esiste già una lista con questo nome.');
   const id='lista-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9));
   return [...lists,{id,name:clean,filmIds:[]}];
 }
 function rename(lists,id,name){
   if(typeof name!=='string'||!name.trim()||name.trim().length>60)
     throw Error('Inserisci un nome valido (massimo 60 caratteri).');
   if(lists.some(l=>l.id!==id&&l.name.toLocaleLowerCase('it')===name.trim().toLocaleLowerCase('it')))
     throw Error('Esiste già una lista con questo nome.');
   return lists.map(l=>l.id===id?{...l,name:name.trim()}:l);
 }
 function remove(lists,id){
   if(id===DEFAULT_ID)throw Error('La lista iniziale non può essere eliminata.');
   if(!lists.some(l=>l.id===id))return lists;
   return lists.filter(l=>l.id!==id);
 }
 function setMembership(lists,listId,filmId,include){
   return lists.map(l=>l.id!==listId?l:{
     ...l,filmIds:include
       ? l.filmIds.includes(filmId)?l.filmIds:[...l.filmIds,filmId]
       : l.filmIds.filter(id=>id!==filmId)
   });
 }
 window.EmotecaLists={DEFAULT_ID,initial,normalize,create,rename,remove,setMembership};
})();
