(function(){
  const KEY='sb_theme';
  const get=()=>localStorage.getItem(KEY)||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  const apply=t=>{document.documentElement.setAttribute('data-theme',t);localStorage.setItem(KEY,t)};
  apply(get());
  document.addEventListener('DOMContentLoaded',()=>document.querySelectorAll('#themeToggle')
    .forEach(b=>b.addEventListener('click',()=>apply(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'))));
})();
