(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const icon=n=>`<svg aria-hidden="true"><use href="#i-${n}"></use></svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const x=new URL(String(v),location.href);return ['http:','https:'].includes(x.protocol)?x.href:'';}catch{return '';}};
const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it');
const typeNames={film:'Film',anime:'Anime',serie:'Serie TV','film-anime':'Film anime','film-animazione':'Animazione'};
const scoreNames={emotion:'Emozione',comedy:'Commedia',action:'Azione',romance:'Romanticismo',tension:'Tensione'};
const statusNames={watchlist:'Da guardare',watching:'In corso',watched:'Già visto'};
const reactNames={unseen:'Non visto',cried:'Ho pianto',moved:'Mi ha commosso',nothing:'Non mi ha colpito'};
let films=[],view='discover',typeFilter='all',tagFilter='all',sortFilter='match',query='',editFilmId=null,detailId=null,jsonPlan=null,posterQueue=[],posterActive=false;
const posterCache=new Map();const posterTried=new Set();
try{const cache=JSON.parse(localStorage.getItem('afterframe-poster-cache')||'{}');Object.entries(cache).forEach(([k,v])=>{if(safeUrl(v))posterCache.set(k,v);});}catch{}
function palette(id){const hues=[['#7765a9','#47335e','#be92de'],['#3f6988','#25465c','#8bbad0'],['#935b7c','#4a2946','#e2a0c0'],['#747452','#3e4732','#d3c08a'],['#7a506d','#44314d','#d49bb7']];return hues[Array.from(id).reduce((a,c)=>a+c.charCodeAt(0),0)%hues.length];}
function fallback(f){const p=palette(f.id);return `<div class="poster-fallback" style="--cover-from:${p[1]};--cover-glow:${p[0]}"><small>AFTERFRAME ORIGINAL PICK</small><strong>${esc(f.title)}</strong><em>${esc(f.year)}</em></div>`;}
function posterMarkup(f,kind='card'){let src=safeUrl(f.poster)||safeUrl(posterCache.get(f.id));return `${fallback(f)}${src?`<img class="poster-image" src="${esc(src)}" alt="Copertina di ${esc(f.title)}" loading="lazy" decoding="async" onerror="this.style.display='none'" />`:''}`;}
function toast(msg,isError=false){const root=$('#toast-root'),el=document.createElement('div');el.className='toast'+(isError?' error':'');el.textContent=msg;root.append(el);setTimeout(()=>el.remove(),4000);}
function currentFilms(){let arr=films.filter(f=>view==='discover'?f.status!=='watched':view==='all'?true:view==='watchlist'?f.status!=='watched':view==='watched'?f.status==='watched':view==='favorites'?f.favorite:true);
 if(typeFilter!=='all')arr=arr.filter(f=>f.type===typeFilter);
 if(tagFilter!=='all')arr=arr.filter(f=>f.tags.some(t=>normal(t)===tagFilter));
 if(query){const q=normal(query);arr=arr.filter(f=>normal([f.title,f.genre,f.year,f.description,f.why,...f.tags].join(' ')).includes(q));}
 arr.sort((a,b)=>sortFilter==='newest'?b.year-a.year:sortFilter==='oldest'?a.year-b.year:sortFilter==='title'?a.title.localeCompare(b.title,'it'):sortFilter==='emotion'?(b.scores.emotion-a.scores.emotion)||(b.match-a.match):sortFilter==='rating'?(b.rating||0)-(a.rating||0):b.match-a.match||a.title.localeCompare(b.title,'it'));
 return arr;}
const titles={discover:['La tua prossima storia','Non classifiche generiche: affinità con quello che ti ha già emozionato.'],all:['Tutta la libreria','Tutti i titoli, con le tue valutazioni e i consigli iniziali.'],watchlist:['La tua watchlist','I titoli che devi ancora scoprire, senza spoiler.'],watched:['Le storie che hai già vissuto','Le tue reazioni, i voti e i ricordi.'],favorites:['I tuoi preferiti','Le storie a cui vuoi tornare.']};
function render(){
 const total=films.length,watched=films.filter(f=>f.status==='watched').length,wishlist=films.filter(f=>f.status!=='watched').length,cried=films.filter(f=>f.reaction==='cried').length;
 $('#stat-total').textContent=total;$('#stat-watched').textContent=watched;$('#stat-watchlist').textContent=wishlist;$('#stat-cried').textContent=cried;
 $('#count-all').textContent=total;$('#count-watchlist').textContent=wishlist;$('#count-watched').textContent=watched;$('#count-favorites').textContent=films.filter(f=>f.favorite).length||'';
 $$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $('#current-view-name').textContent={discover:'Scopri',all:'Tutta la libreria',watchlist:'Da guardare',watched:'Già visti',favorites:'Preferiti'}[view];
 $('#section-title').textContent=titles[view][0];$('#section-caption').textContent=titles[view][1];
 $('#hero').hidden=view!=='discover'||!!query;$('#hero').style.display=view==='discover'&&!query?'flex':'none';
 const arr=currentFilms();$('#results-count').textContent=`${arr.length} ${arr.length===1?'titolo':'titoli'}`;
 $$('#type-filters [data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type===typeFilter));
 const grid=$('#film-grid');grid.innerHTML=arr.map(card).join('');$('#empty-state').classList.toggle('hidden',arr.length!==0);
 refreshTagOptions(); observePosters();
}
function card(f){const top=f.status==='watched'?`<span class="poster-badge seen">${icon('check')} VISTO</span>`:`<span class="poster-badge">${icon('star')} ${esc(f.match)}% AFFINITÀ</span>`;
 return `<article class="film-card"><div class="poster-wrap" role="button" tabindex="0" data-open="${esc(f.id)}" aria-label="Apri ${esc(f.title)}">
 ${posterMarkup(f)}<span class="poster-shadow"></span>${top}<button class="card-favorite ${f.favorite?'is-fav':''}" aria-label="${f.favorite?'Rimuovi dai':'Aggiungi ai'} preferiti: ${esc(f.title)}" title="Preferiti" data-favorite="${esc(f.id)}">${icon('heart')}</button><div class="card-bottom">${f.tags.slice(0,2).map(t=>`<span class="card-theme">${esc(t)}</span>`).join('')}</div></div><div class="card-content"><div class="card-line"><button class="card-name" data-open="${esc(f.id)}">${esc(f.title)}</button><span class="card-year">${esc(f.year)}</span></div><div class="card-meta">${esc(typeNames[f.type])}<span>${esc(f.genre)}</span></div><p class="card-summary">${esc(f.why)}</p></div></article>`;}
function refreshTagOptions(){const select=$('#tag-filter'),all=[...new Set(films.flatMap(f=>f.tags.map(normal)))].sort((a,b)=>a.localeCompare(b,'it'));let html='<option value="all">Tutte le emozioni</option>';for(const tag of all)html+=`<option value="${esc(tag)}">${esc(tag.charAt(0).toUpperCase()+tag.slice(1))}</option>`;select.innerHTML=html;select.value=tagFilter;if(select.value!==tagFilter){tagFilter='all';select.value='all';}}
function setView(v){view=v;typeFilter='all';tagFilter='all';query='';$('#search').value='';$('#tag-filter').value='all';render();$('#sidebar').classList.remove('open');$('#mobile-overlay').classList.remove('open');if(window.innerWidth<941)scrollTo({top:0,behavior:'smooth'});}
async function store(next,notify){await CatalogDB.write(next);films=next;render();if(notify)toast(notify);}
async function changeFilm(id,change){const next=films.map(f=>f.id===id?{...f,...change,updatedAt:new Date().toISOString()}:f);await store(next);}
function openDialog(id){const d=$('#'+id);if(!d.open)d.showModal();}
function closeDialog(id){const d=$('#'+id);if(d.open)d.close();}
function streaming(f){const q=encodeURIComponent(f.title),search=encodeURIComponent(f.posterQuery||f.title);
 const base=[{name:'JustWatch Italia',hint:'Confronta le piattaforme',url:`https://www.justwatch.com/it/cerca?q=${search}`},{name:'Prime Video',hint:'Cerca sul catalogo',url:`https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${search}`},{name:'Netflix',hint:'Cerca sul catalogo',url:`https://www.netflix.com/search?q=${search}`}];
 if(['anime','film-anime'].includes(f.type))base.push({name:'Crunchyroll',hint:'Cerca anime',url:`https://www.crunchyroll.com/search?q=${search}`});
 if(Array.isArray(f.links))for(const l of f.links){if(l&&safeUrl(l.url)&&l.name)base.unshift({name:l.name,hint:'Link personalizzato',url:l.url});}
 return base.map(l=>`<a class="watch-link" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer"><span>${esc(l.name)} <small style="color:#88859a;font-weight:500">· ${esc(l.hint)}</small></span>${icon('external')}</a>`).join('');}
function showDetail(id){const f=films.find(x=>x.id===id);if(!f)return;detailId=id;const d=$('#detail-content'),p=palette(f.id);const scoreRows=Object.entries(scoreNames).map(([key,name])=>`<div class="score-row"><span>${name}</span><div class="score-track"><div class="score-fill" style="width:${f.scores[key]*20}%"></div></div><span class="score-number">${f.scores[key]}/5</span></div>`).join('');
 d.innerHTML=`<div class="detail-top" style="--detail-halo:${p[0]}"><div class="detail-poster" data-poster="${esc(f.id)}">${posterMarkup(f)}</div><div class="detail-text"><div class="eyebrow small-eyebrow">${esc(f.status==='watched'?'NELLA TUA COLLEZIONE':'CONSIGLIATO PER TE')}</div><h2>${esc(f.title)}</h2><div class="detail-info"><span>${esc(f.year)}</span><span>${esc(typeNames[f.type])}</span>${f.duration?`<span>${esc(f.duration)}</span>`:''}<span>${esc(f.match)}% affinità stimata</span></div><div class="detail-actions"><button class="button primary" data-action="toggle-watched" data-id="${esc(f.id)}">${icon(f.status==='watched'?'check':'eye')} ${esc(f.status==='watched'?'Segna da guardare':'Segna come visto')}</button><button class="button frosted" data-action="toggle-favorite-detail" data-id="${esc(f.id)}">${icon('heart')} ${esc(f.favorite?'Nei preferiti':'Preferito')}</button></div></div><button class="icon-btn detail-close" data-close="detail-dialog" aria-label="Chiudi">${icon('close')}</button></div>
 <div class="detail-body"><div><div class="detail-subhead">LA STORIA · SENZA SPOILER</div><p class="detail-description">${esc(f.description||'Nessuna descrizione inserita.')}</p><div class="detail-subhead">PERCHÉ POTREBBE COLPIRTI</div><div class="detail-why">${esc(f.why||'Aggiungi il tuo motivo personale.')}</div><div class="detail-tags">${f.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div>${f.warnings?`<p class="detail-warnings">Avvertenze: ${esc(f.warnings)}</p>`:''}
 <div class="reaction-panel"><label>LA TUA REAZIONE</label><div class="reaction-buttons">${Object.entries(reactNames).map(([val,name])=>`<button class="reaction-choice ${f.reaction===val?'active':''}" data-reaction="${val}" data-id="${esc(f.id)}">${esc(name)}</button>`).join('')}</div><div class="rating-line"><label for="personal-rating">Voto personale</label><input id="personal-rating" type="range" min="0" max="10" step="1" value="${f.rating===null?0:f.rating}"><output id="personal-output">${f.rating===null?'—':f.rating+'/10'}</output></div><div class="note-field"><label for="personal-notes">Note personali (anche con spoiler: visibili solo a te)</label><textarea id="personal-notes" rows="3" maxlength="3000" placeholder="Quale scena ti ha fatto emozionare?">${esc(f.notes)}</textarea></div><button class="button secondary save-personal" data-action="save-personal" data-id="${esc(f.id)}">${icon('check')} Salva voto e note</button></div></div><div><div class="detail-subhead">PROFILO EMOTIVO STIMATO</div><div class="detail-scores">${scoreRows}</div><p class="link-notice">Le intensità sono valutazioni editoriali indicative, non garanzie di commozione.</p><div class="watch-links"><div class="detail-subhead">DOVE CERCARE IL TITOLO</div>${streaming(f)}<p class="link-notice">I pulsanti aprono una ricerca esterna. La disponibilità, il noleggio e i prezzi in Italia cambiano nel tempo: verificali sul servizio.</p></div></div></div><div class="detail-bottom"><button class="button secondary" data-action="edit" data-id="${esc(f.id)}">${icon('edit')} Modifica scheda</button><button class="button secondary danger" data-action="delete" data-id="${esc(f.id)}">${icon('trash')} Elimina titolo</button></div>`;
 openDialog('detail-dialog');observePosters();}
function editSliders(scores){$('#edit-sliders').innerHTML=Object.entries(scoreNames).map(([key,label])=>`<div class="score-edit"><label for="score-${key}">${esc(label)}</label><input id="score-${key}" name="score-${key}" type="range" min="0" max="5" step="1" value="${scores[key]??0}"><output id="out-${key}">${scores[key]??0}/5</output></div>`).join('');}
function slug(t){return normal(t).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75)||'nuovo-titolo';}
function openEdit(id){const f=films.find(x=>x.id===id);editFilmId=f?f.id:null;$('#film-form').reset();$('#form-title').textContent=f?'Modifica titolo':'Aggiungi titolo';$('#edit-original-id').value=f?f.id:'';
 const form=$('#film-form');const data=f||{title:'',id:'',year:new Date().getFullYear(),type:'film',genre:'',description:'',why:'',tags:[],poster:'',posterQuery:'',duration:'',match:80,warnings:'',scores:{emotion:3,comedy:1,action:2,romance:1,tension:2}};
 for(const key of ['title','id','year','type','genre','description','why','poster','posterQuery','duration','match','warnings'])if(form.elements[key])form.elements[key].value=data[key]??'';
 form.elements.tags.value=(data.tags||[]).join(', ');editSliders(data.scores);openDialog('edit-dialog');}
function getFormFilm(){const f=$('#film-form').elements;const old=films.find(x=>x.id===editFilmId);const scores={};Object.keys(scoreNames).forEach(k=>scores[k]=Number(f['score-'+k].value));
 const obj={...(old||{}),id:f.id.value.trim(),title:f.title.value.trim(),year:Number(f.year.value),type:f.type.value,genre:f.genre.value.trim(),description:f.description.value.trim(),why:f.why.value.trim(),tags:f.tags.value.split(',').map(x=>x.trim()).filter(Boolean),poster:f.poster.value.trim(),posterQuery:f.posterQuery.value.trim(),duration:f.duration.value.trim(),match:Number(f.match.value),warnings:f.warnings.value.trim(),scores};return validateFilm(obj);}
async function saveEdit(e){e.preventDefault();try{const film=getFormFilm();if(films.some(x=>x.id===film.id&&x.id!==editFilmId))throw Error('Esiste già un titolo con questo ID.');let next;if(editFilmId){next=films.map(x=>x.id===editFilmId?film:x);if(editFilmId!==film.id&&posterCache.has(editFilmId)){posterCache.delete(editFilmId);}}else{next=[film,...films];}await store(next,'Titolo salvato nel database locale.');closeDialog('edit-dialog');if(editFilmId&&detailId===editFilmId){closeDialog('detail-dialog');showDetail(film.id);}}catch(err){toast(err.message,true);}}
async function deleteFilm(id){const f=films.find(x=>x.id===id);if(!f)return;if(!confirm(`Eliminare definitivamente "${f.title}" dalla libreria locale?`))return;try{await store(films.filter(x=>x.id!==id),'Titolo eliminato.');closeDialog('detail-dialog');}catch(e){toast(e.message,true);}}
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
const ALLOWED=new Set(['id','title','year','type','genre','description','why','tags','scores','match','status','reaction','rating','favorite','notes','poster','posterQuery','links','duration','country','warnings','featured','createdAt','updatedAt']);
function validPlainObject(o){return o&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;}
function validatePatch(obj){if(!validPlainObject(obj))throw Error('changes deve essere un oggetto.');for(const k of Object.keys(obj)){if(!ALLOWED.has(k))throw Error(`Campo non ammesso: ${k}`);if(k==='scores'){if(!validPlainObject(obj.scores))throw Error('scores deve essere un oggetto.');for(const s of Object.keys(obj.scores))if(!Object.hasOwn(scoreNames,s))throw Error('Score sconosciuto: '+s);}}}
function validateFilm(raw){validatePatch(raw);
 const defaults={genre:'',description:'',why:'',tags:[],scores:{emotion:3,comedy:1,action:2,romance:1,tension:2},match:75,status:'watchlist',reaction:'unseen',rating:null,favorite:false,notes:'',poster:'',posterQuery:'',links:[],duration:'',country:'',warnings:'',featured:false};
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
 for(const k of ['genre','description','why','notes','poster','posterQuery','duration','country','warnings'])if(typeof f[k]!=='string'||f[k].length>(k==='notes'?3000:k==='description'?900:400))throw Error(`Campo ${k} non valido o troppo lungo.`);
 if(f.poster&&!safeUrl(f.poster))throw Error('La copertina deve avere URL http o https.');
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
function tryCachedPoster(f){return safeUrl(f.poster)||safeUrl(posterCache.get(f.id));}
let observer=null;
function observePosters(){if(observer){observer.disconnect();observer=null;}const nodes=$$('[data-open] .poster-fallback, .detail-poster .poster-fallback');
 const fresh=nodes.filter(el=>{const f=films.find(x=>x.id===el.parentElement.dataset.open||x.id===el.parentElement.dataset.poster);return f&&!tryCachedPoster(f)&&!posterTried.has(f.id);});
 if(!('IntersectionObserver' in window)){fresh.slice(0,15).forEach(el=>queuePoster(el.parentElement.dataset.open||el.parentElement.dataset.poster));return;}
 observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const n=entry.target.parentElement, id=n.dataset.open||n.dataset.poster;queuePoster(id);observer.unobserve(entry.target);}}, {rootMargin:'300px'});fresh.forEach(el=>observer.observe(el));}
function queuePoster(id){if(!id||posterTried.has(id))return;posterTried.add(id);posterQueue.push(id);pumpPosters();}
async function pumpPosters(){if(posterActive)return;posterActive=true;while(posterQueue.length){const id=posterQueue.shift(),f=films.find(x=>x.id===id);if(f&&!tryCachedPoster(f)){
  try{const src=await fetchPoster(f);if(src){posterCache.set(id,src);try{localStorage.setItem('afterframe-poster-cache',JSON.stringify(Object.fromEntries(posterCache)));}catch{}
    $$(`[data-open="${CSS.escape(id)}"], [data-poster="${CSS.escape(id)}"]`).forEach(node=>{if(node.querySelector('.poster-image'))return;const image=document.createElement('img');image.className='poster-image';image.src=src;image.alt='Copertina di '+f.title;image.loading='lazy';image.decoding='async';image.onerror=()=>image.remove();node.appendChild(image);});
  }}catch{}
 }await new Promise(r=>setTimeout(r,650));}posterActive=false;}
function similarity(a,b){const x=normal(a).replace(/[^a-z0-9]/g,''),y=normal(b).replace(/[^a-z0-9]/g,'');if(x===y)return 10;if(x.includes(y)||y.includes(x))return 7;let words=normal(a).split(/\W+/).filter(w=>w.length>3);return words.filter(w=>normal(b).includes(w)).length;}
async function fetchPoster(f){const term=f.posterQuery||f.title;
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
 const reaction=e.target.closest('[data-reaction]');if(reaction){const f=films.find(x=>x.id===reaction.dataset.id);if(f)changeFilm(f.id,{reaction:reaction.dataset.reaction,status:reaction.dataset.reaction==='unseen'?'watchlist':'watched'}).then(()=>showDetail(f.id)).catch(x=>toast(x.message,true));return;}
 const open=e.target.closest('[data-open]');if(open){showDetail(open.dataset.open);return;}
 const action=e.target.closest('[data-action]');if(!action)return;const id=action.dataset.id;
 switch(action.dataset.action){case'menu':$('#sidebar').classList.toggle('open');$('#mobile-overlay').classList.toggle('open');break;
 case'close-menu':$('#sidebar').classList.remove('open');$('#mobile-overlay').classList.remove('open');break;
 case'add':openEdit();break;
 case'hero-detail':showDetail('warrior-2011');break;
 case'json':openJson();break;
 case'clear-filters':typeFilter='all';tagFilter='all';query='';$('#search').value='';render();break;
 case'edit':closeDialog('detail-dialog');openEdit(id);break;
 case'delete':deleteFilm(id).catch(x=>toast(x.message,true));break;
 case'toggle-watched':{const f=films.find(x=>x.id===id);if(f)changeFilm(id,{status:f.status==='watched'?'watchlist':'watched',reaction:f.status==='watched'?'unseen':f.reaction}).then(()=>showDetail(id)).catch(x=>toast(x.message,true));break;}
 case'toggle-favorite-detail':{const f=films.find(x=>x.id===id);if(f)changeFilm(id,{favorite:!f.favorite}).then(()=>showDetail(id)).catch(x=>toast(x.message,true));break;}
 case'save-personal':{const rating=Number($('#personal-rating').value),notes=$('#personal-notes').value;changeFilm(id,{rating:rating===0?null:rating,notes}).then(()=>{showDetail(id);toast('Voto e note salvati.');}).catch(x=>toast(x.message,true));break;}
 case'export':downloadJson(`afterframe-backup-${new Date().toISOString().slice(0,10)}.json`,{format:'afterframe-catalog',version:1,exportedAt:new Date().toISOString(),films});toast('Backup JSON esportato.');break;
 case'example':downloadJson('afterframe-import-esempio.json',example);break;
 case'copy-example':$('#json-input').value=JSON.stringify(example,null,2);preview();break;
 case'preview':preview();break;
 case'apply':applyImport();break;
 case'reset':{if(!confirm('Ripristinare il catalogo iniziale? Tutte le modifiche, voti e titoli aggiunti saranno cancellati. Esporta prima un backup.'))break;if(!confirm('Ultima conferma: vuoi davvero cancellare le modifiche locali?'))break;store(structuredClone(window.SEED_FILMS),'Catalogo iniziale ripristinato.').then(()=>{closeDialog('json-dialog');closeDialog('detail-dialog');}).catch(x=>toast(x.message,true));break;}
 }
}
async function init(){try{let old=await CatalogDB.read();if(old===undefined||old===null){old=structuredClone(window.SEED_FILMS);await CatalogDB.write(old);}if(!Array.isArray(old))throw Error('Il database contiene dati in un formato non riconosciuto.');films=old.map(validateFilm);render();
 const hw=films.find(f=>f.id==='warrior-2011');if(hw){const src=tryCachedPoster(hw);if(src)$('#hero-poster').style.backgroundImage=`linear-gradient(transparent 30%,#08071591),url("${src.replace(/["()\\]/g,'')}")`;}
 }catch(e){toast('Errore di caricamento: '+e.message,true);films=structuredClone(window.SEED_FILMS);render();}
 $('#search').addEventListener('input',e=>{query=e.target.value.trim();render();});$('#tag-filter').addEventListener('change',e=>{tagFilter=e.target.value;render();});$('#sort-filter').addEventListener('change',e=>{sortFilter=e.target.value;render();});$('#type-filters').addEventListener('click',e=>{const b=e.target.closest('[data-type]');if(b){typeFilter=b.dataset.type;render();}});
 document.addEventListener('click',onClick);document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!$$('dialog').some(d=>d.open)){e.preventDefault();$('#search').focus();}if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-open]')){e.preventDefault();showDetail(e.target.dataset.open);}});
 $('#film-form').addEventListener('submit',saveEdit);$('#edit-title').addEventListener('input',e=>{if(!editFilmId)$('#edit-id').value=slug(e.target.value);});$('#edit-sliders').addEventListener('input',e=>{if(e.target.matches('input[type=range]'))$('#out-'+e.target.id.slice(6)).textContent=e.target.value+'/5';});
 $('#detail-dialog').addEventListener('input',e=>{if(e.target.id==='personal-rating')$('#personal-output').textContent=e.target.value==='0'?'—':e.target.value+'/10';});
 $('#json-input').addEventListener('input',()=>{jsonPlan=null;$('#apply-import').disabled=true;});$('#json-file').addEventListener('change',e=>fileLoad(e.target.files[0]));const drop=$('#drop-zone');drop.addEventListener('click',()=>$('#json-file').click());drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#json-file').click();}});drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag-over');});drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag-over');fileLoad(e.dataTransfer.files[0]);});
 for(const d of $$('dialog'))d.addEventListener('click',e=>{if(e.target===d)d.close();});
}
document.addEventListener('DOMContentLoaded',init);
window.AfterframeTest={importShape,validateFilm,prepareImport,slug};
})();
