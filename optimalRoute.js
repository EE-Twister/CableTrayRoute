(function(){
    const prereqs=[
        {key:'cableSchedule',page:'cableschedule.html',label:'Cable Schedule'},
        {key:'traySchedule',page:'racewayschedule.html',label:'Raceway Schedule'}
    ];
    const missing=prereqs.filter(p=>!localStorage.getItem(p.key));
    if(missing.length){
        document.addEventListener('DOMContentLoaded',()=>{
            const notice=document.createElement('div');
            notice.style.cssText='background:#fee;border:1px solid #f99;padding:10px;margin:10px;';
            notice.innerHTML='Missing required data: '+missing.map(m=>`<a href="${m.page}">${m.label}</a>`).join(', ')+'.';
            document.body.prepend(notice);
            document.querySelectorAll('main button, aside button').forEach(btn=>btn.disabled=true);
        });
    }
})();

