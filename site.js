(function(){
  function getSession(){
    try{
      return JSON.parse(localStorage.getItem('ctrSession')) || {};
    }catch(e){
      return {};
    }
  }
  function saveSession(sess){
    localStorage.setItem('ctrSession', JSON.stringify(sess));
  }
  function initSettings(){
    const settingsBtn = document.getElementById('settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const darkToggle = document.getElementById('dark-toggle');
    const session = getSession();
    if(session.darkMode){
      document.body.classList.add('dark-mode');
      if(darkToggle) darkToggle.checked = true;
    }
    if(settingsBtn && settingsMenu){
      settingsBtn.addEventListener('click', () => {
        const expanded = settingsMenu.style.display === 'flex';
        settingsMenu.style.display = expanded ? 'none' : 'flex';
        settingsBtn.setAttribute('aria-expanded', String(!expanded));
      });
      document.addEventListener('click', e => {
        if(!settingsMenu.contains(e.target) && e.target !== settingsBtn){
          settingsMenu.style.display = 'none';
          settingsBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }
    if(darkToggle){
      darkToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode', darkToggle.checked);
        const sess = getSession();
        sess.darkMode = darkToggle.checked;
        saveSession(sess);
      });
    }
    window.addEventListener('storage', e => {
      if(e.key === 'ctrSession'){
        try{
          const data = JSON.parse(e.newValue);
          const enabled = data && data.darkMode;
          document.body.classList.toggle('dark-mode', !!enabled);
          if(darkToggle) darkToggle.checked = !!enabled;
        }catch{}
      }
    });
  }
  function initHelp(){
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeHelpBtn = document.getElementById('close-help-btn');
    if(!helpBtn || !helpModal || !closeHelpBtn) return;
    const open = () => {
      helpModal.style.display = 'flex';
      helpModal.setAttribute('aria-hidden','false');
      helpBtn.setAttribute('aria-expanded','true');
      closeHelpBtn.focus();
    };
    const close = () => {
      helpModal.style.display = 'none';
      helpModal.setAttribute('aria-hidden','true');
      helpBtn.setAttribute('aria-expanded','false');
    };
    helpBtn.addEventListener('click', open);
    closeHelpBtn.addEventListener('click', close);
    helpModal.addEventListener('click', e => { if(e.target === helpModal) close(); });
  }
  function initSite(){
    initSettings();
    initHelp();
  }
  window.initSite = initSite;
  window.initSettings = initSettings;
  window.initHelp = initHelp;
  window.getCtrSession = getSession;
  window.saveCtrSession = saveSession;
})();
