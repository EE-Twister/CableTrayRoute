import './workflowStatus.js';
import { initSettings, initDarkMode, initCompactMode, initHelpModal, initNavToggle } from '../site.js';
import './mccLineupPage.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
});
