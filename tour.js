const steps = [
  {
    selector: '#palette',
    message: 'Use the palette to add components to the diagram.'
  },
  {
    selector: '#diagram',
    message: 'Drag components onto the canvas and connect them.'
  },
  {
    selector: '#prop-modal',
    message: 'Edit component properties in this dialog.'
  }
];

let currentStep = 0;

const overlay = document.createElement('div');
overlay.id = 'tour-overlay';
overlay.style.position = 'fixed';
overlay.style.top = '0';
overlay.style.left = '0';
overlay.style.width = '100%';
overlay.style.height = '100%';
overlay.style.background = 'rgba(0,0,0,0.5)';
overlay.style.display = 'none';
overlay.style.zIndex = '1000';
overlay.setAttribute('aria-hidden', 'true');

document.body.appendChild(overlay);

const tooltip = document.createElement('div');
tooltip.id = 'tour-tooltip';
tooltip.setAttribute('role', 'dialog');
tooltip.setAttribute('aria-modal', 'false');
tooltip.setAttribute('aria-labelledby', 'tour-step-counter');
tooltip.setAttribute('aria-live', 'polite');
tooltip.style.position = 'absolute';
tooltip.style.background = '#fff';
tooltip.style.padding = '0.75em 1em';
tooltip.style.borderRadius = '4px';
tooltip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
tooltip.style.maxWidth = '280px';
tooltip.style.fontSize = '0.9rem';
tooltip.style.display = 'flex';
tooltip.style.flexDirection = 'column';
tooltip.style.gap = '0.5em';

const stepCounter = document.createElement('span');
stepCounter.id = 'tour-step-counter';
stepCounter.style.fontSize = '0.75rem';
stepCounter.style.color = '#6c757d';
stepCounter.style.fontWeight = '600';

const messageEl = document.createElement('p');
messageEl.id = 'tour-message';
messageEl.style.margin = '0';

const btnRow = document.createElement('div');
btnRow.style.display = 'flex';
btnRow.style.gap = '0.5em';
btnRow.style.justifyContent = 'flex-end';
btnRow.style.marginTop = '0.25em';

const skipBtn = document.createElement('button');
skipBtn.textContent = 'Skip tour';
skipBtn.style.fontSize = '0.8rem';
skipBtn.style.background = 'none';
skipBtn.style.border = 'none';
skipBtn.style.cursor = 'pointer';
skipBtn.style.color = '#6c757d';
skipBtn.style.padding = '0.2em 0.4em';

const nextBtn = document.createElement('button');
nextBtn.style.fontSize = '0.85rem';
nextBtn.style.background = '#0b3954';
nextBtn.style.color = '#fff';
nextBtn.style.border = 'none';
nextBtn.style.borderRadius = '3px';
nextBtn.style.padding = '0.3em 0.8em';
nextBtn.style.cursor = 'pointer';

btnRow.append(skipBtn, nextBtn);
tooltip.append(stepCounter, messageEl, btnRow);
overlay.appendChild(tooltip);

const style = document.createElement('style');
style.textContent = `.tour-highlight{position:relative;z-index:1001;box-shadow:0 0 0 4px #ffeb3b;border-radius:4px;}`;
document.head.appendChild(style);

function clearHighlight() {
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
}

function showStep(index) {
  if (index >= steps.length) {
    end();
    return;
  }
  const step = steps[index];
  const el = document.querySelector(step.selector);

  stepCounter.textContent = `Step ${index + 1} of ${steps.length}`;
  messageEl.textContent = step.message;
  nextBtn.textContent = index === steps.length - 1 ? 'Done' : 'Next';
  nextBtn.setAttribute('aria-label', index === steps.length - 1 ? 'Finish tour' : 'Next step');

  clearHighlight();
  overlay.style.display = 'block';
  overlay.setAttribute('aria-hidden', 'false');

  if (el) {
    const rect = el.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + window.scrollY + 10}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    el.classList.add('tour-highlight');
  } else {
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
  }

  nextBtn.focus();
}

function start() {
  currentStep = 0;
  showStep(0);
}

function end() {
  clearHighlight();
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
}

nextBtn.addEventListener('click', () => {
  currentStep++;
  showStep(currentStep);
});

skipBtn.addEventListener('click', () => {
  end();
});

overlay.addEventListener('click', event => {
  if (event.target === overlay) {
    end();
  }
});

document.addEventListener('keydown', event => {
  if (overlay.style.display === 'none') return;
  if (event.key === 'Escape') {
    event.preventDefault();
    end();
  } else if (event.key === 'ArrowRight' || event.key === ' ') {
    event.preventDefault();
    currentStep++;
    showStep(currentStep);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    if (currentStep > 0) {
      currentStep--;
      showStep(currentStep);
    }
  }
});

export { start };
