function initSettings(){
  const settingsBtn=document.getElementById('settings-btn');
  const settingsMenu=document.getElementById('settings-menu');
  if(settingsBtn&&settingsMenu){
    settingsBtn.addEventListener('click',()=>{
      const expanded=settingsMenu.style.display==='flex';
      settingsMenu.style.display=expanded?'none':'flex';
      settingsBtn.setAttribute('aria-expanded',String(!expanded));
    });
    document.addEventListener('click',e=>{
      if(!settingsMenu.contains(e.target)&&e.target!==settingsBtn){
        settingsMenu.style.display='none';
        settingsBtn.setAttribute('aria-expanded','false');
      }
    });
  }
}

function initDarkMode(){
  const darkToggle=document.getElementById('dark-toggle');
  const session=JSON.parse(localStorage.getItem('ctrSession')||'{}');
  if(session.darkMode){
    document.body.classList.add('dark-mode');
    if(darkToggle) darkToggle.checked=true;
  }
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
    const open=()=>{
      modal.style.display='flex';
      modal.setAttribute('aria-hidden','false');
      btn.setAttribute('aria-expanded','true');
      closeBtn.focus();
    };
    const close=()=>{
      modal.style.display='none';
      modal.setAttribute('aria-hidden','true');
      btn.setAttribute('aria-expanded','false');
    };
    btn.addEventListener('click',open);
    closeBtn.addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
  }
}

window.initSettings=initSettings;
window.initDarkMode=initDarkMode;
window.initHelpModal=initHelpModal;
