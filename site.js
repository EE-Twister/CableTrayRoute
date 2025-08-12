const FOCUSABLE="a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";

function trapFocus(e,container){
  if(e.key!=='Tab')return;
  const focusables=container.querySelectorAll(FOCUSABLE);
  if(!focusables.length)return;
  const first=focusables[0];
  const last=focusables[focusables.length-1];
  if(e.shiftKey&&document.activeElement===first){
    e.preventDefault();
    last.focus();
  }else if(!e.shiftKey&&document.activeElement===last){
    e.preventDefault();
    first.focus();
  }
}

function initSettings(){
  const settingsBtn=document.getElementById('settings-btn');
  const settingsMenu=document.getElementById('settings-menu');
  if(settingsBtn&&settingsMenu){
    settingsMenu.setAttribute('role','dialog');
    settingsMenu.setAttribute('aria-modal','true');
    settingsMenu.setAttribute('aria-hidden','true');
    let open=false;

    const handleKey=e=>{
      if(e.key==='Escape')close();
      else trapFocus(e,settingsMenu);
    };

    const openMenu=()=>{
      open=true;
      settingsMenu.style.display='flex';
      settingsMenu.setAttribute('aria-hidden','false');
      settingsBtn.setAttribute('aria-expanded','true');
      document.addEventListener('keydown',handleKey);
      const focusables=settingsMenu.querySelectorAll(FOCUSABLE);
      if(focusables.length)focusables[0].focus();
    };

    const close=()=>{
      if(!open)return;
      open=false;
      settingsMenu.style.display='none';
      settingsMenu.setAttribute('aria-hidden','true');
      settingsBtn.setAttribute('aria-expanded','false');
      document.removeEventListener('keydown',handleKey);
      settingsBtn.focus();
    };

    settingsBtn.addEventListener('click',()=>{
      open?close():openMenu();
    });

    document.addEventListener('click',e=>{
      if(open&&!settingsMenu.contains(e.target)&&e.target!==settingsBtn){
        close();
      }
    });
  }
}

function initDarkMode(){
  const darkToggle=document.getElementById('dark-toggle');
  const session=JSON.parse(localStorage.getItem('ctrSession')||'{}');
  if(session.darkMode===undefined){
    const prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
    session.darkMode=prefersDark;
    localStorage.setItem('ctrSession',JSON.stringify(session));
  }
  document.body.classList.toggle('dark-mode',session.darkMode);
  if(darkToggle) darkToggle.checked=!!session.darkMode;
  if(darkToggle){
    darkToggle.addEventListener('change',()=>{
      document.body.classList.toggle('dark-mode',darkToggle.checked);
      session.darkMode=darkToggle.checked;
      localStorage.setItem('ctrSession',JSON.stringify(session));
      if(typeof window.saveSession==='function') window.saveSession();
      if(typeof window.saveDuctbankSession==='function') window.saveDuctbankSession();
    });
  }
  window.addEventListener('storage',e=>{
    if(e.key==='ctrSession'){
      try{
        const data=JSON.parse(e.newValue);
        document.body.classList.toggle('dark-mode',data&&data.darkMode);
        if(darkToggle) darkToggle.checked=!!(data&&data.darkMode);
      }catch{}
    }
  });
}

function initHelpModal(btnId='help-btn',modalId='help-modal',closeId){
  const btn=document.getElementById(btnId);
  const modal=document.getElementById(modalId);
  const closeBtn=closeId?document.getElementById(closeId):(modal?modal.querySelector('.close-btn'):null);
  if(btn&&modal&&closeBtn){
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-hidden','true');

    const handleKey=e=>{
      if(e.key==='Escape')close();
      else trapFocus(e,modal);
    };

    const open=()=>{
      modal.style.display='flex';
      modal.setAttribute('aria-hidden','false');
      btn.setAttribute('aria-expanded','true');
      document.addEventListener('keydown',handleKey);
      const focusables=modal.querySelectorAll(FOCUSABLE);
      if(focusables.length)focusables[0].focus();
    };
    const close=()=>{
      modal.style.display='none';
      modal.setAttribute('aria-hidden','true');
      btn.setAttribute('aria-expanded','false');
      document.removeEventListener('keydown',handleKey);
      btn.focus();
    };
    btn.addEventListener('click',open);
    closeBtn.addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
  }
}

function initNavToggle(){
  const nav=document.querySelector('.top-nav');
  if(!nav) return;
  const toggle=nav.querySelector('.nav-toggle');
  if(!toggle) return;
  toggle.addEventListener('click',()=>{
    nav.classList.toggle('open');
  });
}

function checkPrereqs(prereqs=[]){
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
}

window.initSettings=initSettings;
window.initDarkMode=initDarkMode;
window.initHelpModal=initHelpModal;
window.initNavToggle=initNavToggle;
window.checkPrereqs=checkPrereqs;

// enable arrow key navigation between table rows
document.addEventListener('keydown',e=>{
  const selector='table input, table select, table button';
  if(!e.target.matches(selector)) return;
  const key=e.key;
  if(key!=='ArrowUp'&&key!=='ArrowDown'&&key!=='Enter') return;
  const cell=e.target.closest('td');
  if(!cell) return;
  const row=cell.parentElement;
  const index=Array.prototype.indexOf.call(row.children,cell);
  const targetRow=key==='ArrowUp'?row.previousElementSibling:row.nextElementSibling;
  if(targetRow){
    const focusable=targetRow.children[index].querySelector('input,select,button');
    if(focusable){
      e.preventDefault();
      focusable.focus();
      if(typeof focusable.select==='function') focusable.select();
    }
  }
});
