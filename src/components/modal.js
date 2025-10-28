const FOCUSABLE_SELECTORS = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

function getFocusableElements(container) {
  if (!container) return [];
  const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)).filter(el => {
    return el.offsetWidth > 0 || el.offsetHeight > 0 || el === doc.activeElement;
  });
}

function trapFocus(event, container) {
  if (event.key !== 'Tab') return;
  const focusable = getFocusableElements(container);
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const active = doc?.activeElement;
  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

function defaultDoc() {
  if (typeof document === 'undefined') return null;
  return document;
}

let modalCount = 0;

export function openModal(options = {}) {
  const doc = defaultDoc();
  if (!doc) {
    return Promise.resolve(null);
  }

  const {
    title = 'Dialog',
    description = '',
    primaryText = 'OK',
    secondaryText = 'Cancel',
    closeOnEscape = true,
    closeOnBackdrop = true,
    onSubmit,
    onCancel,
    render,
    initialFocusSelector,
    variant,
    closeLabel = 'Close dialog',
    resizable = false,
    defaultWidth
  } = options;

  return new Promise(resolve => {
    const previouslyFocused = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const overlay = doc.createElement('div');
    overlay.className = 'modal component-modal';
    overlay.style.display = 'flex';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    modalCount += 1;
    const titleId = options.labelledById || `ctr-modal-title-${modalCount}`;
    overlay.setAttribute('aria-labelledby', titleId);
    let descriptionId = null;
    if (description) {
      descriptionId = options.describedById || `ctr-modal-description-${modalCount}`;
      overlay.setAttribute('aria-describedby', descriptionId);
    }

    const content = doc.createElement('div');
    content.className = 'modal-content';
    if (variant) {
      content.dataset.variant = variant;
    }
    if (resizable) {
      content.classList.add('modal-resizable');
    }
    if (defaultWidth !== null && defaultWidth !== undefined) {
      const widthValue = typeof defaultWidth === 'number' ? `${defaultWidth}px` : String(defaultWidth);
      content.style.width = widthValue;
    }

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'close-btn';
    closeBtn.setAttribute('aria-label', closeLabel);
    closeBtn.textContent = '×';

    const heading = doc.createElement('h2');
    heading.id = titleId;
    heading.className = 'modal-title';
    heading.textContent = title;

    const body = doc.createElement('div');
    body.className = 'modal-body';

    if (description) {
      const desc = doc.createElement('p');
      desc.id = descriptionId;
      desc.className = 'modal-description';
      desc.textContent = description;
      body.appendChild(desc);
    }

    const actions = doc.createElement('div');
    actions.className = 'modal-actions';

    const primaryBtn = doc.createElement('button');
    primaryBtn.type = 'button';
    primaryBtn.className = 'btn primary-btn';
    primaryBtn.textContent = primaryText;

    let secondaryBtn = null;
    if (secondaryText !== null && secondaryText !== undefined) {
      secondaryBtn = doc.createElement('button');
      secondaryBtn.type = 'button';
      secondaryBtn.className = 'btn secondary-btn';
      secondaryBtn.textContent = secondaryText;
      actions.appendChild(secondaryBtn);
    }
    actions.appendChild(primaryBtn);

    content.append(closeBtn, heading, body, actions);
    overlay.appendChild(content);

    const forms = new Set();
    let initialFocus = null;
    let closed = false;
    let backdropPointerDown = false;

    function cleanup(result, { cancelled = false } = {}) {
      if (closed) return;
      closed = true;
      overlay.removeEventListener('keydown', onKeyDown, true);
      overlay.removeEventListener('click', onOverlayClick);
      overlay.removeEventListener('pointerdown', onOverlayPointerDown);
      closeBtn.removeEventListener('click', handleCancel);
      if (secondaryBtn) secondaryBtn.removeEventListener('click', handleCancel);
      primaryBtn.removeEventListener('click', handleSubmit);
      forms.forEach(form => form.removeEventListener('submit', handleFormSubmit));
      doc.body.classList.remove('modal-open');
      overlay.remove();
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
      if (cancelled && typeof onCancel === 'function') {
        onCancel();
      }
      resolve(result);
    }

    function handleFormSubmit(event) {
      event.preventDefault();
      handleSubmit();
    }

    function handleSubmit() {
      if (typeof onSubmit === 'function') {
        const result = onSubmit(controller);
        if (result === false) {
          return;
        }
        cleanup(result);
      } else {
        cleanup(true);
      }
    }

    function handleCancel() {
      cleanup(null, { cancelled: true });
    }

    function onOverlayPointerDown(event) {
      backdropPointerDown = event.target === overlay;
    }

    function onOverlayClick(event) {
      if (!closeOnBackdrop) return;
      if (event.target === overlay && backdropPointerDown) {
        cleanup(null, { cancelled: true });
      }
      backdropPointerDown = false;
    }

    function onKeyDown(event) {
      if (closeOnEscape && event.key === 'Escape') {
        event.preventDefault();
        cleanup(null, { cancelled: true });
        return;
      }
      trapFocus(event, content);
    }

    const controller = {
      close(value) {
        cleanup(value);
      },
      cancel() {
        cleanup(null, { cancelled: true });
      },
      setPrimaryDisabled(disabled) {
        primaryBtn.disabled = !!disabled;
      },
      setPrimaryText(text) {
        if (typeof text === 'string') primaryBtn.textContent = text;
      },
      focusPrimary() {
        primaryBtn.focus();
      },
      registerForm(form) {
        if (!form || forms.has(form)) return;
        forms.add(form);
        form.addEventListener('submit', handleFormSubmit);
      },
      setInitialFocus(element) {
        if (element instanceof HTMLElement) {
          initialFocus = element;
        }
      },
      descriptionId,
      titleId,
      overlay,
      content,
      body,
      primaryBtn,
    };

    if (typeof render === 'function') {
      const renderResult = render(body, controller);
      if (!initialFocus) {
        if (renderResult instanceof HTMLElement) {
          initialFocus = renderResult;
        } else if (renderResult && renderResult.initialFocus instanceof HTMLElement) {
          initialFocus = renderResult.initialFocus;
        }
      }
    } else if (options.message) {
      const paragraph = doc.createElement('p');
      paragraph.className = 'modal-message';
      paragraph.textContent = options.message;
      body.appendChild(paragraph);
    }

    function focusInitialElement() {
      let target = initialFocus;
      if (!target && initialFocusSelector) {
        target = content.querySelector(initialFocusSelector);
      }
      if (!target) {
        const focusable = getFocusableElements(content);
        target = focusable.find(el => el !== closeBtn) || focusable[0];
      }
      if (target && typeof target.focus === 'function') {
        target.focus();
      } else {
        primaryBtn.focus();
      }
    }

    closeBtn.addEventListener('click', handleCancel);
    if (secondaryBtn) secondaryBtn.addEventListener('click', handleCancel);
    primaryBtn.addEventListener('click', handleSubmit);
    overlay.addEventListener('keydown', onKeyDown, true);
    overlay.addEventListener('pointerdown', onOverlayPointerDown);
    overlay.addEventListener('click', onOverlayClick);

    doc.body.appendChild(overlay);
    doc.body.classList.add('modal-open');
    setTimeout(focusInitialElement, 0);
  });
}

export function showAlertModal(title, message, options = {}) {
  return openModal({
    title,
    message,
    primaryText: options.confirmText || 'Close',
    secondaryText: null,
    variant: options.variant,
    closeLabel: options.closeLabel || 'Close dialog'
  });
}

export default openModal;
