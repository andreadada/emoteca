(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const icon=n=>`<svg aria-hidden="true"><use href="#i-${n}"></use></svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{if(typeof v!=='string'||!/^https?:\/\//i.test(v.trim()))return '';try{const x=new URL(v);return ['http:','https:'].includes(x.protocol)?x.href:'';}catch{return '';}};
const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it');
const typeNames={film:'Film',anime:'Anime',serie:'Serie TV','film-anime':'Film anime','film-animazione':'Animazione'};
const scoreNames={emotion:'Emozione',comedy:'Commedia',action:'Azione',romance:'Romanticismo',tension:'Tensione'};
const statusNames={watchlist:'Da guardare',watching:'In corso',watched:'Già visto'};
const reactNames={unseen:'Non visto',cried:'Ho pianto',moved:'Mi ha commosso',nothing:'Non mi ha colpito'};
let films=[],lists=[],selectedListId='mia-lista',listDialogMode='create',view='discover',typeFilter='all',selectedThemes=new Set(),sortFilter='match',query='',editFilmId=null,detailId=null,jsonPlan=null,posterQueue=[],posterActive=false;
let featuredId=null, remoteSelection=null, detailBackView='discover';
const posterFailed=new Set();
const posterCache=new Map();const posterTried=new Set();
try{const cache=JSON.parse(localStorage.getItem('afterframe-poster-cache')||'{}');Object.entries(cache).forEach(([k,v])=>{if(safeUrl(v))posterCache.set(k,v);});}catch{}
function fallback(f){return `<div class="poster-fallback"><strong>${esc(f.title)}</strong><span>${esc(f.year)}</span></div>`;}
function posterMarkup(f,eager=false){const src=(manuallySetPoster(f)?safeUrl(f.poster):'')||safeUrl(posterCache.get(f.id))||(!posterFailed.has(f.id)&&safeUrl(f.poster));return `${fallback(f)}${src?`<img class="poster-image" src="${esc(src)}" alt="Locandina di ${esc(f.title)}" width="320" height="480" loading="${eager?'eager':'lazy'}" fetchpriority="${eager?'high':'auto'}" decoding="async" onerror="this.remove();window.EmotecaPosterFailed?.(\'${esc(f.id)}\')" />`:''}`;}
function toast(msg,isError=false){const root=$('#toast-root'),el=document.createElement('div');el.className='toast'+(isError?' error':'');el.textContent=msg;root.append(el);setTimeout(()=>el.remove(),4000);}
function selectedList(){return lists.find(l=>l.id===selectedListId)||lists[0]||{id:'mia-lista',name:'La mia lista',filmIds:[]};}
function currentFilms(){const members=new Set(selectedList().filmIds);
 let arr=films.filter(f=>view==='discover'?f.status!=='watched':view==='all'?members.has(f.id):view==='watchlist'?f.status!=='watched':view==='watched'?f.status==='watched':view==='favorites'?f.favorite:true);
 if(typeFilter!=='all')arr=arr.filter(f=>f.type===typeFilter);
 if(selectedThemes.size)arr=arr.filter(f=>themeValues(f).some(theme=>selectedThemes.has(theme)));
 if(query){const q=normal(query);arr=arr.filter(f=>normal([f.title,f.genre,f.year,f.description,f.why,...f.tags].join(' ')).includes(q));}
 arr.sort((a,b)=>sortFilter==='newest'?b.year-a.year:sortFilter==='oldest'?a.year-b.year:sortFilter==='title'?a.title.localeCompare(b.title,'it'):sortFilter==='emotion'?(b.scores.emotion-a.scores.emotion)||(b.match-a.match):sortFilter==='rating'?(b.rating||0)-(a.rating||0):b.match-a.match||a.title.localeCompare(b.title,'it'));
 return arr;}
const titles={
 discover:['La tua selezione','Le storie che hai scelto di tenere a portata di mano.'],
 explore:['Tutti i film','Cerca film e serie nei cataloghi internazionali.'],
 all:['La mia lista','I tuoi film organizzati in raccolte personali.'],
 watchlist:['Da guardare','Film e serie ancora da vedere.'],
 watched:['Già visti','Le visioni che hai registrato.'],
 favorites:['I preferiti','I titoli a cui vuoi tornare.']
};
const viewLabels={discover:'In evidenza',explore:'Tutti i film',all:'Le mie liste',watchlist:'Da guardare',watched:'Visti',favorites:'Preferiti'};
function featuredFilm(){
 const candidates=films.filter(f=>f.status!=='watched'&&f.reaction==='unseen');
 if(!candidates.length){featuredId=null;return null;}
 const current=candidates.find(f=>f.id===featuredId);
 if(current)return current;
 let previous='';
 try{previous=sessionStorage.getItem('emoteca-featured-last')||'';}catch{}
 const pool=candidates.filter(f=>f.id!==previous);
 const choice=(pool.length?pool:candidates)[Math.floor(Math.random()*(pool.length||candidates.length))];
 featuredId=choice.id;
 try{sessionStorage.setItem('emoteca-featured-last',choice.id);}catch{}
 return choice;
}
function renderFeatured(){
 const f=featuredFilm(),hero=$('#hero');
 if(!f){hero.innerHTML='';hero.hidden=true;return;}
 hero.innerHTML=`<div class="feature-story">
  <p class="feature-context">Dalle tue liste <span class="feature-line" aria-hidden="true"></span> In evidenza</p>
  <p class="feature-meta">${esc(typeNames[f.type])}<span aria-hidden="true">/</span>${esc(f.year)}${f.duration?`<span aria-hidden="true">/</span>${esc(f.duration)}`:''}</p>
  <h2 class="feature-title">${esc(f.title)}</h2>
  <p class="feature-description">${esc(f.description||'Apri la scheda per conoscere questo titolo.')}</p>
  <div class="feature-actions">
   <button class="button primary" type="button" data-open="${esc(f.id)}">Apri la scheda ${icon('arrow')}</button>
   <button class="button quiet" type="button" data-view="watchlist">Apri la watchlist</button>
  </div>
 </div>
 <div class="feature-art" aria-hidden="true">
   <div class="feature-poster" data-poster="${esc(f.id)}">${posterMarkup(f,true)}</div>
   <span class="feature-edge">${esc(f.year)} / ${esc(typeNames[f.type])}</span>
 </div>`;
}
function renderRail(){
 const rail=$('#editorial-rail');
 const featured=featuredFilm();
 const candidates=films.filter(f=>f.status!=='watched'&&f.reaction==='unseen'&&f.id!==featured?.id).slice().sort((a,b)=>b.match-a.match);
 const picks=candidates.slice(0,7);
 rail.innerHTML=picks.map(f=>card(f)).join('');
 $('#reel-section').hidden=view!=='discover'||!!query||picks.length===0;
}
function renderListTabs(){
 const root=$('#personal-list-tabs');
 root.innerHTML=lists.map(list=>{
   const active=list.id===selectedList().id;
   return `<button type="button" class="personal-list-tab ${active?'active':''}"
      data-list-tab="${esc(list.id)}" aria-pressed="${active?'true':'false'}">
      <span>${esc(list.name)}</span><span class="list-tab-count">${list.filmIds.length}</span>
   </button>`;
 }).join('');
 $('#personal-lists').hidden=view!=='all';
 $('#personal-list-management').hidden=view!=='all';
 $('#personal-list-management [data-action="delete-list"]').hidden=selectedListId==='mia-lista';
}
function render(){
 const total=films.length;
 const watched=films.filter(f=>f.status==='watched').length;
 const watchlist=films.filter(f=>f.status!=='watched').length;
 const favorites=films.filter(f=>f.favorite).length;
 $('#count-all').textContent=lists.length;
 $('#count-watchlist').textContent=watchlist;
 $('#count-watched').textContent=watched;
 $('#count-favorites').textContent=favorites;
 $$('.nav-link').forEach(button=>{
  const active=button.dataset.view===view;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 });
 $('#page-title').textContent='Emoteca — '+viewLabels[view];
 const isBrowse=view==='explore';
 document.querySelector('.page-body').hidden=isBrowse;
 $('#explore-page').hidden=!isBrowse;
 $('#detail-screen').hidden=true;
 if(isBrowse)return;
 const current=selectedList();
 $('#current-view-name').textContent=view==='all'?'Le tue raccolte':query?'Risultati di ricerca':'La tua selezione';
 $('#section-title').textContent=view==='all'?current.name:query?'Risultati per “'+query+'”':titles[view][0];
 $('#section-caption').textContent=view==='all'?'I titoli di questa lista. Ogni film può appartenere a più raccolte.':titles[view][1];
 $('#library-meta').textContent=view==='all'?current.filmIds.length+' titoli nella lista':total+' titoli personali';
 renderListTabs();
 const home=view==='discover'&&!query;
 $('#hero').hidden=!home;
 if(home)renderFeatured();
 renderRail();
 const arr=currentFilms();
 $('#results-count').textContent=`${arr.length} ${arr.length===1?'risultato':'risultati'}`;
 $$('#type-filters [data-type]').forEach(b=>{
   const active=b.dataset.type===typeFilter;
   b.classList.toggle('active',active);
   b.setAttribute('aria-pressed',String(active));
 });
 $('#film-grid').innerHTML=arr.map(card).join('');
 $('#empty-state').classList.toggle('hidden',arr.length!==0);
 refreshThemeOptions();
 observePosters();
}
function card(f){
 const seen=f.status==='watched'?`<span class="film-flag">${icon('check')} Visto</span>`:'';
 return `<article class="film-card">
  <div class="film-cover">
   <button class="poster-wrap" type="button" data-open="${esc(f.id)}" aria-label="Apri la scheda di ${esc(f.title)}">${posterMarkup(f)}${seen}</button>
   <button class="card-favorite ${f.favorite?'is-fav':''}" type="button" data-favorite="${esc(f.id)}" aria-pressed="${f.favorite?'true':'false'}" aria-label="${f.favorite?'Rimuovi dai':'Aggiungi ai'} preferiti: ${esc(f.title)}" title="Preferiti">${icon('heart')}</button>
  </div>
  <div class="card-content">
   <button class="card-name" type="button" data-open="${esc(f.id)}">${esc(f.title)}</button>
   ${view==='all'? `<button class="card-remove-list" type="button" data-action="remove-from-list"
     data-id="${esc(f.id)}" aria-label="Rimuovi ${esc(f.title)} da ${esc(selectedList().name)}">Rimuovi dalla lista</button>`:''}
   <div class="card-subtitle"><span>${esc(f.year)}</span><span aria-hidden="true">·</span><span>${esc(typeNames[f.type])}</span>${f.rating!==null?`<span class="card-rating">${icon('star')} ${f.rating}/10</span>`:''}</div>
  </div>
 </article>`;
}
function themeValues(f){
 const genres=String(f.genre||'').split(/[·,;|/]+/);
 return [...new Set([...(Array.isArray(f.tags)?f.tags:[]),...genres].map(t=>normal(t).trim()).filter(Boolean))];
}
let themeListKey='';
function refreshThemeOptions(){
 const root=$('#theme-filters');
 const options=[...new Set(['horror',...films.flatMap(themeValues)])]
   .sort((a,b)=>a.localeCompare(b,'it'));
 const valid=new Set(options);
 for(const tag of selectedThemes)if(!valid.has(tag))selectedThemes.delete(tag);
 const key=options.join('\u0001');
 if(key!==themeListKey){
   root.innerHTML='<button class="theme-tag" type="button" data-theme="all" aria-pressed="true">Tutti i temi</button>'+
      options.map(tag=>`<button class="theme-tag" type="button" data-theme="${esc(tag)}" aria-pressed="false">${esc(tag.charAt(0).toLocaleUpperCase('it')+tag.slice(1))}</button>`).join('');
   themeListKey=key;
 }
 Array.from(document.querySelectorAll('#theme-filters [data-theme]')).forEach(button=>{
   const active=button.dataset.theme==='all'?selectedThemes.size===0:selectedThemes.has(button.dataset.theme);
   button.classList.toggle('active',active);
   button.setAttribute('aria-pressed',String(active));
 });
 const reset=$('#clear-library-filters');
 const dirty=typeFilter!=='all'||selectedThemes.size>0||query.length>0||sortFilter!=='match';
 reset.disabled=!dirty;
}
function clearLibraryFilters(){
 typeFilter='all';selectedThemes.clear();sortFilter='match';query='';
 $('#library-search').value='';
 $('#sort-filter').value='match';
 render();
}
function setView(v,updateHistory=true){
 if(!Object.hasOwn(titles,v))return;
 if(v==='explore'){openExplore('',updateHistory);return;}
 if(view!==v&&v==='discover')featuredId=null;
 view=v;typeFilter='all';selectedThemes.clear();query='';
 $('#search').value='';
 $('#library-search').value='';
 $('#sort-filter').value='match';sortFilter='match';
 if(updateHistory)history.pushState({view:v},'',v==='discover'?location.pathname:('#'+v));
 document.title='Emoteca — La tua libreria di cinema';
 render();
 window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
async function openExplore(term='',updateHistory=true){
 const first=view!=='explore';
 view='explore';query='';
 document.title='Tutti i film — Emoteca';
 $('#search').value=term;
 $('#catalog-query').value=term;
 if(updateHistory){
  const url=new URL(location.href);
  url.search='';
  url.hash='';
  url.searchParams.set('view','explore');
  if(term)url.searchParams.set('q',term);
  history.pushState({view:'explore'},'',url.pathname+url.search);
 }
 render();
 await window.EmotecaExplorer?.init?.();
 const typed=$('#catalog-query').value.trim() || $('#search').value.trim() || term;
 window.EmotecaExplorer?.search?.(typed);
 if(first)window.scrollTo({top:0,behavior:'auto'});
}
let writeQueue=Promise.resolve();
function store(nextOrUpdater,notify,options={}){
 const operation=async()=>{
   const next=typeof nextOrUpdater==='function'?nextOrUpdater(films):nextOrUpdater;
   if(next===films)return;
   await CatalogDB.write(next);
   films=next;
   if(options.background){
     // Do not close the film page or overwrite a note being typed.
     if(!$('#detail-screen').hidden){/* Refresh on the next navigation. */}
     else if(view==='explore')window.EmotecaExplorer?.refreshSaved?.();
     else render();
   }else render();
   if(notify)toast(notify);
 };
 const pending=writeQueue.then(operation,operation);
 writeQueue=pending.catch(()=>{});
 return pending;
}
async function attachCatalogRecord(localId,remote,seed=null){
 if(!/^tmdb-(movie|tv)-[1-9]\d*$/.test(remote?.id||''))return false;
 let updated=false;
 await store(current=>{
   const original=current.find(f=>f.id===localId);
   if(!original || original.year!==remote.year ||
      window.EmotecaIdentity.mediaOf(original)!==window.EmotecaIdentity.mediaOf(remote))
     return current;
   const existing=current.find(f=>f.id!==localId&&
     window.EmotecaIdentity.canonical(f)===remote.id);
   if(existing)return current;
   const merged=window.EmotecaIdentity.enrichSaved(original,remote,seed);
   if(!merged)return current;
   updated=true;
   return current.map(f=>f.id===localId?validateFilm(merged):f);
 },null,{background:true});
 return updated;
}
async function syncSeedCatalog(){
 const explorer=window.EmotecaExplorer;
 if(!explorer?.isEnabled?.() || !explorer?.resolveSeed)return;
 let networkFailures=0;
 for(const seed of window.SEED_FILMS||[]){
   const current=films.find(f=>f.id===seed.id);
   if(!current||current.catalogId||current.year!==seed.year||
     window.EmotecaIdentity.mediaOf(current)!==window.EmotecaIdentity.mediaOf(seed))continue;
   // Do not silently re-link a seed that the user renamed into a different work.
   if(current.title!==seed.title && current.posterQuery!==seed.posterQuery)continue;
   try{
     const remote=await explorer.resolveSeed(seed);
     if(remote){
       await attachCatalogRecord(seed.id,remote,seed);
       networkFailures=0;
     }
   }catch{
     if(++networkFailures>=3)break; // TMDB offline/rate-limited: retry next visit.
   }
   await new Promise(resolve=>setTimeout(resolve,750));
 }
}
async function changeFilm(id,change){
 await store(current=>current.map(f=>f.id===id?
  {...f,...change,updatedAt:new Date().toISOString()}:f));
}
function openDialog(id){const d=$('#'+id);if(!d.open)d.showModal();}
function closeDialog(id){const d=$('#'+id);if(d.open)d.close();}
function streaming(f){const q=encodeURIComponent(f.title),search=encodeURIComponent(f.posterQuery||f.title);
 const base=[{name:'JustWatch Italia',hint:'Confronta le piattaforme',url:`https://www.justwatch.com/it/cerca?q=${search}`},{name:'Prime Video',hint:'Cerca sul catalogo',url:`https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${search}`},{name:'Netflix',hint:'Cerca sul catalogo',url:`https://www.netflix.com/search?q=${search}`}];
 if(['anime','film-anime'].includes(f.type))base.push({name:'Crunchyroll',hint:'Cerca anime',url:`https://www.crunchyroll.com/search?q=${search}`});
 if(Array.isArray(f.links))for(const l of f.links){if(l&&safeUrl(l.url)&&l.name)base.unshift({name:l.name,hint:'Link personalizzato',url:l.url});}
 return base.map(l=>`<a class="watch-link" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer"><span>${esc(l.name)} <small style="color:#88859a;font-weight:500">· ${esc(l.hint)}</small></span>${icon('external')}</a>`).join('');}
function showDetail(id,push=true){
 const personal=films.find(x=>x.id===id);
 const f=personal||(remoteSelection?.id===id?remoteSelection:null);
 if(!f)return;
 detailId=id;
 if(push){
   detailBackView=view;
   const url=new URL(location.href);
   url.search='';url.hash='';
   url.searchParams.set('film',id);
   history.pushState({film:id,from:view},'',url.pathname+url.search);
 }
 document.querySelector('.page-body').hidden=true;
 $('#explore-page').hidden=true;
 $('#detail-screen').hidden=false;
 $('#film-page-title').textContent='Scheda di '+f.title;
 document.title=f.title+' — Emoteca';
 const saved=Boolean(personal);
 const scoreRows=Object.entries(scoreNames).map(([key,name])=>`<div class="score-row"><span>${esc(name)}</span><div class="score-track"><div class="score-fill" style="width:${(f.scores?.[key]||0)*20}%"></div></div><span class="score-number">${f.scores?.[key]||0}/5</span></div>`).join('');
 const heroButtons=saved
   ? `<button class="button primary" type="button" data-action="toggle-watched" data-id="${esc(f.id)}">${icon(f.status==='watched'?'check':'eye')}${esc(f.status==='watched'?'Segna da guardare':'Segna come visto')}</button>
      <button class="button quiet" type="button" data-action="toggle-favorite-detail" data-id="${esc(f.id)}">${icon('heart')}${esc(f.favorite?'Rimuovi dai preferiti':'Aggiungi ai preferiti')}</button>`
   : `<button class="button primary" type="button" data-action="add-preview" ${Number.isInteger(f.year)?'':'disabled'}>${icon('plus')} ${Number.isInteger(f.year)?'Aggiungi alla mia libreria':'Anno non disponibile'}</button>
      <button class="button quiet" type="button" data-view="explore">Torna al catalogo</button>`;
 const journal=saved?`<section class="reaction-panel">
     <h3>Il tuo diario</h3>
     <p>Una volta vista, questa storia rimane qui insieme ai tuoi ricordi.</p>
     <fieldset class="reaction-fieldset">
       <legend>Come ti ha lasciato?</legend>
       <div class="reaction-buttons">${Object.entries(reactNames).map(([value,label])=>`<button class="reaction-choice ${f.reaction===value?'active':''}" type="button" data-reaction="${value}" data-id="${esc(f.id)}" aria-pressed="${f.reaction===value?'true':'false'}">${esc(label)}</button>`).join('')}</div>
     </fieldset>
     <div class="rating-line"><label for="personal-rating">Il tuo voto</label><input id="personal-rating" type="range" min="0" max="10" step="1" value="${f.rating===null?0:f.rating}"><output id="personal-output">${f.rating===null?'—':f.rating+'/10'}</output></div>
     <div class="note-field"><label for="personal-notes">Note private</label><textarea id="personal-notes" rows="6" maxlength="3000" placeholder="Scrivi quello che vuoi ricordare…">${esc(f.notes)}</textarea></div>
     <button class="button secondary save-personal" type="button" data-action="save-personal" data-id="${esc(f.id)}">${icon('check')} Salva voto e note</button>
   </section>`:`<section class="reaction-panel">
      <h3>Fallo tuo.</h3>
      <p>Questo titolo proviene dal catalogo mondiale. Aggiungilo alla libreria per segnarlo come visto, conservarne il voto o scrivere note private.</p>
      <button class="button primary" type="button" data-action="add-preview" ${Number.isInteger(f.year)?'':'disabled'}>Aggiungi alla libreria</button>
      ${!Number.isInteger(f.year)?'<p class="link-notice">Questa fonte non indica l’anno: puoi aggiungere il titolo manualmente.</p>':''}
    </section>`;
 const image=f.backdrop&&safeUrl(f.backdrop)?`<img class="detail-backdrop" src="${esc(safeUrl(f.backdrop))}" alt="" loading="eager" referrerpolicy="no-referrer" onerror="this.remove()" />`:'';
 $('#detail-content').innerHTML=`<div class="detail-hero">
  ${image}
  <div class="detail-poster" data-poster="${esc(f.id)}">${posterMarkup(f,true)}</div>
  <div class="detail-intro">
    <div class="detail-headingline"><span>${esc(typeNames[f.type]||'Film')}</span><span aria-hidden="true">/</span>${esc(f.year||'Anno non disponibile')}${f.duration?`<span aria-hidden="true">/</span>${esc(f.duration)}`:''}</div>
    <h2>${esc(f.title)}</h2>
    ${f.genre?`<p class="detail-genres">${esc(f.genre)}</p>`:''}
    ${f.description?`<p class="detail-description">${esc(f.description)}</p>`:'<p class="detail-description">La fonte non fornisce una sinossi per questo titolo.</p>'}
    <div class="detail-actions">${heroButtons}</div>
    ${saved&&f.why?`<p class="detail-why">${esc(f.why)}</p>`:''}
    ${saved&&f.catalogId&&f.catalogSource?`<p class="detail-origin">Metadati collegati a ${esc(f.catalogSource)} · Diario personale conservato</p>`:''}
    ${!saved?`<p class="detail-origin">Scheda da ${esc(f.source||'catalogo esterno')}</p>`:''}
  </div>
 </div>
 <div class="detail-body">
   ${journal}
   <aside class="detail-aside">
     ${f.tags?.length?`<div class="detail-block"><h3>Temi</h3><div class="detail-tags">${f.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div></div>`:''}
     ${f.warnings?`<p class="detail-warnings">Avvertenze: ${esc(f.warnings)}</p>`:''}
     ${saved&&Object.values(f.scores||{}).some(n=>n>0)?`<details class="profile-details"><summary>Profilo editoriale del titolo</summary><div class="detail-scores">${scoreRows}</div><p class="link-notice">Stime editoriali, non voti del pubblico.</p></details>`:''}
     <div class="detail-block"><h3>Dove cercarlo</h3><div class="watch-links">${streaming(f)}</div>
      <p class="link-notice">I collegamenti aprono ricerche esterne e non garantiscono la disponibilità in streaming.</p></div>
     ${!saved&&f.sourceUrl&&safeUrl(f.sourceUrl)?`<a class="detail-source-link" target="_blank" rel="noopener noreferrer" href="${esc(safeUrl(f.sourceUrl))}">Apri la scheda su ${esc(f.source||'fonte esterna')} ${icon('external')}</a>`:''}
   </aside>
 </div>
 ${saved?`<div class="detail-bottom"><button class="button secondary" type="button" data-action="edit" data-id="${esc(f.id)}">${icon('edit')} Modifica scheda</button><button class="button secondary danger" type="button" data-action="delete" data-id="${esc(f.id)}">${icon('trash')} Elimina dalla libreria</button></div>`:''}`;
 observePosters();
 window.scrollTo({top:0,behavior:'auto'});
}
function editSliders(scores){$('#edit-sliders').innerHTML=Object.entries(scoreNames).map(([key,label])=>`<div class="score-edit"><label for="score-${key}">${esc(label)}</label><input id="score-${key}" name="score-${key}" type="range" min="0" max="5" step="1" value="${scores[key]??0}"><output id="out-${key}">${scores[key]??0}/5</output></div>`).join('');}
function slug(t){return normal(t).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75)||'nuovo-titolo';}
function openEdit(id){const f=films.find(x=>x.id===id);editFilmId=f?f.id:null;$('#film-form').reset();$('#form-title').textContent=f?'Modifica titolo':'Aggiungi titolo';$('#edit-original-id').value=f?f.id:'';
 const form=$('#film-form');const data=f||{title:'',id:'',year:new Date().getFullYear(),type:'film',genre:'',description:'',why:'',tags:[],poster:'',posterQuery:'',duration:'',match:80,warnings:'',scores:{emotion:3,comedy:1,action:2,romance:1,tension:2}};
 for(const key of ['title','id','year','type','genre','description','why','poster','posterQuery','duration','match','warnings'])if(form.elements[key])form.elements[key].value=data[key]??'';
 form.elements.tags.value=(data.tags||[]).join(', ');editSliders(data.scores);openDialog('edit-dialog');}
function getFormFilm(){const f=$('#film-form').elements;const old=films.find(x=>x.id===editFilmId);const scores={};Object.keys(scoreNames).forEach(k=>scores[k]=Number(f['score-'+k].value));
 const obj={...(old||{}),id:f.id.value.trim(),title:f.title.value.trim(),year:Number(f.year.value),type:f.type.value,genre:f.genre.value.trim(),description:f.description.value.trim(),why:f.why.value.trim(),tags:f.tags.value.split(',').map(x=>x.trim()).filter(Boolean),poster:f.poster.value.trim(),posterQuery:f.posterQuery.value.trim(),duration:f.duration.value.trim(),match:Number(f.match.value),warnings:f.warnings.value.trim(),scores};return validateFilm(obj);}
async function saveEdit(e){e.preventDefault();try{const film=getFormFilm();if(films.some(x=>x.id===film.id&&x.id!==editFilmId))throw Error('Esiste già un titolo con questo ID.');let next;if(editFilmId){next=films.map(x=>x.id===editFilmId?film:x);if(editFilmId!==film.id&&posterCache.has(editFilmId)){posterCache.delete(editFilmId);}}else{next=[film,...films];}await store(next,'Titolo salvato nel database locale.');closeDialog('edit-dialog');if(editFilmId&&detailId===editFilmId)showDetail(film.id,false);}catch(err){toast(err.message,true);}}
async function deleteFilm(id){const f=films.find(x=>x.id===id);if(!f)return;if(!confirm(`Eliminare definitivamente "${f.title}" dalla libreria locale?`))return;try{await store(films.filter(x=>x.id!==id),'Titolo eliminato.');setView('all');}catch(e){toast(e.message,true);}}
function downloadJson(name,obj){const blob=new Blob([JSON.stringify(obj,null,2)+'\n'],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
const example={version:1,operations:[{op:'update',id:'warrior-2011',changes:{scores:{emotion:5},notes:'Esempio: modifico soltanto i campi indicati.'}},{op:'add',film:{id:'il-mio-film-2026',title:'Il mio film',year:2026,type:'film',genre:'Drammatico',description:'Trama breve senza spoiler.',why:'Un grande sacrificio.',tags:['sacrificio','famiglia'],scores:{emotion:5,comedy:1,action:2,romance:1,tension:3},match:85}},{op:'delete',id:'il-mio-film-2026'}]};
function importShape(input){
 if(Array.isArray(input))return {mode:'ops',operations:input};
 if(!input||typeof input!=='object')throw Error('Il JSON deve essere un oggetto o un array di operazioni.');
 if(Array.isArray(input.films)&&(!input.operations||input.mode==='replace'))return {mode:'replace',films:input.films};
 if(Array.isArray(input.operations))return {mode:'ops',operations:input.operations};
 if(input.op||input.action)return {mode:'ops',operations:[input]};
 if(input.id&&input.title)return {mode:'ops',operations:[{op:'upsert',film:input}]};
 throw Error('Formato non riconosciuto. Usa {operations:[...]}, {op:"update",...} o {films:[...]} per sostituzione completa.');
}
const ALLOWED=new Set(['id','title','year','type','genre','description','why','tags','scores','match','status','reaction','rating','favorite','notes','poster','posterQuery','links','duration','country','warnings','featured','createdAt','updatedAt','catalogId','catalogSource','catalogTitle','backdrop']);
function validPlainObject(o){return o&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;}
function validatePatch(obj){if(!validPlainObject(obj))throw Error('changes deve essere un oggetto.');for(const k of Object.keys(obj)){if(!ALLOWED.has(k))throw Error(`Campo non ammesso: ${k}`);if(k==='scores'){if(!validPlainObject(obj.scores))throw Error('scores deve essere un oggetto.');for(const s of Object.keys(obj.scores))if(!Object.hasOwn(scoreNames,s))throw Error('Score sconosciuto: '+s);}}}
function validateFilm(raw){validatePatch(raw);
 const defaults={genre:'',description:'',why:'',tags:[],scores:{emotion:3,comedy:1,action:2,romance:1,tension:2},match:75,status:'watchlist',reaction:'unseen',rating:null,favorite:false,notes:'',poster:'',posterQuery:'',links:[],duration:'',country:'',warnings:'',featured:false,catalogId:'',catalogSource:'',catalogTitle:'',backdrop:''};
 const f={...defaults,...raw,scores:{...defaults.scores,...raw.scores}};
 if(typeof f.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,89}$/.test(f.id))throw Error('ID non valido: solo lettere minuscole, numeri e trattini (max 90).');
 if(typeof f.title!=='string'||!f.title.trim()||f.title.length>180)throw Error('Il titolo è obbligatorio (max 180 caratteri).');
 if(!Number.isInteger(f.year)||f.year<1880||f.year>2100)throw Error(`Anno non valido per ${f.title}.`);
 if(!Object.hasOwn(typeNames,f.type))throw Error(`Formato non valido per ${f.title}.`);
 if(!Number.isInteger(f.match)||f.match<0||f.match>100)throw Error(`match deve essere un intero da 0 a 100 per ${f.title}.`);
 for(const [k,n] of Object.entries(f.scores))if(!Object.hasOwn(scoreNames,k)||!Number.isInteger(n)||n<0||n>5)throw Error(`scores.${k} deve essere intero 0–5.`);
 if(!['watchlist','watching','watched'].includes(f.status))throw Error('status deve essere watchlist, watching o watched.');
 if(!Object.hasOwn(reactNames,f.reaction))throw Error('reaction non valida.');
 if(f.rating!==null&&(!Number.isInteger(f.rating)||f.rating<0||f.rating>10))throw Error('rating deve essere null o un intero 0–10.');
 if(typeof f.favorite!=='boolean'||typeof f.featured!=='boolean')throw Error('favorite e featured devono essere booleani.');
 for(const k of ['genre','description','why','notes','poster','posterQuery','duration','country','warnings','catalogId','catalogSource','catalogTitle','backdrop'])if(typeof f[k]!=='string'||f[k].length>(k==='notes'?3000:k==='description'?900:400))throw Error(`Campo ${k} non valido o troppo lungo.`);
 if(f.poster&&!safeUrl(f.poster))throw Error('La copertina deve avere URL http o https.');
 if(f.backdrop&&!safeUrl(f.backdrop))throw Error('Lo sfondo deve avere URL http o https.');
 if(f.catalogId&&!/^(?:tmdb-(?:movie|tv)-[1-9]\d*|wikidata-q[1-9]\d*)$/.test(f.catalogId))throw Error('Identificativo catalogo non valido.');
 if(f.catalogId&&window.EmotecaIdentity?.mediaOf(f)!==window.EmotecaIdentity?.mediaOf({id:f.catalogId,type:f.catalogId.startsWith('tmdb-tv-')?'serie':'film'})) {
   if(f.catalogId.startsWith('tmdb-'))throw Error('Il formato non corrisponde al catalogo.');
 }
 if(!Array.isArray(f.tags)||f.tags.length>30||f.tags.some(t=>typeof t!=='string'||t.length>65))throw Error('tags deve essere una lista di massimo 30 stringhe (max 65 caratteri).');
 if(!Array.isArray(f.links)||f.links.length>20||f.links.some(l=>!validPlainObject(l)||typeof l.name!=='string'||l.name.length>80||!safeUrl(l.url)))throw Error('links deve essere una lista di {name, url:https://...}.');
 if(f.createdAt&&typeof f.createdAt!=='string'||f.updatedAt&&typeof f.updatedAt!=='string')throw Error('Date non valide.');
 f.title=f.title.trim();f.tags=f.tags.map(t=>t.trim()).filter(Boolean);return f;}
function prepareImport(raw){if(raw.length>2_000_000)throw Error('File troppo grande (limite: 2 MB per import).');const obj=JSON.parse(raw),shape=importShape(obj);const next=new Map(films.map(f=>[f.id,f])),changes=[];
 if(shape.mode==='replace'){
  if(shape.films.length>3000)throw Error('Massimo 3000 titoli per import.');const seen=new Set();for(const r of shape.films){const f=validateFilm(r);if(seen.has(f.id))throw Error('ID duplicato nel backup: '+f.id);seen.add(f.id);}
  return {mode:'replace',next:shape.films.map(validateFilm),changes:[{op:'replace',text:`Sostituzione dell’intera libreria: ${films.length} → ${shape.films.length} titoli.`}]};
 }
 if(!shape.operations.length)throw Error('Nessuna operazione presente.');if(shape.operations.length>1000)throw Error('Massimo 1000 operazioni per import.');
 for(let index=0;index<shape.operations.length;index++){
  const x=shape.operations[index];if(!validPlainObject(x))throw Error('Operazione '+(index+1)+' non valida.');const op=x.op||x.action;
  if(op==='delete'){
    if(typeof x.id!=='string'||!x.id)throw Error('delete richiede id.');const existed=next.get(x.id);next.delete(x.id);changes.push({op,text:existed?`Elimina: ${existed.title}`:`Nessuna modifica: ${x.id} non presente`});
  }else if(op==='update'){
    if(typeof x.id!=='string'||!next.has(x.id))throw Error(`update richiede un ID esistente: ${x.id||'(mancante)'}`);
    validatePatch(x.changes);if('id' in x.changes&&x.changes.id!==x.id)throw Error('Non puoi cambiare id con update: usa delete + add.');const original=next.get(x.id);const patch=x.changes;const updated=validateFilm({...original,...patch,scores:patch.scores?{...original.scores,...patch.scores}:original.scores});next.set(x.id,updated);changes.push({op,text:`Aggiorna: ${original.title} (${Object.keys(patch).join(', ')||'nessun campo'})`});
  }else if(op==='add'||op==='upsert'){
    const f=validateFilm(x.film);const exists=next.has(f.id);if(op==='add'&&exists)throw Error(`add: ID già esistente: ${f.id}`);
    next.set(f.id,f);changes.push({op,text:`${exists?'Sovrascrivi':'Aggiungi'}: ${f.title}`});
  }else throw Error(`Operazione ${index+1} sconosciuta: ${op}`);
 }
 return {mode:'ops',next:[...next.values()],changes};}
function preview(){const raw=$('#json-input').value;jsonPlan=null;$('#apply-import').disabled=true;
 if(!raw.trim()){$('#json-preview').className='json-preview muted';$('#json-preview').innerHTML=`${icon('info')} Inserisci o carica un JSON per visualizzare le modifiche.`;return;}
 try{const plan=prepareImport(raw);jsonPlan={...plan,raw};const counts={add:0,upsert:0,update:0,delete:0,replace:0};plan.changes.forEach(c=>counts[c.op]++);
 $('#json-preview').className='json-preview valid';$('#json-preview').innerHTML=`${icon('check')}<div><strong>JSON valido · ${plan.changes.length} operazioni · risultato: ${plan.next.length} titoli</strong><ul class="preview-list">${plan.changes.slice(0,30).map(c=>`<li>${esc(c.text)}</li>`).join('')}${plan.changes.length>30?`<li>… e altre ${plan.changes.length-30} operazioni</li>`:''}</ul>${plan.mode==='replace'?'<strong>Attenzione: sostituirà l’intero catalogo.</strong>':''}</div>`;$('#apply-import').disabled=false;
 }catch(err){$('#json-preview').className='json-preview error';$('#json-preview').innerHTML=`${icon('info')} <div><strong>Errore nel JSON:</strong> ${esc(err.message)}</div>`;}}
async function applyImport(){try{if(!jsonPlan||jsonPlan.raw!==$('#json-input').value)preview();if(!jsonPlan)return;if(jsonPlan.mode==='replace'&&!confirm(`Confermi la SOSTITUZIONE COMPLETA del catalogo (${films.length} → ${jsonPlan.next.length} titoli)? Ti consigliamo di esportare prima un backup.`))return;
 const destructive=jsonPlan.changes.filter(c=>c.op==='delete');if(jsonPlan.mode!=='replace'&&destructive.length&&!confirm(`Questa importazione contiene ${destructive.length} operazioni di eliminazione. Confermi?`))return;
 const n=jsonPlan.next.length,c=jsonPlan.changes.length;await store(jsonPlan.next,`Importazione riuscita: ${c} operazioni applicate, ${n} titoli nel database.`);$('#json-input').value='';jsonPlan=null;preview();closeDialog('json-dialog');
 }catch(e){toast(e.message,true);}}
function manuallySetPoster(f){
 if(!f.poster||posterFailed.has(f.id))return false;
 const seed=window.SEED_FILMS?.find(item=>item.id===f.id);
 return !seed || seed.poster!==f.poster;
}
function tryCachedPoster(f){
 return (manuallySetPoster(f)?safeUrl(f.poster):'')||
  safeUrl(posterCache.get(f.id))||(!posterFailed.has(f.id)&&safeUrl(f.poster));
}
function shouldEnrichPoster(f){
 if(!f)return false;
 const tmdb=window.EmotecaExplorer?.isEnabled?.();
 const cached=safeUrl(posterCache.get(f.id));
 return Boolean(f&&!posterTried.has(f.id)&&(
  (tmdb&&!manuallySetPoster(f)&&!cached.includes('image.tmdb.org'))||!tryCachedPoster(f)
 ));
}
let observer=null;
function observePosters(){
 if(observer){observer.disconnect();observer=null;}
 const nodes=$$('[data-open] .poster-fallback, [data-poster] .poster-fallback');
 const fresh=nodes.filter(el=>{
  const id=el.parentElement.dataset.open||el.parentElement.dataset.poster;
  return shouldEnrichPoster(films.find(f=>f.id===id));
 });
 if(!('IntersectionObserver' in window)){
  fresh.slice(0,15).forEach(el=>queuePoster(el.parentElement.dataset.open||el.parentElement.dataset.poster));
  return;
 }
 observer=new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   const n=entry.target.parentElement,id=n.dataset.open||n.dataset.poster;
   queuePoster(id);observer.unobserve(entry.target);
  }
 },{rootMargin:'300px'});
 fresh.forEach(el=>observer.observe(el));
}
function queuePoster(id){if(!id||posterTried.has(id))return;posterTried.add(id);posterQueue.push(id);pumpPosters();}
window.EmotecaPosterFailed=id=>{
 if(!/^[a-z0-9-]{1,90}$/.test(id))return;
 posterFailed.add(id);posterCache.delete(id);
 if(films.some(f=>f.id===id)){posterTried.delete(id);queuePoster(id);}
};
async function pumpPosters(){
 if(posterActive)return;
 posterActive=true;
 while(posterQueue.length){
  const id=posterQueue.shift(),f=films.find(x=>x.id===id);
  const enabled=window.EmotecaExplorer?.isEnabled?.();
  const cached=safeUrl(posterCache.get(id));
  const enrich=enabled&&!manuallySetPoster(f||{})&&!cached.includes('image.tmdb.org');
  if(f&&(enrich||!tryCachedPoster(f))){
   try{
    const src=await fetchPoster(f);
    if(src){
     posterCache.set(id,src);posterFailed.delete(id);
     try{localStorage.setItem('afterframe-poster-cache',JSON.stringify(Object.fromEntries(posterCache)));}catch{}
     // Only actual artwork slots may receive a cover. Generic [data-open]
     // buttons (title, primary CTA) are navigation controls, not image wrappers.
     Array.from(document.querySelectorAll('.poster-wrap[data-open], .feature-poster[data-poster], .detail-poster[data-poster]'))
       .filter(node=>node.dataset.open===id||node.dataset.poster===id).forEach(node=>{
       let image=node.querySelector('.poster-image');
       if(!image){
        image=document.createElement('img');image.className='poster-image';
        image.alt='Copertina di '+f.title;image.loading='lazy';image.decoding='async';
        image.width=320;image.height=480;node.appendChild(image);
       }
       image.onerror=()=>{image.remove();posterFailed.add(id);};
       image.src=src;
     });
    }
   }catch{}
  }
  await new Promise(r=>setTimeout(r,650));
 }
 posterActive=false;
}
function similarity(a,b){const x=normal(a).replace(/[^a-z0-9]/g,''),y=normal(b).replace(/[^a-z0-9]/g,'');if(x===y)return 10;if(x.includes(y)||y.includes(x))return 7;let words=normal(a).split(/\W+/).filter(w=>w.length>3);return words.filter(w=>normal(b).includes(w)).length;}
async function fetchPoster(f){const term=f.posterQuery||f.title;
 try{
   const tmdb=await window.EmotecaExplorer?.posterFor?.(f);
   if(safeUrl(tmdb))return tmdb;
 }catch{}
 if(tryCachedPoster(f))return null;
 if(['anime','film-anime'].includes(f.type)){
  try{const r=await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(term)}&limit=5`);if(r.ok){const json=await r.json();const data=(json.data||[]).sort((a,b)=>Math.max(similarity(b.title,term),similarity(b.title_english||'',term))-Math.max(similarity(a.title,term),similarity(a.title_english||'',term)));const item=data[0];if(item&&Math.max(similarity(item.title,term),similarity(item.title_english||'',term))>=2){const url=item.images?.jpg?.large_image_url||item.images?.jpg?.image_url;if(safeUrl(url))return url;}}}catch{}
 }
 if(f.type==='serie'||f.type==='anime'){
  try{const r=await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(term)}`);if(r.ok){const json=await r.json();const item=json.find(x=>similarity(x.show.name,term)>=3);if(item){const url=item.show.image?.original||item.show.image?.medium;if(safeUrl(url))return url;}}}catch{}
 }
 try{
  const media=f.type==='serie'?'tvShow':'movie';const params=new URLSearchParams({term,country:'IT',media,limit:'15'});
  const r=await fetch(`https://itunes.apple.com/search?${params.toString()}`);if(r.ok){const j=await r.json();const results=(j.results||[]).filter(x=>x.artworkUrl100).sort((a,b)=>Math.max(similarity(b.trackName||'',term),similarity(b.collectionName||'',term))-Math.max(similarity(a.trackName||'',term),similarity(a.collectionName||'',term)));const item=results[0];if(item&&Math.max(similarity(item.trackName||'',term),similarity(item.collectionName||'',term))>=3){let u=item.artworkUrl100;return safeUrl(u.replace(/100x100[^.]*\./,'600x900bb.').replace(/^http:/,'https:'));}}
 }catch{}return null;}
function openJson(){jsonPlan=null;$('#json-input').value='';preview();openDialog('json-dialog');}
async function fileLoad(file){if(!file||file.size>2_000_000){toast('File assente o troppo grande (max 2 MB).',true);return;}try{$('#json-input').value=await file.text();preview();toast('File caricato. Controlla l’anteprima prima di applicare.');}catch(e){toast('Impossibile leggere il file JSON.',true);}}
function onClick(e){const clos=e.target.closest('[data-close]');if(clos){closeDialog(clos.dataset.close);return;}
 const viewButton=e.target.closest('[data-view]');if(viewButton){setView(viewButton.dataset.view);return;}
 const fav=e.target.closest('[data-favorite]');if(fav){const f=films.find(x=>x.id===fav.dataset.favorite);if(f)changeFilm(f.id,{favorite:!f.favorite}).catch(x=>toast(x.message,true));return;}
 const reaction=e.target.closest('[data-reaction]');if(reaction){const f=films.find(x=>x.id===reaction.dataset.id);if(f)changeFilm(f.id,{reaction:reaction.dataset.reaction,status:reaction.dataset.reaction==='unseen'?'watchlist':'watched'}).then(()=>showDetail(f.id,false)).catch(x=>toast(x.message,true));return;}
 const open=e.target.closest('[data-open]');if(open){showDetail(open.dataset.open);return;}
 const action=e.target.closest('[data-action]');if(!action)return;const id=action.dataset.id;
 switch(action.dataset.action){case'add':openEdit();break;
 case'hero-detail':{const f=featuredFilm();if(f)showDetail(f.id);break;}
 case'json':openJson();break;
 case'back-detail':{if(detailBackView==='explore')openExplore(window.EmotecaExplorer?.currentQuery?.()||'');else setView(detailBackView);break;}
 case'add-preview':{
   if(!remoteSelection || !window.EmotecaExplorer)return;
   let raw;
   try{raw=window.EmotecaExplorer.toLocalFilm(remoteSelection);}
   catch(error){toast(error.message,true);return;}
   window.AfterframeCatalog.addExternal(raw).then(outcome=>{
      remoteSelection=null;
      showDetail(outcome.id,false);
   }).catch(error=>toast(error.message,true));
   break;
 }
 case'clear-filters':clearLibraryFilters();break;
 case'edit':openEdit(id);break;
 case'delete':deleteFilm(id).catch(x=>toast(x.message,true));break;
 case'toggle-watched':{const f=films.find(x=>x.id===id);if(f)changeFilm(id,{status:f.status==='watched'?'watchlist':'watched',reaction:f.status==='watched'?'unseen':f.reaction}).then(()=>showDetail(id,false)).catch(x=>toast(x.message,true));break;}
 case'toggle-favorite-detail':{const f=films.find(x=>x.id===id);if(f)changeFilm(id,{favorite:!f.favorite}).then(()=>showDetail(id,false)).catch(x=>toast(x.message,true));break;}
 case'save-personal':{const rating=Number($('#personal-rating').value),notes=$('#personal-notes').value;changeFilm(id,{rating:rating===0?null:rating,notes}).then(()=>{showDetail(id,false);toast('Voto e note salvati.');}).catch(x=>toast(x.message,true));break;}
 case'export':downloadJson(`afterframe-backup-${new Date().toISOString().slice(0,10)}.json`,{format:'afterframe-catalog',version:1,exportedAt:new Date().toISOString(),films});toast('Backup JSON esportato.');break;
 case'example':downloadJson('afterframe-import-esempio.json',example);break;
 case'copy-example':$('#json-input').value=JSON.stringify(example,null,2);preview();break;
 case'preview':preview();break;
 case'apply':applyImport();break;
 case'reset':{if(!confirm('Ripristinare il catalogo iniziale? Tutte le modifiche, voti e titoli aggiunti saranno cancellati. Esporta prima un backup.'))break;if(!confirm('Ultima conferma: vuoi davvero cancellare le modifiche locali?'))break;store(structuredClone(window.SEED_FILMS),'Catalogo iniziale ripristinato.').then(()=>{closeDialog('json-dialog');setView('discover');}).catch(x=>toast(x.message,true));break;}
 }
}
async function routeFromLocation(){
 const params=new URLSearchParams(location.search);
 const filmId=params.get('film');
 if(filmId && /^[a-z0-9-]{1,90}$/.test(filmId)){
   const existing=films.find(f=>f.id===filmId);
   if(existing){showDetail(filmId,false);return;}
   await window.EmotecaExplorer?.init?.();
   const remote=await window.EmotecaExplorer?.detail?.(filmId);
   if(remote){
      await window.AfterframeCatalog.openExternal(remote,false);
      return;
   }
   setView('explore',false);
   toast('Scheda esterna non disponibile. Cerca il titolo nel catalogo.',true);
   return;
 }
 if(params.get('view')==='explore'){
   await openExplore(params.get('q')||'',false);
   return;
 }
 const selected=location.hash.slice(1);
 if(Object.hasOwn(titles,selected)&&selected!=='explore'){setView(selected,false);return;}
 setView('discover',false);
}
async function init(){
 try{
   let old=await CatalogDB.read();
   if(old===undefined||old===null){old=structuredClone(window.SEED_FILMS);await CatalogDB.write(old);}
   if(!Array.isArray(old))throw Error('Il database contiene dati in un formato non riconosciuto.');
   films=old.map(validateFilm);
   render();
 }catch(e){
   toast('Errore di caricamento: '+e.message,true);
   films=structuredClone(window.SEED_FILMS);
   render();
 }
 await routeFromLocation();
 window.EmotecaExplorer?.init?.().then(()=>{
   if(window.EmotecaExplorer?.isEnabled?.()){
     posterTried.clear();observePosters();
     // Link preloaded legacy IDs to official catalog identities, progressively.
     // Never overwrite personal history and never block the initial render.
     setTimeout(()=>{syncSeedCatalog().catch(()=>{});},1200);
   }
 }).catch(()=>{});
 $('#search').addEventListener('input',e=>{
 const term=e.target.value.trim();
 if(term.length>=2){
   if(view!=='explore')openExplore(term);
   else {
     $('#catalog-query').value=term;
     window.EmotecaExplorer?.search?.(term);
     const url=new URL(location.href);url.searchParams.set('q',term);
     history.replaceState({view:'explore'},'',url.pathname+url.search);
   }
 }else if(view==='explore'){
   $('#catalog-query').value=term;
   window.EmotecaExplorer?.search?.(term);
 }
});$('#library-search').addEventListener('input',e=>{query=e.target.value.trim();render();});
 $('#sort-filter').addEventListener('change',e=>{sortFilter=e.target.value;render();});
 $('#type-filters').addEventListener('click',e=>{const b=e.target.closest('[data-type]');if(b){typeFilter=b.dataset.type;render();}});
 $('#theme-filters').addEventListener('click',e=>{
   const b=e.target.closest('[data-theme]');if(!b)return;
   const theme=b.dataset.theme;
   if(theme==='all')selectedThemes.clear();
   else if(selectedThemes.has(theme))selectedThemes.delete(theme);
   else selectedThemes.add(theme);
   render();
 });
 document.addEventListener('click',onClick);window.addEventListener('popstate',()=>{routeFromLocation();});document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!$$('dialog').some(d=>d.open)){e.preventDefault();$('#search').focus();}if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-open]')){e.preventDefault();showDetail(e.target.dataset.open);}});
 $('#film-form').addEventListener('submit',saveEdit);$('#edit-title').addEventListener('input',e=>{if(!editFilmId)$('#edit-id').value=slug(e.target.value);});$('#edit-sliders').addEventListener('input',e=>{if(e.target.matches('input[type=range]'))$('#out-'+e.target.id.slice(6)).textContent=e.target.value+'/5';});
 $('#detail-screen').addEventListener('input',e=>{if(e.target.id==='personal-rating')$('#personal-output').textContent=e.target.value==='0'?'—':e.target.value+'/10';});
 $('#json-input').addEventListener('input',()=>{jsonPlan=null;$('#apply-import').disabled=true;});$('#json-file').addEventListener('change',e=>fileLoad(e.target.files[0]));const drop=$('#drop-zone');drop.addEventListener('click',()=>$('#json-file').click());drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#json-file').click();}});drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag-over');});drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag-over');fileLoad(e.dataTransfer.files[0]);});
 for(const d of $$('dialog'))d.addEventListener('click',e=>{if(e.target===d)d.close();});
}
document.addEventListener('DOMContentLoaded',init);
window.AfterframeCatalog={
  findSaved:raw=>window.EmotecaIdentity.findSaved(films,raw),
  isSaved:raw=>Boolean(window.EmotecaIdentity.findSaved(films,raw)),
  localMatches:term=>{
    const q=normal(term).trim();
    if(q.length<2)return '';
    return films.filter(f=>normal([f.title,f.genre,f.year,...f.tags].join(' ')).includes(q))
      .slice(0,7).map(card).join('');
  },
  openExplore:term=>openExplore(String(term||'')),
  openExternal:async (item,push=true)=>{
    const existing=window.EmotecaIdentity.findSaved(films,item);
    if(existing){
      remoteSelection=null;
      // Associate the canonical catalog entry with the preloaded local film,
      // but preserve its ID and personal diary.
      if(item.provider==='tmdb' && !existing.catalogId){
        await attachCatalogRecord(existing.id,item,
          (window.SEED_FILMS||[]).find(seed=>seed.id===existing.id));
      }
      showDetail(existing.id,push);
      return;
    }
    remoteSelection={
      id:item.id,title:item.title,year:item.year,type:item.type||'film',
      genre:item.genre||'',description:item.description||'',source:item.source||'catalogo esterno',
      sourceUrl:item.sourceUrl||'',originalTitle:item.originalTitle||'',backdrop:item.backdrop||'',
      why:'',tags:[],scores:{emotion:0,comedy:0,action:0,romance:0,tension:0},
      match:0,status:'watchlist',reaction:'unseen',rating:null,
      favorite:false,notes:'',poster:item.poster||'',posterQuery:item.originalTitle||item.title,
      links:[],duration:item.duration||'',country:'',warnings:'',featured:false
    };
    showDetail(item.id,push);
    if(/^tmdb-(movie|tv)-\d+$/.test(item.id) && window.EmotecaExplorer?.detail){
      const id=item.id;
      const enriched=await window.EmotecaExplorer.detail(id);
      if(remoteSelection?.id===id && enriched){
        remoteSelection={...remoteSelection,...enriched};
        if(detailId===id && !$('#detail-screen').hidden)showDetail(id,false);
      }
    }
  },
  addExternal:async raw=>{
    const film=validateFilm(raw);
    const existing=window.EmotecaIdentity.findSaved(films,film);
    if(existing){
      if(film.catalogId?.startsWith('tmdb-') && !existing.catalogId){
        const remote={
          id:film.catalogId,provider:'tmdb',title:film.catalogTitle||film.title,
          year:film.year,type:film.type,poster:film.poster,backdrop:film.backdrop,
          description:film.description,genre:film.genre,duration:film.duration,
          sourceUrl:film.links?.find(link=>link.url?.startsWith('https://www.themoviedb.org/'))?.url||''
        };
        await attachCatalogRecord(existing.id,remote,
          (window.SEED_FILMS||[]).find(seed=>seed.id===existing.id));
      }
      return {added:false,id:existing.id};
    }
    await store(current=>{
      if(window.EmotecaIdentity.findSaved(current,film))return current;
      return [film,...current];
    },'Titolo aggiunto alla tua libreria.');
    return {added:true,id:film.id};
  }
};
window.AfterframeTest={importShape,validateFilm,prepareImport,slug};
})();
