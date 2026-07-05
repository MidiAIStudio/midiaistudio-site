const glow=document.querySelector('.cursor-glow');
window.addEventListener('pointermove',e=>{if(!glow)return;glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px';});
const io=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')})},{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
let current=null;
document.querySelectorAll('.play').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const card=btn.closest('.audio-card');
    const audio=card.querySelector('audio');
    const src=btn.dataset.audio;
    if(current&&current!==audio){current.pause();current.currentTime=0;document.querySelectorAll('.play').forEach(b=>b.textContent='▶');}
    if(!audio.src) audio.src=src;
    if(!audio.paused){audio.pause();btn.textContent='▶';return;}
    audio.play().then(()=>{current=audio;btn.textContent='Ⅱ'}).catch(()=>alert('샘플 오디오 파일을 assets 폴더에 넣으면 재생됩니다.'));
    audio.onended=()=>btn.textContent='▶';
  });
});
