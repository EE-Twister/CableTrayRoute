/**
 * Cybersecurity compliance screening for electrical-system assets.
 *
 * This is an evidence tracker and screening aid; it does not certify NERC
 * CIP or IEC 62443 compliance. Final applicability and evidence acceptance
 * remain the responsibility of the asset owner and compliance authority.
 */

const CRITICALITIES = new Set(['low', 'medium', 'high', 'bes']);
const SECURITY_LEVELS = new Set(['sl1', 'sl2', 'sl3', 'sl4']);

function text(value) {
  return String(value ?? '').trim();
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function protocolList(value) {
  return Array.from(new Set((Array.isArray(value) ? value : String(value || '').split(/[;,]/)).map(text).filter(Boolean)));
}

function check(id, standard, title, status, detail) {
  return { id, standard, title, status, detail };
}

export function normalizeCyberAsset(asset = {}) {
  const remoteAccess = asset.remoteAccess && typeof asset.remoteAccess === 'object'
    ? asset.remoteAccess
    : {};
  const criticality = text(asset.cyberCriticality || asset.criticality || 'medium').toLowerCase();
  const securityLevel = text(asset.securityLevel || asset.targetSecurityLevel || 'sl2').toLowerCase();
  return {
    id: text(asset.id || asset.tag || asset.ref || asset.name),
    name: text(asset.name || asset.description || asset.id || asset.tag),
    cyberAssetClass: text(asset.cyberAssetClass || asset.assetClass || asset.category || 'Unclassified'),
    cyberCriticality: CRITICALITIES.has(criticality) ? criticality : 'medium',
    firmwareVersion: text(asset.firmwareVersion),
    protocols: protocolList(asset.protocols),
    zone: text(asset.zone || asset.cyberZone),
    securityLevel: SECURITY_LEVELS.has(securityLevel) ? securityLevel : 'sl2',
    remoteAccess: {
      enabled: bool(remoteAccess.enabled ?? asset.remoteAccess),
      mfa: bool(remoteAccess.mfa ?? asset.remoteMfa),
      logging: bool(remoteAccess.logging ?? asset.remoteAccessLogging),
      approvedPath: bool(remoteAccess.approvedPath ?? asset.approvedRemotePath),
    },
    passwordPolicy: bool(asset.passwordPolicy),
    patchCurrent: bool(asset.patchCurrent),
    cipEvidence: text(asset.cipEvidence || asset.evidence),
  };
}

/** Seed candidate OT assets from existing electrical project records. */
export function deriveCyberAssets({ equipment = [], panels = [], oneLine = {} } = {}) {
  const candidates = [
    ...(Array.isArray(equipment) ? equipment : []),
    ...(Array.isArray(panels) ? panels : [])
  ];
  const sheets = Array.isArray(oneLine?.sheets) ? oneLine.sheets : [];
  sheets.forEach(sheet => (Array.isArray(sheet?.components) ? sheet.components : []).forEach(component => {
    if (/relay|rtu|plc|switch|breaker|meter|controller/i.test(`${component?.type} ${component?.subtype} ${component?.description}`)) candidates.push(component);
  }));
  const seen = new Set();
  return candidates.map(normalizeCyberAsset).filter(asset => {
    const key = asset.id.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function assessCyberAsset(assetInput = {}) {
  const asset = normalizeCyberAsset(assetInput);
  const checks = [];
  const critical = asset.cyberCriticality === 'high' || asset.cyberCriticality === 'bes';
  checks.push(check(
    'CIP-002', 'NERC CIP-002', 'BES Cyber System identification',
    asset.cyberAssetClass !== 'Unclassified' && asset.cipEvidence ? 'pass' : 'gap',
    asset.cyberAssetClass === 'Unclassified' ? 'Asset class and CIP applicability evidence are required.' : (asset.cipEvidence ? 'Classification evidence recorded.' : 'Record BES/CIP applicability evidence.')
  ));
  checks.push(check(
    'CIP-005', 'NERC CIP-005', 'Electronic security perimeter',
    asset.zone ? 'pass' : (critical ? 'gap' : 'review'),
    asset.zone ? `Assigned to electronic security zone ${asset.zone}.` : 'Assign an electronic security zone and identify its boundary.'
  ));
  const remote = asset.remoteAccess;
  checks.push(check(
    'CIP-007', 'NERC CIP-007', 'Remote access and system security',
    !remote.enabled || (remote.mfa && remote.logging && remote.approvedPath && asset.passwordPolicy && asset.patchCurrent) ? 'pass' : 'gap',
    !remote.enabled ? 'No remote access declared.' : 'Remote access requires MFA, logging, an approved path, password policy, and current patch status.'
  ));
  checks.push(check(
    'IEC-SR1', 'IEC 62443-3-3 SR 1', 'Identification and authentication control',
    asset.passwordPolicy ? 'pass' : 'gap',
    asset.passwordPolicy ? 'Password/account policy evidence recorded.' : 'Record password or account-management policy evidence.'
  ));
  checks.push(check(
    'IEC-SR3', 'IEC 62443-3-3 SR 3', 'System integrity',
    asset.firmwareVersion && asset.patchCurrent ? 'pass' : 'gap',
    asset.firmwareVersion && asset.patchCurrent ? `Firmware ${asset.firmwareVersion} is recorded as current.` : 'Record firmware version and patch verification.'
  ));
  checks.push(check(
    'IEC-SR5', 'IEC 62443-3-3 SR 5', 'Restricted data flow',
    asset.zone && asset.protocols.length ? 'pass' : 'gap',
    asset.zone && asset.protocols.length ? `Zone and protocol inventory recorded (${asset.protocols.join(', ')}).` : 'Record zone assignment and allowed protocol inventory.'
  ));
  const summary = checks.reduce((result, item) => {
    result[item.status] += 1;
    return result;
  }, { pass: 0, gap: 0, review: 0 });
  return { asset, checks, summary, overall: summary.gap ? 'gap' : (summary.review ? 'review' : 'pass') };
}

export function runCyberComplianceStudy(assets = [], { assessedAt = new Date().toISOString() } = {}) {
  const assessments = (Array.isArray(assets) ? assets : []).map(assessCyberAsset);
  const summary = assessments.reduce((result, assessment) => {
    result.assets += 1;
    result.pass += assessment.summary.pass;
    result.gap += assessment.summary.gap;
    result.review += assessment.summary.review;
    if (assessment.overall === 'gap') result.assetsWithGaps += 1;
    return result;
  }, { assets: 0, assetsWithGaps: 0, pass: 0, gap: 0, review: 0 });
  return {
    standard: 'NERC CIP screening and IEC 62443-3-3 evidence matrix',
    assessedAt,
    assessments,
    summary,
    overall: summary.assets === 0 ? 'missing_inputs' : (summary.gap ? 'gaps_found' : 'screening_complete'),
  };
}

export function buildCyberComplianceLetter(study = {}, { projectName = 'Project' } = {}) {
  const summary = study?.summary || {};
  return [
    `Cybersecurity Compliance Screening — ${projectName}`,
    `Assessment date: ${text(study?.assessedAt) || 'Not recorded'}`,
    `Assets reviewed: ${summary.assets || 0}; assets with gaps: ${summary.assetsWithGaps || 0}.`,
    'This appendix is a design-stage evidence matrix for NERC CIP and IEC 62443 screening. It is not a compliance certification.',
    'Outstanding gaps require asset-owner review, evidence collection, and formal applicability determination before release.'
  ].join('\n');
}
