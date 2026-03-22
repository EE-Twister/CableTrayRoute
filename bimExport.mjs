/**
 * BIM Export helpers — Revit-friendly JSON and IFC4 file generation.
 *
 * IFC4 entities generated:
 *   IfcProject, IfcSite, IfcBuilding, IfcBuildingStorey
 *   IfcCableSegment  — for each cable (routed conductor run)
 *   IfcCableTray     — for each cable tray segment
 *   IfcCartesianPoint, IfcPolyline, IfcShapeRepresentation
 *
 * References:
 *   IFC4 ADD2 TC1 schema — buildingSMART International
 *   IEC 61537:2023 §3 — Cable tray systems definitions
 */

import { Drawing } from './exporters/simpleDxf.js';

// ---------------------------------------------------------------------------
// Revit-friendly JSON export (unchanged)
// ---------------------------------------------------------------------------

export function exportRevitJSON(panels = [], cables = []) {
  const blob = new Blob([JSON.stringify({ panels, cables }, null, 2)], {
    type: 'application/json'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bim.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------------
// IFC4 builder
// ---------------------------------------------------------------------------

/**
 * Build a complete IFC4 STEP-Physical-File string from tray and cable data.
 *
 * @param {object[]} panels  - Panel schedule rows (unused in geometry; included as IfcElectricDistributionBoard stubs)
 * @param {object[]} cables  - Cable schedule rows with optional from/to coordinates
 * @param {object[]} trays   - Raceway schedule tray rows with start/end XYZ and width/depth
 * @returns {string}  IFC4 file content
 */
export function buildIFC(panels = [], cables = [], trays = []) {
  let id = 1;
  const next = () => `#${id++}`;

  // Shared owner history (required by IFC4)
  const ownerHistoryId  = next();  // #1
  const personId        = next();  // #2
  const orgId           = next();  // #3
  const personAndOrgId  = next();  // #4
  const appId           = next();  // #5
  const ownerHistoryRef = ownerHistoryId;

  // Spatial hierarchy
  const projectId   = next();
  const siteId      = next();
  const buildingId  = next();
  const storeyId    = next();

  // World coordinate system
  const wcsOriginId = next();
  const wcsAxisZId  = next();
  const wcsAxisXId  = next();
  const wcsId       = next();
  const geoCtxId    = next();
  const unitAssignId= next();
  const lengthUnitId= next();

  // Collect entity lines
  const lines = [];

  // --- Metadata ---
  const now = new Date().toISOString().replace(/\.\d+Z$/, '');
  lines.push('ISO-10303-21;');
  lines.push('HEADER;');
  lines.push(`FILE_DESCRIPTION(('CableTrayRoute IFC4 Export','ViewDefinition [CoordinationView]'),'2;1');`);
  lines.push(`FILE_NAME('cabletray.ifc','${now}',(''),(''),'CableTrayRoute','IFC4', '');`);
  lines.push(`FILE_SCHEMA(('IFC4'));`);
  lines.push('ENDSEC;');
  lines.push('DATA;');

  // --- Owner history ---
  lines.push(`${personId}=IFCPERSON($,'CableTrayRoute',$,$,$,$,$,$);`);
  lines.push(`${orgId}=IFCORGANIZATION($,'CableTrayRoute',$,$,$);`);
  lines.push(`${personAndOrgId}=IFCPERSONANDORGANIZATION(${personId},${orgId},$);`);
  lines.push(`${appId}=IFCAPPLICATION(${orgId},'2026','CableTrayRoute','CTR');`);
  lines.push(`${ownerHistoryId}=IFCOWNERHISTORY(${personAndOrgId},${appId},$,.NOTDEFINED.,$,${personAndOrgId},${appId},$);`);

  // --- Units (SI: metres) ---
  lines.push(`${lengthUnitId}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
  lines.push(`${unitAssignId}=IFCUNITASSIGNMENT((${lengthUnitId}));`);

  // --- World coordinate system ---
  lines.push(`${wcsOriginId}=IFCCARTESIANPOINT((0.,0.,0.));`);
  lines.push(`${wcsAxisZId}=IFCDIRECTION((0.,0.,1.));`);
  lines.push(`${wcsAxisXId}=IFCDIRECTION((1.,0.,0.));`);
  lines.push(`${wcsId}=IFCAXIS2PLACEMENT3D(${wcsOriginId},${wcsAxisZId},${wcsAxisXId});`);
  lines.push(`${geoCtxId}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${wcsId},$);`);

  // --- Project ---
  lines.push(`${projectId}=IFCPROJECT('CTR-PROJ-01',${ownerHistoryRef},'CableTrayRoute Project',$,$,$,$,(${geoCtxId}),${unitAssignId});`);

  // --- Site ---
  const siteLocId  = next();
  const sitePlaceId = next();
  lines.push(`${siteLocId}=IFCCARTESIANPOINT((0.,0.,0.));`);
  lines.push(`${sitePlaceId}=IFCAXIS2PLACEMENT3D(${siteLocId},$,$);`);
  const siteLocalPlaceId = next();
  lines.push(`${siteLocalPlaceId}=IFCLOCALPLACEMENT($,${sitePlaceId});`);
  lines.push(`${siteId}=IFCSITE('CTR-SITE-01',${ownerHistoryRef},'Site',$,$,${siteLocalPlaceId},$,$,.ELEMENT.,$,$,$,$,$);`);

  // --- Building ---
  const bldgPlaceId = next();
  const bldgAxisId  = next();
  lines.push(`${bldgAxisId}=IFCCARTESIANPOINT((0.,0.,0.));`);
  lines.push(`${bldgPlaceId}=IFCAXIS2PLACEMENT3D(${bldgAxisId},$,$);`);
  const bldgLocalPlaceId = next();
  lines.push(`${bldgLocalPlaceId}=IFCLOCALPLACEMENT(${siteLocalPlaceId},${bldgPlaceId});`);
  lines.push(`${buildingId}=IFCBUILDING('CTR-BLDG-01',${ownerHistoryRef},'Building',$,$,${bldgLocalPlaceId},$,$,.ELEMENT.,$,$,$);`);

  // --- Storey ---
  const storeyAxisId  = next();
  const storeyPlaceId = next();
  lines.push(`${storeyAxisId}=IFCCARTESIANPOINT((0.,0.,0.));`);
  lines.push(`${storeyPlaceId}=IFCAXIS2PLACEMENT3D(${storeyAxisId},$,$);`);
  const storeyLocalPlaceId = next();
  lines.push(`${storeyLocalPlaceId}=IFCLOCALPLACEMENT(${bldgLocalPlaceId},${storeyPlaceId});`);
  lines.push(`${storeyId}=IFCBUILDINGSTOREY('CTR-STR-01',${ownerHistoryRef},'Ground Floor',$,$,${storeyLocalPlaceId},$,$,.ELEMENT.,0.);`);

  // --- Spatial containment relationships ---
  const relSiteId = next();
  lines.push(`${relSiteId}=IFCRELAGGREGATES('CTR-REL-SITE',${ownerHistoryRef},$,$,${projectId},(${siteId}));`);
  const relBldgId = next();
  lines.push(`${relBldgId}=IFCRELAGGREGATES('CTR-REL-BLDG',${ownerHistoryRef},$,$,${siteId},(${buildingId}));`);
  const relStoreyId = next();
  lines.push(`${relStoreyId}=IFCRELAGGREGATES('CTR-REL-STRY',${ownerHistoryRef},$,$,${buildingId},(${storeyId}));`);

  // Collect storey-contained element IDs
  const storeyElements = [];

  // ---- Helper: metres conversion (project data is in feet) ----
  const ftToM = v => (parseFloat(v) || 0) * 0.3048;

  // ---- Helper: polyline representation for a segment ----
  function addPolylineRep(x0, y0, z0, x1, y1, z1) {
    const ptA = next();
    const ptB = next();
    const polyId = next();
    const shapeId = next();
    const repId   = next();
    lines.push(`${ptA}=IFCCARTESIANPOINT((${ftToM(x0).toFixed(4)},${ftToM(y0).toFixed(4)},${ftToM(z0).toFixed(4)}));`);
    lines.push(`${ptB}=IFCCARTESIANPOINT((${ftToM(x1).toFixed(4)},${ftToM(y1).toFixed(4)},${ftToM(z1).toFixed(4)}));`);
    lines.push(`${polyId}=IFCPOLYLINE((${ptA},${ptB}));`);
    lines.push(`${shapeId}=IFCSHAPEREPRESENTATION(${geoCtxId},'Axis','Curve3D',(${polyId}));`);
    lines.push(`${repId}=IFCPRODUCTDEFINITIONSHAPE($,$,(${shapeId}));`);
    return repId;
  }

  // ---- Helper: local placement at a point ----
  function addLocalPlacement(x, y, z, parentPlaceId) {
    const ptId  = next();
    const axId  = next();
    const locId = next();
    lines.push(`${ptId}=IFCCARTESIANPOINT((${ftToM(x).toFixed(4)},${ftToM(y).toFixed(4)},${ftToM(z).toFixed(4)}));`);
    lines.push(`${axId}=IFCAXIS2PLACEMENT3D(${ptId},$,$);`);
    lines.push(`${locId}=IFCLOCALPLACEMENT(${parentPlaceId},${axId});`);
    return locId;
  }

  // ---------------------------------------------------------------------------
  // IfcCableTray — one per tray row
  // ---------------------------------------------------------------------------
  let trayIdx = 0;
  for (const tray of trays) {
    const guid = `CTR-TRAY-${String(trayIdx + 1).padStart(4, '0')}`;
    const tag  = tray.tray_id || tray.id || guid;
    const x0 = tray.start_x ?? 0, y0 = tray.start_y ?? 0, z0 = tray.start_z ?? 0;
    const x1 = tray.end_x   ?? 0, y1 = tray.end_y   ?? 0, z1 = tray.end_z   ?? 0;

    const placeId  = addLocalPlacement(x0, y0, z0, storeyLocalPlaceId);
    const repId    = addPolylineRep(x0, y0, z0, x1, y1, z1);
    const trayEId  = next();
    const w = (parseFloat(tray.inside_width) || 12) / 12; // inches → feet
    const d = (parseFloat(tray.tray_depth)   || 4)  / 12;
    lines.push(`${trayEId}=IFCCABLETRAY('${guid}',${ownerHistoryRef},'${tag}','${tray.tray_type || 'Ladder'}','W=${(w*0.3048).toFixed(3)}m D=${(d*0.3048).toFixed(3)}m',${placeId},${repId},$,.CABLETRAY.);`);
    storeyElements.push(trayEId);
    trayIdx++;
  }

  // ---------------------------------------------------------------------------
  // IfcCableSegment — one per cable row
  // ---------------------------------------------------------------------------
  let cableIdx = 0;
  for (const cable of cables) {
    const guid = `CTR-CABLE-${String(cableIdx + 1).padStart(4, '0')}`;
    const tag  = cable.id || cable.tag || cable.cable_id || guid;
    // Cables may not have coordinates; fall back to 0,0,0 → 0,0,1
    const x0 = cable.from_x ?? cable.start_x ?? 0;
    const y0 = cable.from_y ?? cable.start_y ?? 0;
    const z0 = cable.from_z ?? cable.start_z ?? 0;
    const x1 = cable.to_x   ?? cable.end_x   ?? 0;
    const y1 = cable.to_y   ?? cable.end_y   ?? 0;
    const z1 = cable.to_z   ?? cable.end_z   ?? 1;

    const placeId  = addLocalPlacement(x0, y0, z0, storeyLocalPlaceId);
    const repId    = addPolylineRep(x0, y0, z0, x1, y1, z1);
    const cableEId = next();
    const desc = [cable.conductor_size, cable.insulation_type, cable.voltage_rating].filter(Boolean).join(' ');
    lines.push(`${cableEId}=IFCCABLESEGMENT('${guid}',${ownerHistoryRef},'${tag}','${desc || 'Cable'}',$,${placeId},${repId},$,.CABLESEGMENT.);`);
    storeyElements.push(cableEId);
    cableIdx++;
  }

  // ---------------------------------------------------------------------------
  // IfcRelContainedInSpatialStructure — link all elements to storey
  // ---------------------------------------------------------------------------
  if (storeyElements.length > 0) {
    const relContainId = next();
    lines.push(`${relContainId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('CTR-REL-CONTAIN',${ownerHistoryRef},$,$,(${storeyElements.join(',')}),${storeyId});`);
  }

  lines.push('ENDSEC;');
  lines.push('END-ISO-10303-21;');
  return lines.join('\n');
}

export function exportIFC(panels = [], cables = [], trays = []) {
  const content = buildIFC(panels, cables, trays);
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cabletray.ifc';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------------
// DXF route export (unchanged)
// ---------------------------------------------------------------------------

export function exportRoutesDXF(routes = []) {
  const d = new Drawing();
  routes.forEach(r => {
    (r.segments || []).forEach(seg => {
      const s = seg.start || [0,0,0];
      const e = seg.end || [0,0,0];
      d.drawLine3d(s[0], s[1], s[2], e[0], e[1], e[2]);
    });
  });
  const blob = new Blob([d.toDxfString()], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'routes.dxf';
  a.click();
  URL.revokeObjectURL(a.href);
}
