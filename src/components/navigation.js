const NAV_ROUTES = [
  { href: 'index.html', label: 'Home', section: 'Home', icon: 'icons/route.svg' },
  { href: 'equipmentlist.html', label: 'Equipment List', section: 'Workflow', icon: 'icons/equipment.svg' },
  { href: 'loadlist.html', label: 'Load List', section: 'Workflow', icon: 'icons/load.svg' },
  { href: 'cableschedule.html', label: 'Cable Schedule', section: 'Workflow', icon: 'icons/cable.svg' },
  { href: 'panelschedule.html', label: 'Panel Schedule', section: 'Workflow', icon: 'icons/panel.svg' },
  { href: 'racewayschedule.html', label: 'Raceway Schedule', section: 'Workflow', icon: 'icons/raceway.svg' },
  { href: 'ductbankroute.html', label: 'Ductbank', section: 'Workflow', icon: 'icons/ductbank.svg' },
  { href: 'cabletrayfill.html', label: 'Tray Fill', section: 'Workflow', icon: 'icons/tray.svg' },
  { href: 'conduitfill.html', label: 'Conduit Fill', section: 'Workflow', icon: 'icons/conduit.svg' },
  { href: 'supportspan.html', label: 'Support Span', section: 'Workflow', icon: 'icons/toolbar/dimension.svg' },
  { href: 'seismicBracing.html', label: 'Seismic Bracing', section: 'Workflow', icon: 'icons/toolbar/validate.svg' },
  { href: 'trayhardwarebom.html', label: 'Tray Hardware BOM', section: 'Workflow', icon: 'icons/raceway.svg' },
  { href: 'clashdetect.html', label: 'Clash Detection', section: 'Workflow', icon: 'icons/toolbar/validate.svg' },
  { href: 'spoolsheets.html', label: 'Spool Sheets', section: 'Workflow', icon: 'icons/toolbar/copy.svg' },
  { href: 'optimalRoute.html', label: 'Optimal Route', section: 'Workflow', icon: 'icons/route.svg' },
  { href: 'pullcards.html', label: 'Pull Cards', section: 'Workflow', icon: 'icons/toolbar/copy.svg' },
  { href: 'costestimate.html', label: 'Cost Estimate', section: 'Workflow', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'submittal.html', label: 'Submittal Package', section: 'Workflow', icon: 'icons/toolbar/copy.svg' },
  { href: 'intlCableSize.html', label: 'Intl Cable Sizing', section: 'Studies', icon: 'icons/cable.svg' },
  { href: 'oneline.html', label: 'One-Line', section: 'Workflow', icon: 'icons/oneline.svg' },
  { href: 'tcc.html', label: 'TCC', section: 'Studies', icon: 'icons/toolbar/validate.svg' },
  { href: 'harmonics.html', label: 'Harmonics', section: 'Studies', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'motorStart.html', label: 'Motor Start', section: 'Studies', icon: 'icons/Motor.svg' },
  { href: 'loadFlow.html', label: 'Load Flow', section: 'Studies', icon: 'icons/Load.svg' },
  { href: 'shortCircuit.html', label: 'Short Circuit', section: 'Studies', icon: 'icons/components/Breaker.svg' },
  { href: 'arcFlash.html', label: 'Arc Flash', section: 'Studies', icon: 'icons/toolbar/connect.svg' },
  { href: 'groundgrid.html', label: 'Ground Grid', section: 'Studies', icon: 'icons/toolbar/validate.svg' },
  { href: 'autosize.html', label: 'Auto-Size', section: 'Studies', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'reliability.html', label: 'Reliability', section: 'Studies', icon: 'icons/toolbar/validate.svg' },
  { href: 'emf.html', label: 'EMF Analysis', section: 'Studies', icon: 'icons/toolbar/connect.svg' },
  { href: 'custom-components.html', label: 'Custom Components', section: 'Library', icon: 'icons/components/TextBox.svg' },
  { href: 'library.html', label: 'Library Manager', section: 'Library', icon: 'icons/toolbar/grid.svg' },
  { href: 'help.html', label: 'Help', section: 'Support', icon: 'icons/toolbar/validate.svg' },
  { href: 'account.html', label: 'Account', section: 'Support', icon: 'icons/toolbar/grid.svg' }
];

function currentPageName() {
  const raw = window.location.pathname.split('/').pop() || 'index.html';
  return raw || 'index.html';
}

function routeForPage(pageName) {
  return NAV_ROUTES.find(route => route.href === pageName);
}

function buildLink(route, currentRoute) {
  const link = document.createElement('a');
  link.href = route.href;

  const icon = document.createElement('img');
  icon.src = route.icon;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  icon.className = 'nav-link-icon';
  icon.loading = 'lazy';
  icon.decoding = 'async';

  const label = document.createElement('span');
  label.className = 'nav-link-label';
  label.textContent = route.label;

  link.appendChild(icon);
  link.appendChild(label);

  if (currentRoute && currentRoute.href === route.href) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function buildBreadcrumb(currentRoute) {
  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'breadcrumb-trail';
  breadcrumb.setAttribute('aria-label', 'Breadcrumb');

  const list = document.createElement('ol');
  list.className = 'breadcrumb-list';

  const homeItem = document.createElement('li');
  const homeLink = document.createElement('a');
  homeLink.href = 'index.html';
  homeLink.textContent = 'Home';
  homeItem.appendChild(homeLink);
  list.appendChild(homeItem);

  if (currentRoute && currentRoute.section !== 'Home') {
    const sectionItem = document.createElement('li');
    sectionItem.textContent = currentRoute.section;
    list.appendChild(sectionItem);
  }

  if (currentRoute && currentRoute.label !== 'Home') {
    const currentItem = document.createElement('li');
    currentItem.textContent = currentRoute.label;
    currentItem.setAttribute('aria-current', 'page');
    list.appendChild(currentItem);
  }

  breadcrumb.appendChild(list);
  return breadcrumb;
}

function mountPageTransitions() {
  // Progress bar on every page load
  const bar = document.createElement('div');
  bar.className = 'nav-progress-bar';
  document.body.insertBefore(bar, document.body.firstChild);

  // Intercept nav link clicks: fade out, then navigate
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('http')) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (link.target && link.target !== '_self') return;

    e.preventDefault();
    document.body.classList.add('page-exit');
    setTimeout(() => { window.location.href = href; }, 150);
  });
}

function buildBrand() {
  const brand = document.createElement('a');
  brand.href = 'index.html';
  brand.className = 'nav-brand';
  brand.setAttribute('aria-label', 'CableTrayRoute home');

  const logo = document.createElement('img');
  logo.src = 'icons/route.svg';
  logo.alt = '';
  logo.setAttribute('aria-hidden', 'true');
  logo.className = 'nav-brand-logo';

  const name = document.createElement('span');
  name.className = 'nav-brand-name';
  name.textContent = 'CableTrayRoute';

  brand.appendChild(logo);
  brand.appendChild(name);
  return brand;
}

function mountPersistentNavigation() {
  if (document.body?.dataset.navMounted === 'true') return;
  const topNav = document.querySelector('.top-nav');
  if (!topNav) return;

  const pageName = currentPageName();
  const currentRoute = routeForPage(pageName);

  // Insert brand if not already present
  if (!topNav.querySelector('.nav-brand')) {
    topNav.insertBefore(buildBrand(), topNav.firstChild);
  }

  const existingSettingsBtn = document.getElementById('settings-btn');
  const navLinks = document.createElement('div');
  navLinks.id = 'nav-links';
  navLinks.className = 'nav-links';
  NAV_ROUTES.forEach(route => {
    navLinks.appendChild(buildLink(route, currentRoute));
  });

  if (existingSettingsBtn) {
    navLinks.appendChild(existingSettingsBtn);
  }

  topNav.querySelectorAll('.nav-links').forEach(node => node.remove());
  topNav.appendChild(navLinks);

  // Add a search button visible only on mobile (Ctrl+K is unavailable on touch devices)
  if (!topNav.querySelector('.nav-search-btn')) {
    const searchBtn = document.createElement('button');
    searchBtn.className = 'nav-search-btn';
    searchBtn.setAttribute('aria-label', 'Search commands');
    searchBtn.setAttribute('title', 'Search commands');
    searchBtn.innerHTML = '<img src="icons/toolbar/grid-size.svg" alt="" aria-hidden="true" class="control-icon">';
    searchBtn.addEventListener('click', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    topNav.appendChild(searchBtn);
  }

  const oldBreadcrumb = document.querySelector('.breadcrumb-trail');
  if (oldBreadcrumb) {
    oldBreadcrumb.remove();
  }
  topNav.insertAdjacentElement('afterend', buildBreadcrumb(currentRoute));

  const oldSidebar = document.querySelector('.app-sidebar-nav');
  if (oldSidebar) {
    oldSidebar.remove();
  }
  const sidebar = document.createElement('aside');
  sidebar.className = 'app-sidebar-nav';
  sidebar.id = 'app-sidebar-nav';
  sidebar.setAttribute('aria-label', 'Sidebar navigation');
  const heading = document.createElement('h2');
  heading.className = 'sidebar-title';
  heading.textContent = 'Navigate';
  sidebar.appendChild(heading);

  const sections = [...new Set(NAV_ROUTES.map(r => r.section))];
  sections.forEach(section => {
    const sectionRoutes = NAV_ROUTES.filter(r => r.section === section);
    const sectionLabel = document.createElement('p');
    sectionLabel.className = 'sidebar-section-label';
    sectionLabel.textContent = section;
    sidebar.appendChild(sectionLabel);
    const sectionList = document.createElement('ul');
    sectionList.className = 'sidebar-nav-list';
    sectionRoutes.forEach(route => {
      const item = document.createElement('li');
      item.appendChild(buildLink(route, currentRoute));
      sectionList.appendChild(item);
    });
    sidebar.appendChild(sectionList);
  });

  document.body.appendChild(sidebar);
  document.body.classList.add('has-sidebar-nav');

  // Mobile sidebar toggle button
  if (!topNav.querySelector('.sidebar-toggle-btn')) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sidebar-toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Toggle sidebar navigation');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-controls', 'app-sidebar-nav');
    toggleBtn.innerHTML = '<img src="icons/toolbar/grid.svg" alt="" aria-hidden="true" class="control-icon">';
    topNav.insertBefore(toggleBtn, topNav.firstChild);
  }

  // Mobile backdrop
  if (!document.querySelector('.sidebar-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
  }

  function closeSidebar() {
    sidebar.classList.remove('sidebar-open');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (backdrop) backdrop.classList.remove('sidebar-open');
    const toggleBtn = topNav.querySelector('.sidebar-toggle-btn');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
  }

  const toggleBtn = topNav.querySelector('.sidebar-toggle-btn');
  if (toggleBtn && !toggleBtn.dataset.wired) {
    toggleBtn.dataset.wired = '1';
    toggleBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.contains('sidebar-open');
      sidebar.classList.toggle('sidebar-open', !isOpen);
      const backdrop = document.querySelector('.sidebar-backdrop');
      if (backdrop) backdrop.classList.toggle('sidebar-open', !isOpen);
      toggleBtn.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  const backdrop = document.querySelector('.sidebar-backdrop');
  if (backdrop && !backdrop.dataset.wired) {
    backdrop.dataset.wired = '1';
    backdrop.addEventListener('click', closeSidebar);
  }

  sidebar.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeSidebar);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('sidebar-open')) {
      closeSidebar();
    }
  });

  document.body.dataset.navMounted = 'true';
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    mountPersistentNavigation();
    mountPageTransitions();
  });
}

export { mountPersistentNavigation };
