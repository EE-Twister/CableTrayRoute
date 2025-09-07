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

document.body.appendChild(overlay);

const tooltip = document.createElement('div');
tooltip.id = 'tour-tooltip';
tooltip.style.position = 'absolute';
tooltip.style.background = '#fff';
tooltip.style.padding = '0.5em 1em';
tooltip.style.borderRadius = '4px';
tooltip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
tooltip.style.maxWidth = '250px';
tooltip.style.fontSize = '0.9rem';

overlay.appendChild(tooltip);

const style = document.createElement('style');
style.textContent = `.tour-highlight{position:relative;z-index:1001;box-shadow:0 0 0 4px #ffeb3b;border-radius:4px;}`;
document.head.appendChild(style);

function showStep(index){
  if(index >= steps.length){
    end();
    return;
  }
  const step = steps[index];
  const el = document.querySelector(step.selector);
  overlay.style.display = 'block';
  tooltip.textContent = step.message;
  if(el){
    const rect = el.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + 10}px`;
    tooltip.style.left = `${rect.left}px`;
    el.classList.add('tour-highlight');
  }else{
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
  }
  overlay.onclick = () => {
    if(el){
      el.classList.remove('tour-highlight');
    }
    currentStep++;
    showStep(currentStep);
  };
}

function start(){
  currentStep = 0;
  showStep(0);
}

function end(){
  overlay.style.display = 'none';
}

export { start };
