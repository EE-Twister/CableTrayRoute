export function normalizeRotation(angle) {
  if (!Number.isFinite(angle)) return 0;
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function defaultRotationForType() {
  return 0;
}

export function visualSizeForRotation(width, height, rotation) {
  const normalized = normalizeRotation(rotation);
  return normalized === 90 || normalized === 270
    ? { width: height, height: width }
    : { width, height };
}

export function categoryForType(type) {
  if (type === 'bus') return 'bus';
  if (['motor', 'motor_load', 'static_load'].includes(type)) return 'load';
  if (type === 'cable') return 'cable';
  if (['breaker', 'fuse', 'recloser', 'relay', 'contactor', 'switch'].includes(type)) return 'protection';
  if (['utility_source', 'generator', 'pv_inverter', 'pv_array', 'bess_inverter', 'battery'].includes(type)) return 'sources';
  if (type === 'sheet_link') return 'links';
  if (type === 'annotation') return 'annotations';
  return 'equipment';
}

export function getDefaultPorts(type, subtype, width = 80, height = 40) {
  if (type === 'transformer' && subtype === 'three_winding') {
    return [
      { x: width / 2, y: 0 },
      { x: width * 0.3, y: height },
      { x: width * 0.7, y: height }
    ];
  }
  return [{ x: width / 2, y: 0 }, { x: width / 2, y: height }];
}

export function getIndustrySymbolProfile(component, meta = {}) {
  const type = String(meta?.type || component?.type || '').toLowerCase();
  const subtype = String(meta?.subtype || component?.subtype || '').toLowerCase();
  const label = String(meta?.label || component?.label || '').toLowerCase();
  const signature = `${type} ${subtype} ${label}`;
  if (type === 'utility_source' || signature.includes('utility')) return 'utility';
  if (type === 'bus') return 'bus';
  if (type === 'busway') return 'busway';
  if (type === 'generator') return 'generator';
  if (type === 'transformer') return subtype === 'three_winding' ? 'transformer3' : 'transformer';
  if (subtype === 'ats' || subtype === 'double_throw') return 'transferSwitch';
  if (type === 'ups' || signature.includes('ups')) return 'ups';
  if (type === 'panel' || signature.includes('panel')) return 'panel';
  if (['vfd', 'soft_starter', 'motor_starter', 'combination_starter'].includes(type) || signature.includes('vfd') || signature.includes('starter')) return 'controller';
  if (['switchboard', 'switchgear', 'mcc', 'equipment'].includes(type)) return 'equipment';
  if (['breaker', 'fuse', 'switch', 'disconnect', 'relay', 'recloser', 'contactor', 'meter', 'current_transformer', 'voltage_transformer'].includes(type)) return 'inlineDevice';
  if (signature.includes('breaker') || signature.includes('fuse') || signature.includes('disconnect') || signature.includes('switch') || signature.includes('relay') || signature.includes('meter')) return 'inlineDevice';
  if (['motor', 'motor_load'].includes(type) || subtype.includes('motor')) return 'motor';
  if (type === 'static_load' || subtype.includes('static_load')) return 'load';
  if (type === 'shunt_capacitor_bank' || subtype.includes('capacitor') || subtype.includes('cap')) return 'capacitor';
  if (type === 'reactor') return 'reactor';
  return '';
}

const STANDARD_SYMBOL_GEOMETRY = Object.freeze({
  utility: { width: 64, height: 64, ports: [{ x: 32, y: 64 }] },
  ups: { width: 72, height: 82, ports: [{ x: 36, y: 0 }, { x: 36, y: 82 }] },
  panel: { width: 64, height: 76, ports: [{ x: 32, y: 0 }] },
  equipment: { width: 70, height: 82, ports: [{ x: 35, y: 0 }, { x: 35, y: 82 }] },
  controller: { width: 64, height: 78, ports: [{ x: 32, y: 0 }, { x: 32, y: 78 }] },
  inlineDevice: { width: 56, height: 72, ports: [{ x: 28, y: 0 }, { x: 28, y: 72 }] },
  transformer: { width: 76, height: 84, ports: [{ x: 38, y: 0 }, { x: 38, y: 84 }] },
  transformer3: { width: 86, height: 92, ports: [{ x: 43, y: 0 }, { x: 26, y: 92 }, { x: 60, y: 92 }] },
  generator: { width: 68, height: 68, ports: [{ x: 34, y: 68 }] },
  motor: { width: 64, height: 64, ports: [{ x: 32, y: 0 }] },
  load: { width: 64, height: 64, ports: [{ x: 32, y: 0 }] },
  capacitor: { width: 64, height: 64, ports: [{ x: 32, y: 0 }] },
  reactor: { width: 64, height: 64, ports: [{ x: 32, y: 0 }] },
  busway: { width: 160, height: 22, ports: [{ x: 0, y: 11 }, { x: 160, y: 11 }] },
  bus: { width: 260, height: 20, ports: [{ x: 0, y: 10 }, { x: 260, y: 10 }] }
});

export function industrySymbolGeometry(profile) {
  const geometry = STANDARD_SYMBOL_GEOMETRY[profile];
  if (!geometry) return null;
  return {
    width: geometry.width,
    height: geometry.height,
    ports: geometry.ports.map(port => ({ ...port }))
  };
}

function isLegacyDefaultComponentSize(component, defaultWidth, defaultHeight) {
  const hasWidth = Number.isFinite(Number(component?.width));
  const hasHeight = Number.isFinite(Number(component?.height));
  if (!hasWidth && !hasHeight) return true;
  const width = hasWidth ? Number(component.width) : defaultWidth;
  const height = hasHeight ? Number(component.height) : defaultHeight;
  return Math.abs(width - defaultWidth) <= 0.5 && Math.abs(height - defaultHeight) <= 0.5;
}

export function applyIndustrySymbolGeometry(component, meta = {}, {
  preserveCenter = true,
  force = false,
  defaultWidth = 80,
  defaultHeight = 40
} = {}) {
  const profile = getIndustrySymbolProfile(component, meta);
  const geometry = industrySymbolGeometry(profile);
  if (!geometry) return false;
  if (profile === 'bus') {
    const width = Number(component.width);
    const height = Number(component.height);
    component.width = Number.isFinite(width) && width > 0 ? width : geometry.width;
    component.height = Number.isFinite(height) && height > 0 ? height : geometry.height;
    const ports = [];
    for (let x = 0; x <= component.width; x += 20) {
      ports.push({ x, y: 0 }, { x, y: component.height });
    }
    if (ports.at(-1)?.x !== component.width) {
      ports.push({ x: component.width, y: 0 }, { x: component.width, y: component.height });
    }
    component.ports = ports;
    return true;
  }

  const oldWidth = Number(component.width) || defaultWidth;
  const oldHeight = Number(component.height) || defaultHeight;
  const shouldResize = force || isLegacyDefaultComponentSize(component, defaultWidth, defaultHeight);
  if (shouldResize) {
    const centerX = Number(component.x) + oldWidth / 2;
    const centerY = Number(component.y) + oldHeight / 2;
    component.width = geometry.width;
    component.height = geometry.height;
    if (preserveCenter) {
      component.x = centerX - geometry.width / 2;
      component.y = centerY - geometry.height / 2;
    }
  }
  const fittedPorts = (() => {
    const requiresRenderedPortFit = ['motor', 'controller', 'transformer', 'transformer3', 'panel'].includes(profile);
    if (shouldResize || !requiresRenderedPortFit) return geometry.ports;
    const renderedWidth = Number(component.width) || oldWidth;
    const renderedHeight = Number(component.height) || oldHeight;
    const scale = Math.min(renderedWidth / geometry.width, renderedHeight / geometry.height);
    const offsetX = (renderedWidth - geometry.width * scale) / 2;
    const offsetY = (renderedHeight - geometry.height * scale) / 2;
    return geometry.ports.map(port => ({ x: offsetX + port.x * scale, y: offsetY + port.y * scale }));
  })();
  const portsNeedSync = !Array.isArray(component.ports)
    || component.ports.length !== fittedPorts.length
    || component.ports.some((port, index) => {
      const expected = fittedPorts[index];
      return Math.abs(Number(port?.x) - expected.x) > 0.5
        || Math.abs(Number(port?.y) - expected.y) > 0.5;
    });
  if (force || shouldResize || portsNeedSync) {
    component.ports = fittedPorts.map(port => ({ ...port }));
  }
  return true;
}

export function coerceNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function shouldUseVerticalOneLinePorts(category, type) {
  const resolvedCategory = String(category || '').toLowerCase();
  const resolvedType = String(type || '').toLowerCase();
  if (['bus', 'load', 'cable', 'busway', 'annotations', 'links'].includes(resolvedCategory)) return false;
  if (['bus', 'cable', 'busway', 'annotation', 'dimension', 'sheet_link'].includes(resolvedType)) return false;
  return true;
}

export function remapPortsForVerticalOneLineFlow(ports, category, type, width = 80, height = 40) {
  const normalized = (Array.isArray(ports) ? ports : [])
    .filter(port => port && typeof port === 'object')
    .map(port => ({ x: coerceNumber(port.x, width / 2), y: coerceNumber(port.y, height / 2) }));
  if (!normalized.length) {
    return String(category || '').toLowerCase() === 'sources'
      ? [{ x: width / 2, y: height }]
      : [{ x: width / 2, y: 0 }];
  }
  if (!shouldUseVerticalOneLinePorts(category, type)) return normalized;
  if (normalized.length === 1) {
    return [{ x: width / 2, y: String(category || '').toLowerCase() === 'sources' ? height : 0 }];
  }
  const horizontalSpan = Math.max(...normalized.map(port => port.x)) - Math.min(...normalized.map(port => port.x));
  const verticalSpan = Math.max(...normalized.map(port => port.y)) - Math.min(...normalized.map(port => port.y));
  if (verticalSpan >= horizontalSpan) return normalized;
  if (normalized.length === 2) return [{ x: width / 2, y: 0 }, { x: width / 2, y: height }];
  return normalized.map((port, index) => {
    if (index === 0) return { x: width / 2, y: 0 };
    const slots = normalized.length - 1;
    return { x: width * (index / (slots + 1)), y: height };
  });
}

export function normalizePortsForCategory(category, ports, type, subtype, width = 80, height = 40) {
  const hasDefinedPorts = Array.isArray(ports) && ports.length > 0;
  const base = hasDefinedPorts ? ports : getDefaultPorts(type, subtype, width, height);
  if (category === 'load') {
    const defaultX = width / 2;
    if (!hasDefinedPorts || !base.length) return [{ x: defaultX, y: 0 }];
    return base.map(port => ({ x: coerceNumber(port?.x, defaultX), y: coerceNumber(port?.y, 0) }));
  }
  const normalized = base.map(port => ({
    x: coerceNumber(port?.x, width / 2),
    y: coerceNumber(port?.y, height / 2)
  }));
  return remapPortsForVerticalOneLineFlow(normalized, category, type, width, height);
}
