// Cable Schedule toolbar menus (<details class="toolbar-menu">). The toolbar
// folds secondary actions into these menus, so keep them tidy: one menu open
// at a time, and Escape or a click elsewhere closes it. Clicks and keys inside
// a dialog opened from a menu item leave the menu open, so the dialog can
// return focus to that item when it closes.

const MENU_SELECTOR = 'details.toolbar-menu';
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], dialog, .modal';

export function initToolbarMenus(root) {
  const doc = root?.ownerDocument;
  // initCableSchedule re-runs after remote patches; bind the listeners once.
  if (!doc || root.dataset.toolbarMenus === 'ready') return () => {};
  root.dataset.toolbarMenus = 'ready';

  const closeMenus = keep => {
    root.querySelectorAll(`${MENU_SELECTOR}[open]`).forEach(menu => {
      if (menu !== keep) menu.open = false;
    });
  };

  // <details> fires a non-bubbling "toggle" event, so listen in the capture phase.
  const onToggle = event => {
    const menu = event.target;
    if (menu?.matches?.(MENU_SELECTOR) && menu.open) closeMenus(menu);
  };

  const onDocumentClick = event => {
    const target = event.target;
    if (target?.closest?.(DIALOG_SELECTOR)) return;
    closeMenus(target?.closest?.(MENU_SELECTOR) || null);
  };

  const onDocumentKeydown = event => {
    if (event.key !== 'Escape' || event.target?.closest?.(DIALOG_SELECTOR)) return;
    const focusedMenu = event.target?.closest?.(`${MENU_SELECTOR}[open]`);
    if (!root.querySelector(`${MENU_SELECTOR}[open]`)) return;
    closeMenus(null);
    if (focusedMenu && root.contains(focusedMenu)) focusedMenu.querySelector('summary')?.focus();
  };

  root.addEventListener('toggle', onToggle, true);
  doc.addEventListener('click', onDocumentClick);
  doc.addEventListener('keydown', onDocumentKeydown);
  return () => {
    root.removeEventListener('toggle', onToggle, true);
    doc.removeEventListener('click', onDocumentClick);
    doc.removeEventListener('keydown', onDocumentKeydown);
    delete root.dataset.toolbarMenus;
  };
}
