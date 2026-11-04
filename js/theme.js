/* Persistent Emoteca appearance. No network, no account dependency. */
(function(){
 'use strict';
 const key='emoteca-color-theme';
 const root=document.documentElement;
 function apply(theme){
   const value=theme==='light'?'light':'dark';
   root.dataset.theme=value;
   try{localStorage.setItem(key,value);}catch{}
   document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
     value==='dark'?'#0c1115':'#f6f5ef');
   document.querySelectorAll('[data-theme-choice]').forEach(b=>{
     const active=b.dataset.themeChoice===value;
     b.setAttribute('aria-pressed',String(active));
     b.classList.toggle('active',active);
   });
 }
 document.addEventListener('click',event=>{
   const button=event.target.closest('[data-theme-choice]');
   if(button)apply(button.dataset.themeChoice);
 });
 document.addEventListener('DOMContentLoaded',()=>apply(root.dataset.theme));
 window.EmotecaAppearance={apply,current:()=>root.dataset.theme};
})();
