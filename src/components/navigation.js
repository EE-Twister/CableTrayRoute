const NAV_ROUTES = [
  { href: 'index.html', label: 'Home', section: 'Home', icon: 'icons/route.svg' },
  { href: 'workflowdashboard.html', label: 'Project Dashboard', section: 'Workflow', group: 'Planning', icon: 'icons/toolbar/grid.svg' },
  { href: 'scenarios.html', label: 'Scenario Comparison', section: 'Workflow', group: 'Planning', icon: 'icons/toolbar/copy.svg' },
  { href: 'equipmentlist.html', label: 'Equipment List', section: 'Workflow', group: 'Planning', icon: 'icons/equipment.svg' },
  { href: 'equipmentarrangements.html', label: 'Equipment Arrangements', section: 'Workflow', group: 'Planning', icon: 'icons/equipment.svg' },
  { href: 'loadlist.html', label: 'Load List', section: 'Workflow', group: 'Planning', icon: 'icons/load.svg' },
  { href: 'cableschedule.html', label: 'Cable Schedule', section: 'Workflow', group: 'Cable', icon: 'icons/cable.svg' },
  { href: 'panelschedule.html', label: 'Panel Schedule', section: 'Workflow', group: 'Cable', icon: 'icons/panel.svg' },
  { href: 'racewayschedule.html', label: 'Raceway Schedule', section: 'Workflow', group: 'Raceway', icon: 'icons/raceway.svg' },
  { href: 'ductbankroute.html', label: 'Ductbank', section: 'Workflow', group: 'Raceway', icon: 'icons/ductbank.svg' },
  { href: 'cabletrayfill.html', label: 'Tray Fill', section: 'Workflow', group: 'Raceway', icon: 'icons/tray.svg' },
  { href: 'conduitfill.html', label: 'Conduit Fill', section: 'Workflow', group: 'Raceway', icon: 'icons/conduit.svg' },
  { href: 'supportspan.html', label: 'Support Span', section: 'Workflow', group: 'Raceway', icon: 'icons/toolbar/dimension.svg' },
  { href: 'seismicBracing.html', label: 'Seismic Bracing', section: 'Workflow', group: 'Structural', icon: 'icons/toolbar/validate.svg' },
  { href: 'cableFaultBracing.html', label: 'Fault Cable Bracing', section: 'Workflow', group: 'Cable', icon: 'icons/toolbar/validate.svg' },
  { href: 'trayhardwarebom.html', label: 'Tray Hardware BOM', section: 'Workflow', group: 'Raceway', icon: 'icons/raceway.svg' },
  { href: 'clashdetect.html', label: 'Clash Detection', section: 'Workflow', group: 'Validation', icon: 'icons/toolbar/validate.svg' },
  { href: 'designrulechecker.html', label: 'Design Rule Checker', section: 'Workflow', group: 'Validation', icon: 'icons/toolbar/validate.svg' },
  { href: 'spoolsheets.html', label: 'Spool Sheets', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/copy.svg' },
  { href: 'windload.html', label: 'Wind Load', section: 'Workflow', group: 'Structural', icon: 'icons/toolbar/validate.svg' },
  { href: 'structuralcombinations.html', label: 'Combined Loads', section: 'Workflow', group: 'Structural', icon: 'icons/toolbar/validate.svg' },
  { href: 'seismicwindcombined.html', label: 'Seismic + Wind', section: 'Workflow', group: 'Structural', icon: 'icons/toolbar/validate.svg' },
  { href: 'loadcombinations.html', label: 'Load Combinations', section: 'Workflow', group: 'Structural', icon: 'icons/toolbar/validate.svg' },
  { href: 'optimalRoute.html', label: 'Optimal Route', section: 'Workflow', group: 'Optimization', icon: 'icons/route.svg' },
  { href: 'pullcards.html', label: 'Pull Cards', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/copy.svg' },
  { href: 'procurementschedule.html', label: 'Procurement Schedule', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/copy.svg' },
  { href: 'costestimate.html', label: 'Cost Estimate', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'submittal.html', label: 'Submittal Package', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/copy.svg' },
  { href: 'projectreport.html', label: 'Project Report', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/copy.svg' },
  { href: 'productconfig.html', label: 'Product Configurator', section: 'Workflow', group: 'Deliverables', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'intlCableSize.html', label: 'Intl Cable Sizing', section: 'Studies', group: 'Cable', icon: 'icons/cable.svg' },
  { href: 'iec60287.html', label: 'IEC 60287 Ampacity', section: 'Studies', group: 'Cable', icon: 'icons/cable.svg' },
  { href: 'oneline.html', label: 'One-Line', section: 'Workflow', group: 'Planning', icon: 'icons/oneline.svg' },
  { href: 'tcc.html', label: 'TCC', section: 'Studies', group: 'Protection', icon: 'icons/toolbar/validate.svg' },
  { href: 'harmonics.html', label: 'Harmonics', section: 'Studies', group: 'Power Quality', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'capacitorbank.html', label: 'Capacitor Bank', section: 'Studies', group: 'Power Quality', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'frequencyscan.html', label: 'Frequency Scan', section: 'Studies', group: 'Power Quality', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'voltageflicker.html', label: 'Voltage Flicker', section: 'Studies', group: 'Power Quality', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'battery.html', label: 'Battery / UPS Sizing', section: 'Studies', group: 'Equipment Sizing', icon: 'icons/components/UPS.svg' },
  { href: 'generatorsizing.html', label: 'Generator Sizing', section: 'Studies', group: 'Equipment Sizing', icon: 'icons/toolbar/validate.svg' },
  { href: 'ibr.html', label: 'IBR Modeling (PV/BESS)', section: 'Studies', group: 'Renewable', icon: 'icons/toolbar/validate.svg' },
  { href: 'derinterconnect.html', label: 'DER Interconnection', section: 'Studies', group: 'Renewable', icon: 'icons/toolbar/validate.svg' },
  { href: 'motorStart.html', label: 'Motor Start', section: 'Studies', group: 'Motor', icon: 'icons/Motor.svg' },
  { href: 'loadFlow.html', label: 'Load Flow', section: 'Studies', group: 'Power System', icon: 'icons/Load.svg' },
  { href: 'shortCircuit.html', label: 'Short Circuit', section: 'Studies', group: 'Protection', icon: 'icons/components/Breaker.svg' },
  { href: 'arcFlash.html', label: 'Arc Flash', section: 'Studies', group: 'Protection', icon: 'icons/toolbar/connect.svg' },
  { href: 'dcshortcircuit.html', label: 'DC Short-Circuit & Arc Flash', section: 'Studies', group: 'Protection', icon: 'icons/components/Breaker.svg' },
  { href: 'differentialprotection.html', label: 'Differential Protection (87)', section: 'Studies', group: 'Protection', icon: 'icons/components/Breaker.svg' },
  { href: 'groundgrid.html', label: 'Ground Grid', section: 'Studies', group: 'Grounding', icon: 'icons/toolbar/validate.svg' },
  { href: 'cathodicprotection.html', label: 'Cathodic Protection', section: 'Studies', group: 'Corrosion Control', icon: 'icons/toolbar/validate.svg' },
  { href: 'dissimilarmetals.html', label: 'Dissimilar Metals', section: 'Studies', group: 'Corrosion Control', icon: 'icons/toolbar/validate.svg' },
  { href: 'autosize.html', label: 'Auto-Size', section: 'Studies', group: 'Cable', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'heattracesizing.html', label: 'Heat Trace Sizing', section: 'Studies', group: 'Equipment Sizing', icon: 'icons/toolbar/grid-size.svg' },
  { href: 'reliability.html', label: 'Reliability', section: 'Studies', group: 'Power System', icon: 'icons/toolbar/validate.svg' },
  { href: 'emf.html', label: 'EMF Analysis', section: 'Studies', group: 'Power System', icon: 'icons/toolbar/connect.svg' },
  { href: 'transientstability.html', label: 'Transient Stability', section: 'Studies', group: 'Power System', icon: 'icons/toolbar/validate.svg' },
  { href: 'contingency.html', label: 'N-1 Contingency', section: 'Studies', group: 'Power System', icon: 'icons/toolbar/validate.svg' },
  { href: 'voltagedropstudy.html', label: 'Voltage Drop', section: 'Studies', group: 'Cable', icon: 'icons/cable.svg' },
  { href: 'custom-components.html', label: 'Custom Components', section: 'Library', icon: 'icons/components/TextBox.svg' },
  { href: 'library.html', label: 'Library Manager', section: 'Library', icon: 'icons/toolbar/grid.svg' },
  { href: 'fieldview.html', label: 'Field View', section: 'Support', icon: 'icons/toolbar/copy.svg' },
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

function buildDropdown(section, routes, currentRoute) {
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-dropdown';

  const trigger = document.createElement('button');
  trigger.className = 'nav-dropdown-trigger';
  trigger.type = 'button';
  trigger.textContent = section;
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');

  if (currentRoute && currentRoute.section === section) {
    trigger.classList.add('active');
  }

  const menu = document.createElement('ul');
  menu.className = 'nav-dropdown-menu';
  menu.setAttribute('role', 'menu');
  const groupedRoutes = routes.reduce((acc, route) => {
    const key = route.group || 'General';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(route);
    return acc;
  }, {});
  const groupNames = Object.keys(groupedRoutes);
  const sectionGroupOrder = {
    Workflow: ['Planning', 'Raceway', 'Cable', 'Structural', 'Validation', 'Optimization', 'Deliverables'],
    Studies: ['Grounding', 'Corrosion Control', 'Cable', 'Protection', 'Power System', 'Power Quality', 'Equipment Sizing', 'Motor', 'Renewable']
  };
  const orderedGroupNames = [
    ...(sectionGroupOrder[section] || []).filter(groupName => groupNames.includes(groupName)),
    ...groupNames.filter(groupName => !(sectionGroupOrder[section] || []).includes(groupName))
  ];
  const hasGroups = groupNames.length > 1;
  if (!hasGroups && routes.length >= 12) {
    menu.dataset.cols = '2';
  }

  orderedGroupNames.forEach((groupName) => {
    if (hasGroups) {
      const heading = document.createElement('li');
      heading.className = 'nav-dropdown-group-heading';
      heading.textContent = groupName;
      heading.setAttribute('role', 'presentation');
      menu.appendChild(heading);
    }
    groupedRoutes[groupName].forEach(route => {
      const item = document.createElement('li');
      item.setAttribute('role', 'none');
      const link = buildLink(route, currentRoute);
      link.setAttribute('role', 'menuitem');
      item.appendChild(link);
      menu.appendChild(item);
    });
  });

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrapper.classList.contains('open');
    document.querySelectorAll('.nav-dropdown.open').forEach(d => {
      if (d !== wrapper) {
        d.classList.remove('open');
        d.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });
    wrapper.classList.toggle('open', !isOpen);
    trigger.setAttribute('aria-expanded', String(!isOpen));
  });

  return wrapper;
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

  // Ensure the primary nav landmark is labelled for WCAG 2.4.1 SC
  if (!topNav.getAttribute('aria-label')) {
    topNav.setAttribute('aria-label', 'Primary');
  }

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
  const navSections = [...new Set(NAV_ROUTES.map(r => r.section))];
  navSections.forEach(section => {
    const sectionRoutes = NAV_ROUTES.filter(r => r.section === section);
    if (section === 'Home') {
      navLinks.appendChild(buildLink(sectionRoutes[0], currentRoute));
    } else {
      navLinks.appendChild(buildDropdown(section, sectionRoutes, currentRoute));
    }
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

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-dropdown.open').forEach(d => {
      d.classList.remove('open');
      d.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
    });
  });

  // Close dropdowns on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.nav-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.querySelector('.nav-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
      });
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
