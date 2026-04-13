// src/copilot.js
import { openModal } from './components/modal.js';

let panel = null;
let isOpen = false;

function getCopilotEndpoint() {
  const metaEndpoint = document.querySelector('meta[name="copilot-endpoint"]')?.content?.trim();
  if (metaEndpoint) return metaEndpoint;
  if (typeof window !== 'undefined' && typeof window.__COPILOT_API_URL__ === 'string' && window.__COPILOT_API_URL__.trim()) {
    return window.__COPILOT_API_URL__.trim();
  }
  if (window.location.hostname.endsWith('github.io')) {
    return null;
  }
  return '/api/copilot';
}

function getProjectData() {
  try {
    const cables = JSON.parse(localStorage.getItem('cableSchedule') || '[]');
    const trays = JSON.parse(localStorage.getItem('traySchedule') || '[]');
    return { cables: cables.slice(0, 200), trays: trays.slice(0, 100) };
  } catch {
    return {};
  }
}

function createPanel() {
  const el = document.createElement('div');
  el.id = 'copilot-panel';
  el.className = 'copilot-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'AI Copilot');
  el.innerHTML = `
    <div class="copilot-header">
      <span class="copilot-title">AI Copilot</span>
      <button class="copilot-close" aria-label="Close AI Copilot">&times;</button>
    </div>
    <div class="copilot-messages" id="copilot-messages" aria-live="polite"></div>
    <div class="copilot-input-row">
      <input type="text" class="copilot-input" id="copilot-input"
             placeholder="Ask about your project..." maxlength="500"
             aria-label="Ask AI Copilot a question" />
      <button class="copilot-send" id="copilot-send">Ask</button>
    </div>
  `;
  return el;
}

function appendMessage(text, role) {
  const messages = document.getElementById('copilot-messages');
  if (!messages) return;
  const div = document.createElement('div');
  div.className = `copilot-msg copilot-msg--${role}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

async function submitQuery(query) {
  if (!query.trim()) return;
  appendMessage(query, 'user');
  document.getElementById('copilot-input').value = '';
  document.getElementById('copilot-send').disabled = true;

  try {
    const endpoint = getCopilotEndpoint();
    if (!endpoint) {
      appendMessage('Copilot API is not configured for this site. Set a <meta name="copilot-endpoint" content="https://your-server/api/copilot"> tag or window.__COPILOT_API_URL__.', 'error');
      return;
    }
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrf = csrfMeta ? csrfMeta.content : '';
    const isSameOrigin = endpoint.startsWith('/') || endpoint.startsWith(window.location.origin);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(isSameOrigin ? { 'x-csrf-token': csrf } : {})
      },
      credentials: isSameOrigin ? 'include' : 'omit',
      body: JSON.stringify({ query: query.trim(), projectData: getProjectData() })
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const { answer } = await res.json();
    appendMessage(answer, 'assistant');
  } catch (err) {
    appendMessage('Error: ' + (err.message || 'Request failed'), 'error');
  } finally {
    document.getElementById('copilot-send').disabled = false;
    document.getElementById('copilot-input').focus();
  }
}

export function mountCopilot() {
  // Floating trigger button
  const btn = document.createElement('button');
  btn.id = 'copilot-trigger';
  btn.className = 'copilot-trigger';
  btn.setAttribute('aria-label', 'Open AI Copilot');
  btn.setAttribute('title', 'AI Copilot');
  btn.textContent = '✦';
  document.body.appendChild(btn);

  panel = createPanel();
  panel.style.display = 'none';
  document.body.appendChild(panel);

  btn.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) document.getElementById('copilot-input')?.focus();
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  panel.querySelector('.copilot-close').addEventListener('click', () => {
    isOpen = false;
    panel.style.display = 'none';
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  });

  document.getElementById('copilot-send').addEventListener('click', () => {
    submitQuery(document.getElementById('copilot-input').value);
  });

  document.getElementById('copilot-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitQuery(e.target.value);
  });
}
