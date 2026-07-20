import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { buildRouteSceneModel } from '../routeSceneModel.mjs';

const COLORS = {
  background: 0xf4f7fb,
  grid: 0xcbd5e1,
  tray: 0x3f648c,
  conduit: 0x52606f,
  ductbank: 0xa67855,
  route: 0x00aef0,
  routeCore: 0xd8f7ff,
  routeHalo: 0x3ecbff,
  field: 0xf59e0b,
  start: 0x16a34a,
  end: 0x7c3aed,
  reel: 0xea580c,
  reelDark: 0x9a3412,
  tugger: 0x0f766e,
  tuggerDark: 0x115e59,
  handPull: 0x2563eb,
  handPullDark: 0x1e3a8a,
  sheave: 0xf59e0b,
  sheaveDark: 0x92400e,
  roller: 0x64748b,
  equipment: 0x94a3b8,
  gradeTop: 0xd9dfbd,
  gradeBottom: 0xb99a73,
  gradeGrid: 0xa7ad83,
  gradeEdge: 0x7f8562,
  soilEdge: 0xa9825d,
  gradeTransition: 0x84a33d,
  facilityFloor: 0xdce4ec,
  facilityEdge: 0x9aaabd,
  structure: 0x7f8f9f,
  equipmentDark: 0x657586,
  equipmentLight: 0x94a3b3
};

const RACEWAY_CLASS_COLORS = {
  HV: 0xc2410c,
  MV: 0xb45309,
  LV: 0x2563eb,
  CONTROL: 0x0f766e,
  SIGNAL: 0x7c3aed,
  INSTRUMENT: 0x7c3aed,
  INSTRUMENTATION: 0x7c3aed,
  COMMUNICATION: 0x047857,
  COMMUNICATIONS: 0x047857
};

const RACEWAY_CLASS_PALETTE = [0xbe123c, 0x0369a1, 0x047857, 0x7e22ce, 0xa16207, 0x0f766e];

const normalizedCableGroup = value => String(value || '').trim().toUpperCase();

const racewayClassColor = (group, fallback = COLORS.tray) => {
  const normalized = normalizedCableGroup(group);
  if (!normalized) return fallback;
  if (RACEWAY_CLASS_COLORS[normalized]) return RACEWAY_CLASS_COLORS[normalized];
  const hash = [...normalized].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return RACEWAY_CLASS_PALETTE[hash % RACEWAY_CLASS_PALETTE.length];
};

const hexColor = color => `#${Number(color).toString(16).padStart(6, '0')}`;

const Z_UP = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const vector = point => new THREE.Vector3(point[0], point[1], point[2]);

const getSegmentTransform = (startPoint, endPoint) => {
  const start = vector(startPoint);
  const end = vector(endPoint);
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (!Number.isFinite(length) || length < 1e-6) return null;
  direction.normalize();
  return {
    start,
    end,
    direction,
    length,
    midpoint: start.clone().add(end).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(X_AXIS, direction)
  };
};

const addOrientedBox = (group, start, end, width, height, material, userData = {}) => {
  const transform = getSegmentTransform(start, end);
  if (!transform) return null;
  const geometry = new THREE.BoxGeometry(transform.length, Math.max(width, 0.03), Math.max(height, 0.03));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(transform.midpoint);
  mesh.quaternion.copy(transform.quaternion);
  mesh.userData = userData;
  group.add(mesh);
  return mesh;
};

const addOrientedCylinder = (group, start, end, radius, material, userData = {}, radialSegments = 10) => {
  const transform = getSegmentTransform(start, end);
  if (!transform) return null;
  const geometry = new THREE.CylinderGeometry(radius, radius, transform.length, radialSegments, 1, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(transform.midpoint);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, transform.direction);
  mesh.userData = userData;
  group.add(mesh);
  return mesh;
};

const pathSegments = path => {
  const segments = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    segments.push([path[index], path[index + 1]]);
  }
  return segments;
};

const utilizationColor = pct => {
  if (pct >= 80) return 0xef4444;
  if (pct >= 50) return 0xf59e0b;
  return 0x14b8a6;
};

const createEarthTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  context.fillStyle = '#dce1c2';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 31173;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const patches = ['#b8c18f', '#c7c89d', '#aaad82', '#e7dfbf', '#9ba878'];
  for (let index = 0; index < 150; index += 1) {
    const radius = 2 + random() * 14;
    context.globalAlpha = 0.035 + random() * 0.075;
    context.fillStyle = patches[Math.floor(random() * patches.length)];
    context.beginPath();
    context.ellipse(
      random() * canvas.width,
      random() * canvas.height,
      radius * (0.7 + random()),
      radius * (0.35 + random() * 0.55),
      random() * Math.PI,
      0,
      Math.PI * 2
    );
    context.fill();
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const gradeIntersections = raceways => {
  const intersections = [];
  const seen = new Set();
  const addPoint = point => {
    const key = `${point[0].toFixed(2)}:${point[1].toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    intersections.push([point[0], point[1], 0]);
  };
  raceways.forEach(raceway => pathSegments(raceway.path).forEach(([start, end]) => {
    const startZ = Number(start[2]) || 0;
    const endZ = Number(end[2]) || 0;
    if (Math.abs(startZ) < 1e-6 && Math.abs(endZ) < 1e-6) return;
    if (Math.abs(startZ) < 1e-6) addPoint(start);
    if (Math.abs(endZ) < 1e-6) addPoint(end);
    if ((startZ < 0 && endZ > 0) || (startZ > 0 && endZ < 0)) {
      const ratio = -startZ / (endZ - startZ);
      addPoint([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
        0
      ]);
    }
  }));
  return intersections;
};

const dominantFacilityLevels = raceways => {
  const counts = new Map();
  raceways.forEach(raceway => raceway.path.forEach(point => {
    const level = Math.round((Number(point[2]) || 0) / 2) * 2;
    if (level <= 1) return;
    counts.set(level, (counts.get(level) || 0) + 1);
  }));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([level]) => level)
    .filter((level, index, levels) => levels.slice(0, index).every(other => Math.abs(level - other) >= 8))
    .slice(0, 3)
    .sort((a, b) => a - b);
};

const makeMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  map: options.map || null,
  roughness: options.roughness ?? 0.82,
  metalness: options.metalness ?? 0.04,
  transparent: Boolean(options.transparent),
  opacity: options.opacity ?? 1,
  depthWrite: options.depthWrite ?? true,
  side: options.side ?? THREE.FrontSide
});

const makeGlowMaterial = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color,
  transparent: opacity < 1,
  opacity,
  depthWrite: opacity >= 0.98,
  toneMapped: false
});

const disposeObject = object => {
  object.traverse(child => {
    if (child.geometry?.dispose) child.geometry.dispose();
    const disposeMaterial = material => {
      material?.map?.dispose?.();
      material?.dispose?.();
    };
    if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
    else disposeMaterial(child.material);
  });
  object.clear();
};

export class RouteViewer3D {
  constructor({ container, onSelect, onReady } = {}) {
    if (!container) throw new Error('RouteViewer3D requires a container.');
    this.container = container;
    this.onSelect = typeof onSelect === 'function' ? onSelect : () => {};
    this.model = buildRouteSceneModel();
    this.selectedRouteIndex = null;
    this.selectedRacewayId = '';
    this.heatmapEnabled = false;
    this.contextDensity = 'medium';
    this.racewayFilter = 'compatible';
    this.selectedCableGroup = '';
    this.layerVisibility = {
      tray: true,
      conduit: true,
      ductbank: true,
      field: true,
      labels: true,
      context: true,
      pullSetups: true
    };
    this.selectable = [];
    this.labels = [];
    this.frame = 0;
    this.reducedRenderMode = globalThis.location?.protocol === 'file:' && globalThis.navigator?.webdriver;

    this.container.classList.add('route-viewer-three');
    this.container.replaceChildren();
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'route-viewer-canvas';
    this.canvas.setAttribute('aria-label', 'Interactive three-dimensional cable route model');
    this.canvas.setAttribute('role', 'img');
    this.container.appendChild(this.canvas);

    this.overlay = document.createElement('div');
    this.overlay.className = 'route-viewer-overlay';
    this.container.appendChild(this.overlay);
    this.leaderLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.leaderLayer.classList.add('route-viewer-label-leaders');
    this.leaderLayer.setAttribute('aria-hidden', 'true');
    this.overlay.appendChild(this.leaderLayer);
    this.buildViewportChrome();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.reducedRenderMode,
      alpha: false,
      preserveDrawingBuffer: !this.reducedRenderMode,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(COLORS.background, 1);
    this.renderer.setPixelRatio(this.reducedRenderMode ? 1 : Math.min(globalThis.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = !this.reducedRenderMode;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.up.copy(Z_UP);
    this.scene.fog = new THREE.Fog(COLORS.background, 320, 900);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100000);
    this.camera.up.copy(Z_UP);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.requestRender());

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(80, -90, 130);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -220;
    keyLight.shadow.camera.right = 220;
    keyLight.shadow.camera.top = 220;
    keyLight.shadow.camera.bottom = -220;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 500;
    this.scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.2);
    fillLight.position.set(-80, 60, 50);
    this.scene.add(fillLight);

    this.staticGroup = new THREE.Group();
    this.staticGroup.name = 'raceways';
    this.routeGroup = new THREE.Group();
    this.routeGroup.name = 'route-overlay';
    this.contextGroup = new THREE.Group();
    this.contextGroup.name = 'context';
    this.scene.add(this.contextGroup, this.staticGroup, this.routeGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerDown = null;
    this.canvas.addEventListener('pointerdown', event => {
      this.pointerDown = [event.clientX, event.clientY];
    });
    this.canvas.addEventListener('pointerup', event => this.handlePointerUp(event));
    this.canvas.addEventListener('pointermove', event => this.handlePointerMove(event));
    this.canvas.addEventListener('pointerleave', () => this.hideTooltip());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.setView('isometric');
    this.updateDebugState();
    onReady?.(this);
  }

  buildViewportChrome() {
    this.axisTriad = document.createElement('div');
    this.axisTriad.className = 'route-viewer-axis';
    this.axisTriad.innerHTML = '<span class="axis-z">Z</span><span class="axis-y">Y</span><span class="axis-x">X</span>';
    this.overlay.appendChild(this.axisTriad);

    this.viewCube = document.createElement('div');
    this.viewCube.className = 'route-viewer-view-cube';
    this.viewCube.setAttribute('aria-label', 'Camera orientation');
    this.viewCube.innerHTML = '<button type="button" data-view="plan">TOP</button><button type="button" data-view="front">FRONT</button><button type="button" data-view="right">RIGHT</button>';
    this.viewCube.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => this.setView(button.dataset.view));
    });
    this.overlay.appendChild(this.viewCube);

    this.elevationScale = document.createElement('div');
    this.elevationScale.className = 'route-viewer-elevation';
    this.overlay.appendChild(this.elevationScale);

    this.minimap = document.createElement('canvas');
    this.minimap.className = 'route-viewer-minimap';
    this.minimap.width = 210;
    this.minimap.height = 132;
    this.minimap.setAttribute('aria-label', 'Plan overview of the route model');
    this.overlay.appendChild(this.minimap);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'route-viewer-tooltip';
    this.tooltip.hidden = true;
    this.overlay.appendChild(this.tooltip);
  }

  setData({ raceways = [], ductbanks = [], routes = [], selectedRouteIndex } = {}) {
    this.model = buildRouteSceneModel({ raceways, ductbanks, routes });
    this.selectedRouteIndex = Number.isInteger(selectedRouteIndex)
      ? selectedRouteIndex
      : this.model.routes.length === 1
        ? 0
        : this.selectedRouteIndex;
    if (this.selectedRouteIndex != null && !this.model.routes[this.selectedRouteIndex]) {
      this.selectedRouteIndex = null;
    }
    this.selectedCableGroup = normalizedCableGroup(this.model.routes[this.selectedRouteIndex]?.allowedGroup);
    this.rebuildScene();
    this.fitAll();
    if (this.selectedRouteIndex != null) this.selectRoute(this.selectedRouteIndex, { focus: true, emit: false });
    this.updateDebugState();
  }

  rebuildScene() {
    disposeObject(this.staticGroup);
    disposeObject(this.contextGroup);
    this.clearRouteOverlay();
    this.selectable = [];
    this.clearLabels();
    this.racewayUsage = new Map();
    this.model.routes.forEach(route => route.segments.forEach(segment => {
      if (segment.containmentType === 'field' || !segment.racewayId) return;
      this.racewayUsage.set(segment.racewayId, (this.racewayUsage.get(segment.racewayId) || 0) + 1);
    }));
    this.addFloorContext();
    this.model.raceways.forEach(raceway => this.addRaceway(raceway));
    this.addEquipmentContext();
    this.drawMinimap();
    this.updateElevationScale();
    this.requestRender();
  }

  addFloorContext() {
    const points = this.model.raceways.flatMap(raceway => raceway.path);
    if (!points.length) return;
    const bounds = new THREE.Box3().setFromPoints(points.map(vector));
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.y, 20) * 1.25;
    const geometry = new THREE.PlaneGeometry(span, span);
    const earthTexture = createEarthTexture();
    const repeat = Math.max(3, span / 38);
    earthTexture.repeat.set(repeat, repeat);
    earthTexture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const topMaterial = makeMaterial(0xffffff, {
      map: earthTexture,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      side: THREE.FrontSide
    });
    const bottomMaterial = makeMaterial(COLORS.gradeBottom, {
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.BackSide
    });
    const gradeTop = new THREE.Mesh(geometry, topMaterial);
    gradeTop.name = 'grade-plane';
    gradeTop.position.set(center.x, center.y, 0);
    gradeTop.renderOrder = -3;
    gradeTop.userData = { layer: 'context', kind: 'grade-plane', elevation: 0 };
    const gradeBottom = new THREE.Mesh(geometry.clone(), bottomMaterial);
    gradeBottom.name = 'grade-plane-underside';
    gradeBottom.position.copy(gradeTop.position);
    gradeBottom.renderOrder = -3;
    gradeBottom.userData = { layer: 'context', kind: 'grade-plane', elevation: 0 };
    this.contextGroup.add(gradeTop, gradeBottom);

    const earthDepth = Math.max(6, Math.min(22, Math.abs(Math.min(bounds.min.z, -6))));
    const soilMaterial = makeMaterial(COLORS.soilEdge, {
      transparent: true,
      opacity: 0.27,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const edgeThickness = Math.max(0.22, span / 700);
    [
      { size: [span, edgeThickness, earthDepth], position: [center.x, center.y - span / 2, -earthDepth / 2] },
      { size: [span, edgeThickness, earthDepth], position: [center.x, center.y + span / 2, -earthDepth / 2] },
      { size: [edgeThickness, span, earthDepth], position: [center.x - span / 2, center.y, -earthDepth / 2] },
      { size: [edgeThickness, span, earthDepth], position: [center.x + span / 2, center.y, -earthDepth / 2] }
    ].forEach(({ size: edgeSize, position }) => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(...edgeSize), soilMaterial);
      edge.position.fromArray(position);
      edge.renderOrder = -3;
      edge.userData = { layer: 'context', kind: 'grade-soil-edge', elevation: 0 };
      this.contextGroup.add(edge);
    });

    const divisions = Math.max(10, Math.min(32, Math.round(span / 8)));
    const grid = new THREE.GridHelper(span, divisions, COLORS.gradeEdge, COLORS.gradeGrid);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(center.x, center.y, 0.015);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    grid.material.depthWrite = false;
    grid.renderOrder = -2;
    grid.userData = { layer: 'context', kind: 'grade-grid', elevation: 0 };

    const half = span / 2;
    const borderGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(center.x - half, center.y - half, 0.025),
      new THREE.Vector3(center.x + half, center.y - half, 0.025),
      new THREE.Vector3(center.x + half, center.y + half, 0.025),
      new THREE.Vector3(center.x - half, center.y + half, 0.025)
    ]);
    const borderMaterial = new THREE.LineBasicMaterial({
      color: COLORS.gradeEdge,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    });
    const border = new THREE.LineLoop(borderGeometry, borderMaterial);
    border.renderOrder = -1;
    border.userData = { layer: 'context', kind: 'grade-boundary', elevation: 0 };
    this.contextGroup.add(grid, border);

    const strataMaterial = new THREE.LineBasicMaterial({
      color: COLORS.gradeEdge,
      transparent: true,
      opacity: 0.23,
      depthWrite: false
    });
    [0.34, 0.68, 1].forEach(fraction => {
      const strataGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(center.x - half, center.y - half, -earthDepth * fraction),
        new THREE.Vector3(center.x + half, center.y - half, -earthDepth * fraction),
        new THREE.Vector3(center.x + half, center.y + half, -earthDepth * fraction),
        new THREE.Vector3(center.x - half, center.y + half, -earthDepth * fraction)
      ]);
      const stratum = new THREE.LineLoop(strataGeometry, strataMaterial);
      stratum.renderOrder = -2;
      stratum.userData = { layer: 'context', kind: 'grade-stratum', elevation: -earthDepth * fraction };
      this.contextGroup.add(stratum);
    });

    const transitionMaterial = makeMaterial(COLORS.gradeTransition, {
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    transitionMaterial.emissive.setHex(0x4d651b);
    transitionMaterial.emissiveIntensity = 0.2;
    const transitionCurbMaterial = makeMaterial(COLORS.soilEdge, {
      transparent: true,
      opacity: 0.68,
      roughness: 0.86,
      metalness: 0.02
    });
    gradeIntersections(this.model.raceways).forEach(point => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.8, 0.46), transitionCurbMaterial);
      curb.position.set(point[0], point[1], 0.23);
      curb.receiveShadow = true;
      curb.userData = { layer: 'context', kind: 'grade-transition-curb', elevation: 0 };
      const marker = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.1, 8, 28), transitionMaterial);
      marker.position.set(point[0], point[1], 0.08);
      marker.renderOrder = 3;
      marker.userData = { layer: 'context', kind: 'grade-transition', elevation: 0 };
      this.contextGroup.add(curb, marker);
    });
    this.addFacilityContext(bounds, span);
  }

  addFacilityContext(bounds, span) {
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const levels = dominantFacilityLevels(this.model.raceways);
    this.facilityFloorLevels = levels.map(level => Math.max(0.6, level - 3.5));
    if (!this.facilityFloorLevels.length && bounds.max.z > 6) {
      this.facilityFloorLevels = [Math.max(0.6, bounds.min.z - 3.5)];
    }
    const footprintX = Math.max(size.x * 1.08, span * 0.72, 28);
    const footprintY = Math.max(size.y * 1.08, span * 0.56, 24);
    const slabMaterial = makeMaterial(COLORS.facilityFloor, {
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      roughness: 0.68,
      metalness: 0.02,
      side: THREE.DoubleSide
    });
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: COLORS.facilityEdge,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    });
    this.facilityFloorLevels.forEach((level, index) => {
      const scale = index === this.facilityFloorLevels.length - 1 ? 0.9 : 1;
      const geometry = new THREE.BoxGeometry(footprintX * scale, footprintY * scale, 0.42);
      const slab = new THREE.Mesh(geometry, slabMaterial);
      slab.name = `facility-level-${index + 1}`;
      slab.position.set(center.x, center.y, level);
      slab.receiveShadow = true;
      slab.renderOrder = -1;
      slab.userData = { layer: 'context', kind: 'facility-floor', elevation: level };
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      outline.position.copy(slab.position);
      outline.userData = { layer: 'context', kind: 'facility-floor-edge', elevation: level };
      const floorGrid = new THREE.GridHelper(1, 18, COLORS.facilityEdge, COLORS.facilityEdge);
      floorGrid.rotation.x = Math.PI / 2;
      floorGrid.scale.set(footprintX * scale, 1, footprintY * scale);
      floorGrid.position.set(center.x, center.y, level + 0.23);
      floorGrid.material.transparent = true;
      floorGrid.material.opacity = 0.13;
      floorGrid.material.depthWrite = false;
      floorGrid.userData = { layer: 'context', kind: 'facility-floor-grid', elevation: level };
      this.contextGroup.add(slab, outline, floorGrid);
    });

    const highestFloor = this.facilityFloorLevels.at(-1) || 0;
    const top = Math.max(highestFloor + 9, Math.min(bounds.max.z + 2, highestFloor + 18));
    const columnMaterial = makeMaterial(COLORS.structure, {
      transparent: true,
      opacity: 0.5,
      roughness: 0.58,
      metalness: 0.28
    });
    const baseMaterial = makeMaterial(COLORS.equipmentLight, {
      transparent: true,
      opacity: 0.62,
      roughness: 0.72,
      metalness: 0.12
    });
    const columnsX = this.contextDensity === 'high' ? 4 : 3;
    const columnsY = this.contextDensity === 'low' ? 3 : 4;
    for (let xIndex = 0; xIndex < columnsX; xIndex += 1) {
      for (let yIndex = 0; yIndex < columnsY; yIndex += 1) {
        const x = center.x - footprintX * 0.43 + (footprintX * 0.86 * xIndex) / Math.max(columnsX - 1, 1);
        const y = center.y - footprintY * 0.43 + (footprintY * 0.86 * yIndex) / Math.max(columnsY - 1, 1);
        const column = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, top), columnMaterial);
        column.position.set(x, y, top / 2);
        column.castShadow = true;
        column.userData = { layer: 'context', kind: 'facility-column' };
        const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 0.28), baseMaterial);
        base.position.set(x, y, 0.16);
        base.receiveShadow = true;
        base.userData = { layer: 'context', kind: 'facility-column-base' };
        this.contextGroup.add(column, base);
      }
    }

    this.facilityFloorLevels.forEach(level => {
      const beamZ = level + 0.6;
      [-0.43, 0.43].forEach(offset => {
        const beamX = new THREE.Mesh(new THREE.BoxGeometry(footprintX * 0.86, 0.48, 0.48), columnMaterial);
        beamX.position.set(center.x, center.y + footprintY * offset, beamZ);
        beamX.userData = { layer: 'context', kind: 'facility-beam' };
        const beamY = new THREE.Mesh(new THREE.BoxGeometry(0.48, footprintY * 0.86, 0.48), columnMaterial);
        beamY.position.set(center.x + footprintX * offset, center.y, beamZ);
        beamY.userData = { layer: 'context', kind: 'facility-beam' };
        this.contextGroup.add(beamX, beamY);
      });
    });

    if (this.contextDensity !== 'low') {
      const equipmentLevels = [0.3, ...this.facilityFloorLevels.map(level => level + 0.28)];
      const positions = [
        [-0.32, -0.28, 'switchgear'], [0.31, 0.27, 'switchgear'],
        [-0.28, 0.23, 'pump'], [0.27, -0.25, 'pump']
      ];
      equipmentLevels.slice(0, this.contextDensity === 'high' ? 3 : 2).forEach((level, levelIndex) => {
        positions.forEach(([xFactor, yFactor, type], index) => {
          if (this.contextDensity === 'medium' && index > 2) return;
          const x = center.x + footprintX * xFactor + levelIndex * 3;
          const y = center.y + footprintY * yFactor - levelIndex * 2;
          if (type === 'switchgear') this.addSwitchgearContext(x, y, level);
          else this.addPumpContext(x, y, level);
        });
      });
      this.addProcessPipingContext(center, footprintX, footprintY);
    }
  }

  addSwitchgearContext(x, y, baseZ, label = '', scale = 1) {
    const group = new THREE.Group();
    group.userData = { layer: 'context', kind: 'facility-equipment', label };
    const shellMaterial = makeMaterial(COLORS.equipmentLight, {
      transparent: true,
      opacity: 0.86,
      roughness: 0.55,
      metalness: 0.22
    });
    const detailMaterial = makeMaterial(COLORS.equipmentDark, { roughness: 0.62, metalness: 0.2 });
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.5, 0.34), shellMaterial);
    foundation.position.z = 0.17;
    foundation.receiveShadow = true;
    const enclosure = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.7, 5.6), shellMaterial);
    enclosure.position.z = 3.15;
    enclosure.castShadow = true;
    for (let panel = -1; panel <= 1; panel += 1) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.08, 4.8), detailMaterial);
      seam.position.set(panel * 1.35, -1.39, 3.15);
      group.add(seam);
      for (let vent = 0; vent < 3; vent += 1) {
        const grille = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.09, 0.05), detailMaterial);
        grille.position.set(panel * 1.35, -1.4, 1.5 + vent * 0.2);
        group.add(grille);
      }
    }
    group.add(foundation, enclosure);
    group.position.set(x, y, baseZ);
    group.scale.setScalar(scale);
    this.contextGroup.add(group);
  }

  addPumpContext(x, y, baseZ) {
    const group = new THREE.Group();
    group.userData = { layer: 'context', kind: 'facility-equipment' };
    const metal = makeMaterial(COLORS.equipmentDark, {
      transparent: true,
      opacity: 0.82,
      roughness: 0.48,
      metalness: 0.32
    });
    const light = makeMaterial(COLORS.equipmentLight, {
      transparent: true,
      opacity: 0.82,
      roughness: 0.64,
      metalness: 0.16
    });
    const skid = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.2, 0.34), light);
    skid.position.z = baseZ + 0.17;
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 3.2, 16), metal);
    motor.rotation.z = Math.PI / 2;
    motor.position.set(-1.4, 0, baseZ + 1.45);
    motor.castShadow = true;
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 1.7, 16), light);
    pump.rotation.z = Math.PI / 2;
    pump.position.set(1.4, 0, baseZ + 1.25);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 4.2, 10), metal);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(1.8, 0, baseZ + 3.15);
    group.add(skid, motor, pump, pipe);
    group.position.set(x, y, 0);
    this.contextGroup.add(group);
  }

  addProcessPipingContext(center, footprintX, footprintY) {
    const pipeMaterial = makeMaterial(COLORS.structure, {
      transparent: true,
      opacity: 0.58,
      roughness: 0.38,
      metalness: 0.46
    });
    const vesselMaterial = makeMaterial(COLORS.equipmentLight, {
      transparent: true,
      opacity: 0.78,
      roughness: 0.5,
      metalness: 0.28
    });
    const levels = [0.4, ...this.facilityFloorLevels.map(level => level + 0.45)]
      .slice(0, this.contextDensity === 'high' ? 3 : 2);
    levels.forEach((level, levelIndex) => {
      const pipeZ = level + 4.5;
      [-0.17, 0.17].forEach((yFactor, pipeIndex) => {
        const y = center.y + footprintY * yFactor + levelIndex * 1.8;
        const startX = center.x - footprintX * 0.3;
        const endX = center.x + footprintX * 0.3;
        addOrientedCylinder(
          this.contextGroup,
          [startX, y, pipeZ + pipeIndex * 0.55],
          [endX, y, pipeZ + pipeIndex * 0.55],
          0.22,
          pipeMaterial,
          { layer: 'context', kind: 'facility-process-pipe' },
          10
        );
        [startX, endX].forEach(x => addOrientedCylinder(
          this.contextGroup,
          [x, y, level + 0.35],
          [x, y, pipeZ + pipeIndex * 0.55],
          0.22,
          pipeMaterial,
          { layer: 'context', kind: 'facility-process-riser' },
          10
        ));
      });
      [-0.18, 0.18].forEach((xFactor, vesselIndex) => {
        const x = center.x + footprintX * xFactor;
        const y = center.y + footprintY * (vesselIndex ? -0.08 : 0.09) - levelIndex * 2.4;
        addOrientedCylinder(
          this.contextGroup,
          [x, y, level + 0.25],
          [x, y, level + 4.1],
          0.88,
          vesselMaterial,
          { layer: 'context', kind: 'facility-vessel' },
          16
        );
      });
    });
  }

  addRaceway(raceway) {
    const group = new THREE.Group();
    group.name = raceway.id;
    group.userData = {
      racewayId: raceway.id,
      racewayKind: raceway.kind,
      allowedGroup: raceway.allowedGroup,
      layer: raceway.kind
    };
    const baseColor = this.heatmapEnabled
      ? utilizationColor(raceway.utilizationPct)
      : racewayClassColor(raceway.allowedGroup, COLORS[raceway.kind]);
    const material = makeMaterial(baseColor, raceway.kind === 'ductbank'
      ? { transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, roughness: 0.78 }
      : raceway.kind === 'tray'
        ? { transparent: true, opacity: 0.9, roughness: 0.34, metalness: 0.38 }
        : { transparent: true, opacity: 0.86, roughness: 0.4, metalness: 0.3 });
    pathSegments(raceway.path).forEach(([start, end]) => {
      if (raceway.kind === 'tray') this.addTraySegment(group, start, end, raceway, material);
      if (raceway.kind === 'conduit') {
        const radius = Math.max((raceway.diameterIn || raceway.widthIn || 1) / 24, 0.1);
        const mesh = addOrientedCylinder(group, start, end, radius, material, this.racewayUserData(raceway), 12);
        if (mesh) this.selectable.push(mesh);
      }
      if (raceway.kind === 'ductbank') {
        const mesh = addOrientedBox(
          group,
          start,
          end,
          Math.max(raceway.widthIn / 12, 1.5),
          Math.max(raceway.heightIn / 12, 1.5),
          material,
          this.racewayUserData(raceway)
        );
        if (mesh) {
          mesh.renderOrder = -1;
          this.selectable.push(mesh);
        }
      }
      const routeCount = this.racewayUsage.get(raceway.id) || 0;
      if (routeCount > 0 && raceway.kind !== 'ductbank') {
        const corridorMaterial = makeMaterial(0x60a5fa, { transparent: true, opacity: 0.22, depthWrite: false });
        const corridor = addOrientedCylinder(
          group,
          start,
          end,
          Math.min(0.42, 0.1 + Math.sqrt(routeCount) * 0.045),
          corridorMaterial,
          { ...this.racewayUserData(raceway), routeCount },
          10
        );
        if (corridor) {
          corridor.renderOrder = 1;
          this.selectable.push(corridor);
        }
      }
    });
    group.visible = this.isRacewayVisible(raceway);
    group.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = raceway.kind !== 'ductbank';
      child.receiveShadow = true;
    });
    this.staticGroup.add(group);
  }

  racewayUserData(raceway) {
    return {
      selectable: true,
      kind: 'raceway',
      racewayId: raceway.id,
      racewayKind: raceway.kind,
      allowedGroup: raceway.allowedGroup,
      utilizationPct: raceway.utilizationPct,
      geometrySource: raceway.geometrySource || 'supplied',
      routeCount: this.racewayUsage?.get(raceway.id) || 0,
      label: raceway.id,
      layer: raceway.kind
    };
  }

  addTraySegment(group, start, end, raceway, material) {
    const transform = getSegmentTransform(start, end);
    if (!transform) return;
    const width = Math.max(raceway.widthIn / 12, 0.8);
    const depth = Math.max(raceway.heightIn / 12, 0.22);
    let lateral = new THREE.Vector3().crossVectors(transform.direction, Z_UP);
    if (lateral.lengthSq() < 0.01) lateral = new THREE.Vector3(1, 0, 0);
    lateral.normalize();
    const railOffset = lateral.multiplyScalar(width * 0.46);
    const railAStart = transform.start.clone().add(railOffset);
    const railAEnd = transform.end.clone().add(railOffset);
    const railBStart = transform.start.clone().sub(railOffset);
    const railBEnd = transform.end.clone().sub(railOffset);
    const userData = this.racewayUserData(raceway);
    [
      addOrientedBox(group, railAStart.toArray(), railAEnd.toArray(), 0.11, depth, material, userData),
      addOrientedBox(group, railBStart.toArray(), railBEnd.toArray(), 0.11, depth, material, userData)
    ].filter(Boolean).forEach(mesh => this.selectable.push(mesh));
    const rungCount = Math.max(2, Math.min(36, Math.floor(transform.length / 3) + 1));
    for (let index = 0; index < rungCount; index += 1) {
      const t = rungCount === 1 ? 0.5 : index / (rungCount - 1);
      const center = transform.start.clone().lerp(transform.end, t);
      const rungStart = center.clone().add(railOffset);
      const rungEnd = center.clone().sub(railOffset);
      const rung = addOrientedBox(group, rungStart.toArray(), rungEnd.toArray(), 0.075, 0.075, material, userData);
      if (rung) this.selectable.push(rung);
    }
    this.addTraySupports(transform, width, depth, railOffset);
  }

  addTraySupports(transform, width, depth, railOffset) {
    if (this.contextDensity === 'low' || Math.abs(transform.direction.z) > 0.25 || transform.length < 9) return;
    const floorLevels = [0, ...(this.facilityFloorLevels || [])];
    const supportMaterial = makeMaterial(COLORS.structure, {
      transparent: true,
      opacity: 0.78,
      roughness: 0.5,
      metalness: 0.34
    });
    const supportCount = Math.max(1, Math.min(5, Math.floor(transform.length / 18)));
    for (let index = 1; index <= supportCount; index += 1) {
      const trayCenter = transform.start.clone().lerp(transform.end, index / (supportCount + 1));
      const floor = floorLevels.filter(level => level < trayCenter.z - 1.5).sort((a, b) => b - a)[0] ?? 0;
      const postTop = trayCenter.z - depth * 0.55;
      if (postTop - floor < 2) continue;
      const supportGroup = new THREE.Group();
      supportGroup.userData = { layer: 'context', kind: 'tray-support' };
      const offset = railOffset.clone().setLength(width * 0.58 + 0.3);
      [-1, 1].forEach(side => {
        const postPoint = trayCenter.clone().addScaledVector(offset, side);
        addOrientedBox(
          supportGroup,
          [postPoint.x, postPoint.y, floor + 0.2],
          [postPoint.x, postPoint.y, postTop],
          0.12,
          0.12,
          supportMaterial
        );
      });
      const armStart = trayCenter.clone().add(offset);
      const armEnd = trayCenter.clone().sub(offset);
      armStart.z = postTop;
      armEnd.z = postTop;
      addOrientedBox(supportGroup, armStart.toArray(), armEnd.toArray(), 0.13, 0.13, supportMaterial);
      this.contextGroup.add(supportGroup);
    }
  }

  addEquipmentContext() {
    const endpoints = new Map();
    this.model.routes.forEach((route, routeIndex) => {
      if (!route.segments.length) return;
      const start = route.segments[0].start;
      const end = route.segments.at(-1).end;
      const startLabel = route.startTag || route.from_tag || 'Start';
      const endLabel = route.endTag || route.to_tag || 'End';
      endpoints.set(`${startLabel}|${start.join(',')}`, { label: startLabel, point: start, kind: 'start', priority: routeIndex === this.selectedRouteIndex ? 0 : 1 });
      endpoints.set(`${endLabel}|${end.join(',')}`, { label: endLabel, point: end, kind: 'end', priority: routeIndex === this.selectedRouteIndex ? 0 : 1 });
    });
    const limit = this.contextDensity === 'high' ? 18 : this.contextDensity === 'low' ? 6 : 12;
    [...endpoints.values()]
      .sort((a, b) => a.priority - b.priority)
      .slice(0, limit)
      .forEach(endpoint => {
        const point = vector(endpoint.point);
        const floor = [0, ...(this.facilityFloorLevels || [])]
          .filter(level => level <= point.z)
          .sort((a, b) => b - a)[0] ?? 0;
        this.addSwitchgearContext(point.x, point.y, floor + 0.25, endpoint.label, 0.82);
      });
  }

  clearRouteOverlay() {
    disposeObject(this.routeGroup);
    this.clearLabels();
  }

  selectRoute(index, { focus = true, emit = true } = {}) {
    const route = this.model.routes[index];
    if (!route) return;
    this.selectedRouteIndex = index;
    this.selectedRacewayId = '';
    this.selectedCableGroup = normalizedCableGroup(route.allowedGroup);
    this.updateRacewayVisibility();
    this.clearRouteOverlay();
    const haloMaterial = makeGlowMaterial(COLORS.routeHalo, 0.28);
    haloMaterial.depthWrite = false;
    const routeMaterial = makeGlowMaterial(COLORS.route, 1);
    const coreMaterial = makeGlowMaterial(COLORS.routeCore, 0.96);
    coreMaterial.depthWrite = false;
    const fieldMaterial = makeGlowMaterial(COLORS.field, 0.96);
    route.segments.forEach(segment => {
      const displayStart = segment.displayStart || segment.start;
      const displayEnd = segment.displayEnd || segment.end;
      if (segment.containmentType === 'field') {
        if (!this.layerVisibility.field) return;
        this.addDashedSegment(displayStart, displayEnd, fieldMaterial, {
          kind: 'route', routeIndex: index, label: route.label, containmentType: 'field', selectable: true
        });
        return;
      }
      const halo = addOrientedCylinder(this.routeGroup, displayStart, displayEnd, 0.92, haloMaterial, {}, 16);
      if (halo) halo.renderOrder = 2;
      const mesh = addOrientedCylinder(this.routeGroup, displayStart, displayEnd, 0.46, routeMaterial, {
        kind: 'route', routeIndex: index, label: route.label, containmentType: segment.containmentType, selectable: true
      }, 14);
      if (mesh) {
        mesh.renderOrder = 3;
        this.selectable.push(mesh);
      }
      const core = addOrientedCylinder(this.routeGroup, displayStart, displayEnd, 0.14, coreMaterial, {}, 10);
      if (core) core.renderOrder = 4;
      if (route.pull_check?.direction === 'reverse') this.addDirectionMarker(displayEnd, displayStart, coreMaterial);
      else this.addDirectionMarker(displayStart, displayEnd, coreMaterial);
    });
    const first = route.segments[0];
    const last = route.segments.at(-1);
    if (first && last) {
      this.addEndpointMarker(first.displayStart || first.start, COLORS.start);
      this.addEndpointMarker(last.displayEnd || last.end, COLORS.end);
      this.addLabel(route.startTag || route.from_tag || 'Start', first.displayStart || first.start, 'route-viewer-label--endpoint');
      this.addLabel(route.endTag || route.to_tag || 'End', last.displayEnd || last.end, 'route-viewer-label--endpoint');
    }
    const gradeTransition = route.segments.find(segment => {
      const startZ = Number((segment.displayStart || segment.start)?.[2]);
      const endZ = Number((segment.displayEnd || segment.end)?.[2]);
      return Number.isFinite(startZ) && Number.isFinite(endZ) && startZ < 0 && endZ >= 0;
    });
    if (gradeTransition) {
      const start = gradeTransition.displayStart || gradeTransition.start;
      const end = gradeTransition.displayEnd || gradeTransition.end;
      const ratio = -start[2] / Math.max(end[2] - start[2], 1e-6);
      const point = [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
        3.4
      ];
      this.addLabel('GRADE TRANSITION · RISER TO TRAY', point, 'route-viewer-label--transition');
    }
    const highestUtilization = route.segments
      .map(segment => ({
        segment,
        utilization: this.model.racewayMap.get(segment.racewayId)?.utilizationPct || 0
      }))
      .sort((a, b) => b.utilization - a.utilization)[0];
    if (highestUtilization?.utilization > 0) {
      const midpoint = vector(highestUtilization.segment.displayStart || highestUtilization.segment.start)
        .add(vector(highestUtilization.segment.displayEnd || highestUtilization.segment.end))
        .multiplyScalar(0.5)
        .toArray();
      this.addLabel(`${highestUtilization.utilization.toFixed(0)}% fill`, midpoint, 'route-viewer-label--utilization');
    }
    const elevatedSegment = route.segments
      .filter(segment => segment.containmentType !== 'field' && segment.racewayId)
      .sort((a, b) => Math.max(b.start[2], b.end[2]) - Math.max(a.start[2], a.end[2]))[0];
    if (elevatedSegment) {
      const elevation = Math.max(elevatedSegment.start[2], elevatedSegment.end[2]);
      const point = vector(elevatedSegment.displayStart || elevatedSegment.start)
        .add(vector(elevatedSegment.displayEnd || elevatedSegment.end))
        .multiplyScalar(0.5)
        .toArray();
      point[2] += 4.5;
      this.addLabel(`${elevatedSegment.racewayId} · EL. ${elevation.toFixed(0)} ft`, point, 'route-viewer-label--elevation');
    }
    this.addPullEquipmentMarkers(route, index);
    if (focus) {
      const focusPoints = route.segments.flatMap(segment => [
        segment.displayStart || segment.start,
        segment.displayEnd || segment.end
      ]);
      const equipment = route.pull_check?.equipment || {};
      [
        ...(equipment.reels || []),
        ...(equipment.tuggers || []),
        ...(equipment.handPulls || []),
        ...(equipment.sheaves || [])
      ].forEach(item => {
        const point = this.displayPointForRoutePoint(route, item.point);
        if (point) focusPoints.push([point.x, point.y, Math.max(point.z, 0.35) + 3.2]);
      });
      this.fitPoints(focusPoints, 1.3);
    }
    if (emit) this.onSelect({ kind: 'route', routeIndex: index, route });
    this.drawMinimap();
    this.requestRender();
    this.updateDebugState();
  }

  selectRaceway(racewayId, { focus = true, emit = true } = {}) {
    const raceway = this.model.racewayMap.get(racewayId);
    if (!raceway) return;
    this.selectedRacewayId = racewayId;
    this.selectedRouteIndex = null;
    this.clearRouteOverlay();
    const material = makeMaterial(COLORS.route, { transparent: true, opacity: 0.98 });
    pathSegments(raceway.path).forEach(([start, end]) => {
      const radius = raceway.kind === 'conduit' ? Math.max(raceway.diameterIn / 20, 0.18) : 0.24;
      addOrientedCylinder(this.routeGroup, start, end, radius, material, {}, 12);
    });
    this.addLabel(`${raceway.id} · ${raceway.utilizationPct.toFixed(0)}%`, raceway.path[Math.floor(raceway.path.length / 2)], 'route-viewer-label--selected');
    if (focus) this.fitPoints(raceway.path);
    if (emit) this.onSelect({ kind: 'raceway', racewayId, raceway });
    this.requestRender();
    this.updateDebugState();
  }

  addDashedSegment(start, end, material, userData) {
    const transform = getSegmentTransform(start, end);
    if (!transform) return;
    const dash = 1.4;
    const gap = 0.9;
    for (let offset = 0; offset < transform.length; offset += dash + gap) {
      const dashStart = transform.start.clone().addScaledVector(transform.direction, offset);
      const dashEnd = transform.start.clone().addScaledVector(transform.direction, Math.min(offset + dash, transform.length));
      const mesh = addOrientedCylinder(this.routeGroup, dashStart.toArray(), dashEnd.toArray(), 0.18, material, userData, 9);
      if (mesh) this.selectable.push(mesh);
    }
  }

  addDirectionMarker(start, end, material) {
    const transform = getSegmentTransform(start, end);
    if (!transform || transform.length < 4) return;
    const geometry = new THREE.ConeGeometry(0.42, 1.05, 10);
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(transform.midpoint);
    marker.quaternion.setFromUnitVectors(Y_AXIS, transform.direction);
    this.routeGroup.add(marker);
  }

  addEndpointMarker(point, color) {
    const geometry = new THREE.SphereGeometry(0.48, 18, 12);
    const material = makeMaterial(color);
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(vector(point));
    this.routeGroup.add(marker);
  }

  displayPointForRoutePoint(route, sourcePoint) {
    if (!Array.isArray(sourcePoint)) return null;
    const rawPoint = vector(sourcePoint);
    const matchingSegment = route.segments.find(segment => {
      const start = vector(segment.start);
      const end = vector(segment.end);
      const segmentLength = start.distanceTo(end);
      return Math.abs(start.distanceTo(rawPoint) + rawPoint.distanceTo(end) - segmentLength) < 0.05;
    });
    const offset = matchingSegment
      ? vector(matchingSegment.displayStart || matchingSegment.start).sub(vector(matchingSegment.start))
      : new THREE.Vector3();
    return rawPoint.add(offset);
  }

  addReelMarker(route, routeIndex, reel) {
    const point = this.displayPointForRoutePoint(route, reel.point);
    if (!point) return;
    point.y -= 0.72;
    point.z = Math.max(point.z, 0.35);
    const group = new THREE.Group();
    group.userData = { layer: 'pullSetups', kind: 'pull-reel', routeIndex, equipmentIndex: reel.index, label: `Reel ${reel.index}` };
    const wheelMaterial = makeGlowMaterial(COLORS.reel, 0.98);
    const frameMaterial = makeMaterial(COLORS.reelDark, { roughness: 0.62, metalness: 0.18 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.14, 20), frameMaterial);
    pad.rotation.x = Math.PI / 2;
    pad.position.set(point.x, point.y, point.z + 0.07);
    group.add(pad);
    [-0.24, 0.24].forEach(yOffset => {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 8, 24), wheelMaterial);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(point.x, point.y + yOffset, point.z + 1.4);
      group.add(wheel);
    });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.7, 12), frameMaterial);
    hub.position.set(point.x, point.y, point.z + 1.4);
    group.add(hub);
    [
      [[point.x - 0.76, point.y, point.z + 0.14], [point.x - 0.44, point.y, point.z + 1.36]],
      [[point.x + 0.76, point.y, point.z + 0.14], [point.x + 0.44, point.y, point.z + 1.36]]
    ].forEach(([start, end]) => addOrientedCylinder(group, start, end, 0.09, frameMaterial, {}, 8));
    this.routeGroup.add(group);
    this.addLabel(
      `REEL ${reel.index} · ${Number(reel.distanceFromPullStart || 0).toFixed(0)} ft`,
      [point.x, point.y, point.z + 3.05],
      'route-viewer-label--reel',
      [point.x, point.y, point.z + 1.4]
    );
  }

  addTuggerMarker(route, routeIndex, tugger) {
    const point = this.displayPointForRoutePoint(route, tugger.point);
    if (!point) return;
    point.y += 0.82;
    point.z = Math.max(point.z, 0.35);
    const group = new THREE.Group();
    group.userData = { layer: 'pullSetups', kind: 'pull-tugger', routeIndex, equipmentIndex: tugger.index, label: `Tugger ${tugger.index}` };
    const bodyMaterial = makeMaterial(COLORS.tugger, { roughness: 0.45, metalness: 0.22 });
    const darkMaterial = makeMaterial(COLORS.tuggerDark, { roughness: 0.58, metalness: 0.24 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.15, 0.85), bodyMaterial);
    body.position.set(point.x, point.y, point.z + 0.62);
    group.add(body);
    const capstan = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.72, 18), darkMaterial);
    capstan.rotation.x = Math.PI / 2;
    capstan.position.set(point.x - 0.36, point.y - 0.64, point.z + 0.78);
    group.add(capstan);
    [-0.58, 0.58].forEach(xOffset => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 14), darkMaterial);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(point.x + xOffset, point.y, point.z + 0.2);
      group.add(wheel);
    });
    addOrientedCylinder(group, [point.x + 0.55, point.y, point.z + 1], [point.x + 1.15, point.y, point.z + 1.75], 0.1, darkMaterial, {}, 8);
    this.routeGroup.add(group);
    this.addLabel(
      `TUGGER ${tugger.index} · ${Number(tugger.requiredCapacityLbf || 0).toFixed(0)} lbf`,
      [point.x, point.y, point.z + 3.05],
      'route-viewer-label--tugger',
      [point.x, point.y, point.z + 0.75]
    );
  }

  addHandPullMarker(route, routeIndex, handPull) {
    const point = this.displayPointForRoutePoint(route, handPull.point);
    if (!point) return;
    point.y += 0.82;
    point.z = Math.max(point.z, 0.35);
    const group = new THREE.Group();
    group.userData = { layer: 'pullSetups', kind: 'pull-hand', routeIndex, equipmentIndex: handPull.index, label: `Pull ${handPull.index} by hand` };
    const markerMaterial = makeGlowMaterial(COLORS.handPull, 0.98);
    const darkMaterial = makeMaterial(COLORS.handPullDark, { roughness: 0.58, metalness: 0.12 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 24), darkMaterial);
    pad.rotation.x = Math.PI / 2;
    pad.position.set(point.x, point.y, point.z + 0.06);
    group.add(pad);
    [-0.3, 0.3].forEach((xOffset, personIndex) => {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), markerMaterial);
      head.position.set(point.x + xOffset, point.y, point.z + 1.35 + (personIndex * 0.08));
      group.add(head);
      addOrientedCylinder(
        group,
        [point.x + xOffset, point.y, point.z + 0.45],
        [point.x + xOffset, point.y, point.z + 1.16 + (personIndex * 0.08)],
        0.12,
        markerMaterial,
        {},
        10
      );
      addOrientedCylinder(
        group,
        [point.x + xOffset, point.y, point.z + 0.85],
        [point.x + 0.75, point.y - 0.45, point.z + 0.92],
        0.065,
        markerMaterial,
        {},
        8
      );
    });
    addOrientedCylinder(
      group,
      [point.x + 0.75, point.y - 0.45, point.z + 0.92],
      [point.x + 1.3, point.y - 0.72, point.z + 0.92],
      0.055,
      darkMaterial,
      {},
      8
    );
    this.routeGroup.add(group);
    this.addLabel(
      `PULL ${handPull.index} BY HAND · ${Number(handPull.sectionLengthFt || 0).toFixed(0)} ft / ${Number(handPull.requiredForceLbf || 0).toFixed(0)} lbf`,
      [point.x, point.y, point.z + 3.05],
      'route-viewer-label--hand',
      [point.x, point.y, point.z + 0.9]
    );
  }

  addSheaveMarker(route, routeIndex, sheave) {
    const point = this.displayPointForRoutePoint(route, sheave.point);
    if (!point) return;
    point.z = Math.max(point.z, 0.45);
    const group = new THREE.Group();
    group.userData = { layer: 'pullSetups', kind: 'pull-sheave', routeIndex, equipmentIndex: sheave.index, label: `Sheave ${sheave.index}` };
    const wheelMaterial = makeGlowMaterial(sheave.pass === false ? 0xdc2626 : COLORS.sheave, 0.98);
    const frameMaterial = makeMaterial(COLORS.sheaveDark, { roughness: 0.56, metalness: 0.2 });
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.14, 9, 24), wheelMaterial);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(point.x, point.y, point.z + 1.15);
    group.add(wheel);
    addOrientedCylinder(group, [point.x, point.y, point.z + 0.2], [point.x, point.y, point.z + 1.15], 0.09, frameMaterial, {}, 8);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.7, 0.16), frameMaterial);
    base.position.set(point.x, point.y, point.z + 0.12);
    group.add(base);
    this.routeGroup.add(group);
    this.addLabel(
      `SHEAVE S${sheave.index} · R ≥ ${Number(sheave.recommendedRadiusFt || 0).toFixed(1)} ft`,
      [point.x, point.y, point.z + 2.75],
      'route-viewer-label--sheave',
      [point.x, point.y, point.z + 1.15]
    );
  }

  addRollerMarker(route, routeIndex, roller) {
    const point = this.displayPointForRoutePoint(route, roller.point);
    if (!point) return;
    const group = new THREE.Group();
    group.userData = { layer: 'pullSetups', kind: 'pull-roller', routeIndex, equipmentIndex: roller.index, label: `Tray roller ${roller.index}` };
    const rollerMaterial = makeMaterial(COLORS.roller, { roughness: 0.5, metalness: 0.35 });
    const rollerMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.85, 10), rollerMaterial);
    rollerMesh.rotation.x = Math.PI / 2;
    rollerMesh.position.set(point.x, point.y, point.z + 0.28);
    group.add(rollerMesh);
    this.routeGroup.add(group);
  }

  addPullEquipmentMarkers(route, routeIndex) {
    if (!this.layerVisibility.pullSetups) return;
    const equipment = route.pull_check?.equipment || {};
    (equipment.rollers || []).forEach(roller => this.addRollerMarker(route, routeIndex, roller));
    (equipment.sheaves || []).forEach(sheave => this.addSheaveMarker(route, routeIndex, sheave));
    (equipment.reels || []).forEach(reel => this.addReelMarker(route, routeIndex, reel));
    (equipment.tuggers || []).forEach(tugger => this.addTuggerMarker(route, routeIndex, tugger));
    (equipment.handPulls || []).forEach(handPull => this.addHandPullMarker(route, routeIndex, handPull));
  }

  addLabel(text, point, className = '', anchorPoint = null) {
    if (!this.layerVisibility.labels) return;
    const element = document.createElement('span');
    element.className = `route-viewer-label ${className}`.trim();
    element.textContent = text;
    this.overlay.appendChild(element);
    const leaderKind = className.includes('--reel')
      ? 'reel'
      : className.includes('--tugger')
        ? 'tugger'
        : className.includes('--hand')
          ? 'hand'
        : className.includes('--sheave')
          ? 'sheave'
          : '';
    let leaderGroup = null;
    let leaderHalo = null;
    let leaderLine = null;
    let leaderDot = null;
    if (leaderKind) {
      leaderGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      leaderGroup.classList.add('route-viewer-label-leader', `route-viewer-label-leader--${leaderKind}`);
      leaderHalo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      leaderHalo.classList.add('route-viewer-label-leader-halo');
      leaderLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      leaderLine.classList.add('route-viewer-label-leader-line');
      leaderDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      leaderDot.classList.add('route-viewer-label-leader-dot');
      leaderDot.setAttribute('r', '3.5');
      leaderGroup.append(leaderHalo, leaderLine, leaderDot);
      this.leaderLayer.appendChild(leaderGroup);
    }
    this.labels.push({
      element,
      point: vector(point),
      anchorPoint: vector(anchorPoint || point),
      leaderGroup,
      leaderHalo,
      leaderLine,
      leaderDot
    });
  }

  clearLabels() {
    this.labels.forEach(label => {
      label.element.remove();
      label.leaderGroup?.remove();
    });
    this.labels = [];
  }

  updateLabels() {
    if (!this.labels.length) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.leaderLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const occupied = [];
    this.labels.forEach(label => {
      const projected = label.point.clone().project(this.camera);
      const visible = projected.z > -1 && projected.z < 1;
      if (!visible) {
        label.element.hidden = true;
        if (label.leaderGroup) label.leaderGroup.style.display = 'none';
        return;
      }
      label.element.hidden = false;
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const isElevation = label.element.classList.contains('route-viewer-label--elevation');
      const isTransition = label.element.classList.contains('route-viewer-label--transition');
      const isReel = label.element.classList.contains('route-viewer-label--reel');
      const isTugger = label.element.classList.contains('route-viewer-label--tugger');
      const isHand = label.element.classList.contains('route-viewer-label--hand');
      const isSheave = label.element.classList.contains('route-viewer-label--sheave');
      const isPullEquipment = isReel || isTugger || isHand || isSheave;
      const isCallout = isElevation || isTransition || isPullEquipment;
      let displayX = x + (isTransition ? 58 : isElevation ? 52 : isTugger ? -82 : isHand ? -68 : isReel ? 78 : isSheave ? 38 : 0);
      let displayY = y - (isTransition ? 16 : isElevation ? 42 : isPullEquipment ? 28 : 0);
      const halfWidth = Math.max(label.element.offsetWidth / 2, 60);
      const labelHeight = Math.max(label.element.offsetHeight, 24);
      const clampToViewport = () => {
        displayX = Math.max(halfWidth + 8, Math.min(width - halfWidth - 8, displayX));
        displayY = Math.max(labelHeight + 10, Math.min(height - 8, displayY));
      };
      clampToViewport();
      const setPosition = () => {
        label.element.style.transform = `translate(-50%, -115%) translate(${displayX}px, ${displayY}px)`;
      };
      const measureBox = () => {
        const rect = label.element.getBoundingClientRect();
        return {
          left: rect.left - 5,
          right: rect.right + 5,
          top: rect.top - 5,
          bottom: rect.bottom + 5
        };
      };
      const hasOverlap = box => occupied.some(other => !(
        box.right < other.left || box.left > other.right || box.bottom < other.top || box.top > other.bottom
      ));
      setPosition();
      let box = measureBox();
      if (isCallout && hasOverlap(box)) {
        const originX = displayX;
        const originY = displayY;
        const verticalStep = labelHeight + 12;
        const horizontalStep = halfWidth + 20;
        const candidateOffsets = [];
        for (let distance = 1; distance <= 6; distance += 1) {
          candidateOffsets.push(
            [0, -verticalStep * distance],
            [0, verticalStep * distance],
            [horizontalStep, -verticalStep * distance],
            [horizontalStep, verticalStep * distance],
            [-horizontalStep, -verticalStep * distance],
            [-horizontalStep, verticalStep * distance]
          );
        }
        for (const [offsetX, offsetY] of candidateOffsets) {
          displayX = originX + offsetX;
          displayY = originY + offsetY;
          clampToViewport();
          setPosition();
          box = measureBox();
          if (!hasOverlap(box)) break;
        }
      }
      label.element.hidden = hasOverlap(box);
      if (!label.element.hidden) occupied.push(box);
      if (!label.leaderGroup) return;
      const anchorProjected = label.anchorPoint.clone().project(this.camera);
      const anchorVisible = anchorProjected.z > -1 && anchorProjected.z < 1;
      if (label.element.hidden || !anchorVisible) {
        label.leaderGroup.style.display = 'none';
        return;
      }
      const anchorX = (anchorProjected.x * 0.5 + 0.5) * width;
      const anchorY = (-anchorProjected.y * 0.5 + 0.5) * height;
      const containerRect = this.container.getBoundingClientRect();
      const labelRect = label.element.getBoundingClientRect();
      const labelLeft = labelRect.left - containerRect.left;
      const labelRight = labelRect.right - containerRect.left;
      const labelTop = labelRect.top - containerRect.top;
      const labelBottom = labelRect.bottom - containerRect.top;
      const endX = Math.max(labelLeft, Math.min(labelRight, anchorX));
      const endY = Math.max(labelTop, Math.min(labelBottom, anchorY));
      const path = `M ${anchorX.toFixed(1)} ${anchorY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}`;
      label.leaderHalo.setAttribute('d', path);
      label.leaderLine.setAttribute('d', path);
      label.leaderDot.setAttribute('cx', anchorX.toFixed(1));
      label.leaderDot.setAttribute('cy', anchorY.toFixed(1));
      label.leaderGroup.style.display = '';
    });
  }

  updateElevationScale() {
    const levels = [...new Set([
      0,
      ...this.model.raceways.flatMap(raceway => raceway.path.map(point => Math.round(point[2])))
    ])]
      .sort((a, b) => b - a)
      .filter((level, index, array) => level === 0 || index < 5);
    this.elevationScale.replaceChildren();
    levels.forEach(level => {
      const label = document.createElement('span');
      label.textContent = level === 0 ? 'GRADE · 0 ft' : `${level} ft`;
      label.classList.toggle('is-grade', level === 0);
      this.elevationScale.appendChild(label);
    });
  }

  drawMinimap() {
    const context = this.minimap.getContext('2d');
    const width = this.minimap.width;
    const height = this.minimap.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(255,255,255,0.94)';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#475569';
    context.font = '700 12px Inter, sans-serif';
    context.fillText('Plan overview', 10, 17);
    const visibleRaceways = this.visibleRaceways();
    const points = visibleRaceways.flatMap(raceway => raceway.path);
    if (!points.length) return;
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const project = point => [
      12 + ((point[0] - minX) / Math.max(maxX - minX, 1)) * (width - 24),
      26 + (1 - ((point[1] - minY) / Math.max(maxY - minY, 1))) * (height - 38)
    ];
    context.lineCap = 'round';
    context.lineJoin = 'round';
    visibleRaceways.forEach(raceway => {
      context.strokeStyle = hexColor(racewayClassColor(raceway.allowedGroup, COLORS[raceway.kind]));
      context.lineWidth = raceway.kind === 'ductbank' ? 4 : 2;
      context.beginPath();
      raceway.path.forEach((point, index) => {
        const [x, y] = project(point);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    });
    const route = this.model.routes[this.selectedRouteIndex];
    if (route) {
      context.strokeStyle = '#0284c7';
      context.lineWidth = 4;
      context.beginPath();
      route.segments.forEach((segment, index) => {
        const [sx, sy] = project(segment.displayStart || segment.start);
        const [ex, ey] = project(segment.displayEnd || segment.end);
        if (index === 0) context.moveTo(sx, sy);
        context.lineTo(ex, ey);
      });
      context.stroke();
    }
  }

  pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.selectable.filter(object => object.visible), false)
      .find(intersection => intersection.object.userData?.selectable);
  }

  handlePointerUp(event) {
    if (this.pointerDown && Math.hypot(event.clientX - this.pointerDown[0], event.clientY - this.pointerDown[1]) > 5) return;
    const intersection = this.pick(event);
    const data = intersection?.object?.userData;
    if (data?.kind === 'route') this.selectRoute(Number(data.routeIndex));
    if (data?.kind === 'raceway') this.selectRaceway(data.racewayId);
  }

  handlePointerMove(event) {
    const intersection = this.pick(event);
    const data = intersection?.object?.userData;
    if (!data) {
      this.hideTooltip();
      this.canvas.style.cursor = '';
      return;
    }
    this.canvas.style.cursor = 'pointer';
    const description = data.kind === 'raceway'
      ? `${data.label}<small>${data.racewayKind} · ${Number(data.utilizationPct || 0).toFixed(0)}% utilized${data.routeCount ? ` · ${data.routeCount} route${data.routeCount === 1 ? '' : 's'}` : ''}${data.geometrySource === 'inferred-arrangement' ? ' · inferred arrangement' : ''}</small>`
      : `${data.label}<small>${data.containmentType || 'route'} segment</small>`;
    this.tooltip.innerHTML = data.kind === 'raceway'
      ? `${data.label}<small>${data.racewayKind} &middot; ${data.allowedGroup || 'OPEN'} cable class &middot; ${Number(data.utilizationPct || 0).toFixed(0)}% utilized${data.routeCount ? ` &middot; ${data.routeCount} route${data.routeCount === 1 ? '' : 's'}` : ''}${data.geometrySource === 'inferred-arrangement' ? ' &middot; inferred arrangement' : ''}</small>`
      : description;
    this.tooltip.style.left = `${event.offsetX + 14}px`;
    this.tooltip.style.top = `${event.offsetY + 14}px`;
    this.tooltip.hidden = false;
  }

  hideTooltip() {
    this.tooltip.hidden = true;
  }

  racewayMatchesFilter(raceway) {
    if (!raceway || this.racewayFilter === 'all') return true;
    const racewayGroup = normalizedCableGroup(raceway.allowedGroup);
    if (this.racewayFilter === 'compatible') {
      return !this.selectedCableGroup || !racewayGroup || racewayGroup === this.selectedCableGroup;
    }
    if (this.racewayFilter.startsWith('group:')) {
      return racewayGroup === normalizedCableGroup(this.racewayFilter.slice(6));
    }
    return true;
  }

  isRacewayVisible(raceway) {
    return this.layerVisibility[raceway?.kind] !== false && this.racewayMatchesFilter(raceway);
  }

  visibleRaceways() {
    return this.model.raceways.filter(raceway => this.isRacewayVisible(raceway));
  }

  updateRacewayVisibility() {
    this.staticGroup.children.forEach(child => {
      const raceway = this.model.racewayMap.get(child.userData.racewayId);
      child.visible = this.isRacewayVisible(raceway);
    });
    this.drawMinimap();
    this.requestRender();
    this.updateDebugState();
  }

  setRacewayFilter(filter) {
    const normalized = String(filter || 'compatible').trim();
    this.racewayFilter = normalized === 'all' || normalized === 'compatible' || normalized.startsWith('group:')
      ? normalized
      : 'compatible';
    this.updateRacewayVisibility();
  }

  setSelectedCableGroup(group) {
    this.selectedCableGroup = normalizedCableGroup(group);
    this.updateRacewayVisibility();
  }

  getRacewayFilterSummary() {
    const classCounts = {};
    this.model.raceways.forEach(raceway => {
      const group = raceway.allowedGroup || 'OPEN';
      classCounts[group] = (classCounts[group] || 0) + 1;
    });
    return {
      mode: this.racewayFilter,
      selectedCableGroup: this.selectedCableGroup,
      visibleCount: this.visibleRaceways().length,
      totalCount: this.model.raceways.length,
      classCounts,
      classColors: Object.fromEntries(Object.keys(classCounts).map(group => [
        group,
        hexColor(racewayClassColor(group === 'OPEN' ? '' : group, COLORS.tray))
      ]))
    };
  }

  setLayerVisibility(layer, visible) {
    this.layerVisibility[layer] = Boolean(visible);
    if (['tray', 'conduit', 'ductbank'].includes(layer)) this.updateRacewayVisibility();
    else this.contextGroup.children.forEach(child => {
      if (child.userData.layer === layer) child.visible = Boolean(visible);
    });
    if (layer === 'labels') {
      if (!visible) this.clearLabels();
      else if (this.selectedRouteIndex != null) this.selectRoute(this.selectedRouteIndex, { focus: false, emit: false });
    }
    if (['field', 'pullSetups'].includes(layer) && this.selectedRouteIndex != null) {
      this.selectRoute(this.selectedRouteIndex, { focus: false, emit: false });
    }
    this.requestRender();
    this.updateDebugState();
  }

  setContextDensity(density) {
    const nextDensity = ['low', 'medium', 'high'].includes(density) ? density : 'medium';
    if (nextDensity === this.contextDensity) return;
    this.contextDensity = nextDensity;
    this.rebuildScene();
    if (this.selectedRouteIndex != null) this.selectRoute(this.selectedRouteIndex, { focus: false, emit: false });
    this.requestRender();
    this.updateDebugState();
  }

  setHeatmap(enabled) {
    this.heatmapEnabled = Boolean(enabled);
    this.rebuildScene();
    if (this.selectedRouteIndex != null) this.selectRoute(this.selectedRouteIndex, { focus: false, emit: false });
  }

  fitAll() {
    const points = this.visibleRaceways().flatMap(raceway => raceway.path);
    if (points.length) this.fitPoints(points, 1.3);
  }

  fitPoints(points, padding = 1.55) {
    const validPoints = points.map(vector);
    if (!validPoints.length) return;
    const bounds = new THREE.Box3().setFromPoints(validPoints);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 8);
    const direction = new THREE.Vector3(1.35, -1.55, 0.88).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, radius * padding * 1.9);
    this.camera.near = Math.max(radius / 1000, 0.05);
    this.camera.far = Math.max(radius * 50, 2000);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }

  setView(viewName) {
    const points = this.visibleRaceways().flatMap(raceway => raceway.path);
    const bounds = points.length
      ? new THREE.Box3().setFromPoints(points.map(vector))
      : new THREE.Box3(new THREE.Vector3(-10, -10, 0), new THREE.Vector3(10, 10, 20));
    const center = bounds.getCenter(new THREE.Vector3());
    const size = Math.max(bounds.getSize(new THREE.Vector3()).length(), 30);
    const directions = {
      isometric: new THREE.Vector3(1.2, -1.45, 1.05),
      plan: new THREE.Vector3(0, 0, 1),
      front: new THREE.Vector3(0, -1, 0.08),
      right: new THREE.Vector3(1, 0, 0.08)
    };
    const direction = (directions[viewName] || directions.isometric).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, size * 1.25);
    this.camera.up.set(0, 0, 1);
    if (viewName === 'plan') this.camera.up.set(0, 1, 0);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
    this.currentView = viewName;
    this.updateDebugState();
  }

  resize() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const targetWidth = Math.round(width * this.renderer.getPixelRatio());
    const targetHeight = Math.round(height * this.renderer.getPixelRatio());
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.requestRender();
    }
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.updateLabels();
      this.updateDebugState();
    });
  }

  exportPNG(filename = 'optimal-route-model.png') {
    this.renderer.render(this.scene, this.camera);
    const anchor = document.createElement('a');
    anchor.href = this.canvas.toDataURL('image/png');
    anchor.download = filename;
    anchor.click();
  }

  async openFullscreen() {
    if (this.container.requestFullscreen) await this.container.requestFullscreen();
  }

  updateDebugState() {
    const racewayKinds = this.model.raceways.reduce((counts, raceway) => {
      counts[raceway.kind] = (counts[raceway.kind] || 0) + 1;
      return counts;
    }, {});
    globalThis.__routeViewerDebug = {
      engine: 'three',
      racewayCount: this.model.raceways.length,
      racewayKinds,
      inferredGeometryCount: this.model.raceways.filter(raceway => raceway.geometrySource === 'inferred-arrangement').length,
      routeCount: this.model.routes.length,
      selectedRouteIndex: this.selectedRouteIndex,
      selectedRacewayId: this.selectedRacewayId,
      currentView: this.currentView || 'isometric',
      layerVisibility: { ...this.layerVisibility },
      racewayFilter: this.getRacewayFilterSummary(),
      contextDensity: this.contextDensity,
      facilityContext: {
        floors: this.contextGroup.children.filter(child => child.userData.kind === 'facility-floor').length,
        floorElevations: this.contextGroup.children
          .filter(child => child.userData.kind === 'facility-floor')
          .map(child => Number(child.userData.elevation.toFixed(1))),
        columns: this.contextGroup.children.filter(child => child.userData.kind === 'facility-column').length,
        equipment: this.contextGroup.children.filter(child => child.userData.kind === 'facility-equipment').length,
        traySupports: this.contextGroup.children.filter(child => child.userData.kind === 'tray-support').length
      },
      gradePlane: {
        elevation: 0,
        visible: this.layerVisibility.context,
        objectCount: this.contextGroup.children.filter(child => child.userData.kind?.startsWith('grade-')).length,
        transitionCount: this.contextGroup.children.filter(child => child.userData.kind === 'grade-transition').length
      },
      pullSetups: {
        visible: this.layerVisibility.pullSetups,
        count: this.routeGroup.children.filter(child => String(child.userData.kind || '').startsWith('pull-')).length
      },
      pullEquipment: {
        visible: this.layerVisibility.pullSetups,
        reels: this.routeGroup.children.filter(child => child.userData.kind === 'pull-reel').length,
        tuggers: this.routeGroup.children.filter(child => child.userData.kind === 'pull-tugger').length,
        handPulls: this.routeGroup.children.filter(child => child.userData.kind === 'pull-hand').length,
        sheaves: this.routeGroup.children.filter(child => child.userData.kind === 'pull-sheave').length,
        rollers: this.routeGroup.children.filter(child => child.userData.kind === 'pull-roller').length
      },
      render: this.renderer ? { ...this.renderer.info.render } : {}
    };
  }

  dispose() {
    this.resizeObserver.disconnect();
    if (this.frame) cancelAnimationFrame(this.frame);
    disposeObject(this.staticGroup);
    disposeObject(this.contextGroup);
    disposeObject(this.routeGroup);
    this.controls.dispose();
    this.renderer.dispose();
    this.container.replaceChildren();
    this.container.classList.remove('route-viewer-three');
    delete globalThis.__routeViewerDebug;
  }
}

export function createRouteViewer3D(options) {
  return new RouteViewer3D(options);
}
