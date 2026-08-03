export const ROUTE_STARTUP_CONTRACTS = Object.freeze({
  'shortCircuit.html': Object.freeze({ maxReadyMs: 1500, maxCatalogRequests: 0, maxShardRequests: 0 }),
  'iec60909.html': Object.freeze({ maxReadyMs: 1500, maxCatalogRequests: 0, maxShardRequests: 0 }),
  'arcFlash.html': Object.freeze({ maxReadyMs: 1500, maxCatalogRequests: 0, maxShardRequests: 0 }),
  'library.html': Object.freeze({ maxReadyMs: 2500, maxCatalogRequests: 1, maxShardRequests: 0 }),
});

const MONOLITH_PATTERNS = Object.freeze([
  '/data/protectiveDevices.json',
  '/data/protectiveDeviceCalculations.mjs',
]);

function normalizeRequestPath(url) {
  try {
    return new URL(url).pathname.replace(/\\/g, '/');
  } catch {
    return String(url || '').replace(/\\/g, '/');
  }
}

export function evaluateRouteStartupProfile(profile, contracts = ROUTE_STARTUP_CONTRACTS) {
  const contract = contracts[profile?.route];
  if (!contract) {
    return { route: profile?.route || '', passed: false, failures: ['No route startup contract is defined.'] };
  }

  const requestPaths = (profile.requests || []).map(normalizeRequestPath);
  const catalogRequests = requestPaths.filter(path => (
    path.includes('/data/protectiveDeviceIndex.json')
    || path.includes('/data/protectiveDeviceCatalog/')
    || MONOLITH_PATTERNS.some(pattern => path.includes(pattern))
  ));
  const shardRequests = requestPaths.filter(path => path.includes('/data/protectiveDeviceCatalog/'));
  const monolithRequests = requestPaths.filter(path => MONOLITH_PATTERNS.some(pattern => path.includes(pattern)));
  const failures = [];

  if (!Number.isFinite(Number(profile.readyMs)) || Number(profile.readyMs) > contract.maxReadyMs) {
    failures.push(`ready time ${Number(profile.readyMs).toFixed(1)}ms exceeds ${contract.maxReadyMs}ms`);
  }
  if (catalogRequests.length > contract.maxCatalogRequests) {
    failures.push(`${catalogRequests.length} catalog startup requests exceed ${contract.maxCatalogRequests}`);
  }
  if (shardRequests.length > contract.maxShardRequests) {
    failures.push(`${shardRequests.length} shard startup requests exceed ${contract.maxShardRequests}`);
  }
  if (monolithRequests.length) {
    failures.push(`forbidden monolithic catalog requested: ${monolithRequests.join(', ')}`);
  }

  return {
    route: profile.route,
    readyMs: Number(profile.readyMs),
    catalogRequestCount: catalogRequests.length,
    shardRequestCount: shardRequests.length,
    passed: failures.length === 0,
    failures,
  };
}

export function evaluateRouteStartupProfiles(profiles, contracts = ROUTE_STARTUP_CONTRACTS) {
  return Object.keys(contracts).map(route => {
    const profile = (profiles || []).find(candidate => candidate.route === route);
    return profile
      ? evaluateRouteStartupProfile(profile, contracts)
      : { route, passed: false, failures: [`Required route startup profile ${route} was not recorded.`] };
  });
}
