import { CONDUIT_SPECS } from './thermalPrimitives.js';

// Ductbank input review model: identifier normalization, duplicate detection,
// conduit fill limits, and the issue list (missing data, duplicates, assignment,
// fill, thermal, and ampacity alerts) shown in the ductbank workflow panel.
// Pure: callers pass the conduit/cable rows, fill results, and solver alerts.

export function normalizeDuctbankId(value){
 return String(value || '').trim();
}

export function duplicateValues(values){
 const counts=new Map();
 values.map(normalizeDuctbankId).filter(Boolean).forEach(value=>{
   counts.set(value,(counts.get(value)||0)+1);
 });
 return new Set(Array.from(counts.entries()).filter(([,count])=>count>1).map(([value])=>value));
}

export function conduitFillLimit(cableCount){
 if(cableCount===1) return 53;
 if(cableCount===2) return 31;
 return 40;
}

export function defaultDuctbankIssueDetails(issue){
 const defaults={
   missing:{severity:'Missing Data',field:issue.table==='conduit'?'conduit_id':'tag',fix:'Complete the highlighted required field.'},
   duplicate:{severity:'Duplicate',field:issue.table==='conduit'?'conduit_id':'tag',fix:'Rename the duplicate value so each row has a unique identifier.'},
   assignment:{severity:'Assignment',field:'conduit_id',fix:'Assign the cable to an existing conduit.'},
   fill:{severity:'Fill',field:'conduit_id',fix:'Move cables to another conduit or increase the conduit size.'},
   thermal:{severity:'Thermal',field:'est_load',fix:'Reduce load, increase spacing, or review soil and thermal inputs.'},
   ampacity:{severity:'Ampacity',field:'est_load',fix:'Reduce load, increase conductor size, or review ampacity assumptions.'}
 };
 return defaults[issue.code] || {severity:'Review',field:null,fix:'Review this row before exporting.'};
}

export function addDuctbankIssue(context, issue){
 const normalized={...defaultDuctbankIssueDetails(issue),...issue};
 context.issues.push(normalized);
 const target=normalized.table==='conduit' ? context.conduitIssuesByRow : context.cableIssuesByRow;
 const list=target.get(normalized.row) || [];
 list.push(normalized);
 target.set(normalized.row,list);
}

export function buildDuctbankIssueContext({ conduits=[], cables=[], fillMap={}, conduitOverLimit={}, cableOverLimit={} }={}){
 const context={
   conduits,
   cables,
   issues:[],
   conduitIssuesByRow:new Map(),
   cableIssuesByRow:new Map(),
   conduitIds:new Set(conduits.map(c=>normalizeDuctbankId(c.conduit_id)).filter(Boolean)),
   cableCountByConduit:new Map(),
   fillMap,
   fillWarningConduits:new Set(),
   thermalConduits:new Set(),
   ampacityConduits:new Set(),
   ampacityCables:new Set()
 };
 conduits.forEach(c=>context.cableCountByConduit.set(normalizeDuctbankId(c.conduit_id),0));
 cables.forEach(c=>{
   const cid=normalizeDuctbankId(c.conduit_id);
   if(cid) context.cableCountByConduit.set(cid,(context.cableCountByConduit.get(cid)||0)+1);
 });
 const duplicateConduits=duplicateValues(conduits.map(c=>c.conduit_id));
 const duplicateCables=duplicateValues(cables.map(c=>c.tag));
 conduits.forEach((conduit,row)=>{
   const id=normalizeDuctbankId(conduit.conduit_id);
   if(!id) addDuctbankIssue(context,{table:'conduit',row,code:'missing',field:'conduit_id',message:'Conduit is missing an ID',fix:'Enter a unique conduit ID.'});
   if(id && duplicateConduits.has(id)) addDuctbankIssue(context,{table:'conduit',row,code:'duplicate',field:'conduit_id',message:`Duplicate conduit ID "${id}"`,fix:'Rename this conduit so every conduit ID is unique.'});
   if(!CONDUIT_SPECS[conduit.conduit_type] || !CONDUIT_SPECS[conduit.conduit_type][conduit.trade_size]){
     addDuctbankIssue(context,{table:'conduit',row,code:'missing',field:'trade_size',message:`Conduit ${id || row + 1} needs a valid type and trade size`,fix:'Choose a valid conduit type and trade size.'});
   }
 });
 Object.entries(context.fillMap || {}).forEach(([conduitId,data])=>{
   const count=data?.cables?.length || 0;
   if(!count || !Number.isFinite(data.fillPct)) return;
   const limit=conduitFillLimit(count);
   if(data.fillPct > limit || data.fillPct > limit * 0.8){
     context.fillWarningConduits.add(conduitId);
     const row=conduits.findIndex(c=>normalizeDuctbankId(c.conduit_id)===conduitId);
     if(row >= 0){
       addDuctbankIssue(context,{
         table:'conduit',
         row,
         code:'fill',
         field:'conduit_id',
         message:`Conduit ${conduitId} fill is ${data.fillPct.toFixed(1)}% of a ${limit}% limit`,
         fix:'Move one or more cables to another conduit or select a larger trade size.'
       });
     }
   }
 });
 Object.entries(conduitOverLimit || {}).forEach(([conduitId,result])=>{
   if(result?.over) context.thermalConduits.add(conduitId);
 });
 Object.entries(cableOverLimit || {}).forEach(([tag,over])=>{
   const normalizedTag=normalizeDuctbankId(tag);
   if(over && normalizedTag) context.ampacityCables.add(normalizedTag);
 });
 cables.forEach((cable,row)=>{
   const tag=normalizeDuctbankId(cable.tag);
   const conduitId=normalizeDuctbankId(cable.conduit_id);
   if(!tag) addDuctbankIssue(context,{table:'cable',row,code:'missing',field:'tag',message:'Cable is missing a tag',fix:'Enter a unique cable tag.'});
   if(tag && duplicateCables.has(tag)) addDuctbankIssue(context,{table:'cable',row,code:'duplicate',field:'tag',message:`Duplicate cable tag "${tag}"`,fix:'Rename this cable so every cable tag is unique.'});
   if(!(parseFloat(cable.diameter)>0)) addDuctbankIssue(context,{table:'cable',row,code:'missing',field:'diameter',message:`Cable ${tag || row + 1} needs a diameter`,fix:'Enter the outside diameter in inches.'});
   if(!conduitId) addDuctbankIssue(context,{table:'cable',row,code:'assignment',field:'conduit_id',message:`Cable ${tag || row + 1} is not assigned to a conduit`,fix:'Choose the conduit this cable will be installed in.'});
   else if(!context.conduitIds.has(conduitId)) addDuctbankIssue(context,{table:'cable',row,code:'assignment',field:'conduit_id',message:`Cable ${tag || row + 1} references missing conduit ${conduitId}`,fix:'Choose an existing conduit or add the missing conduit.'});
   if(!(parseFloat(cable.insulation_thickness)>0)) addDuctbankIssue(context,{table:'cable',row,code:'missing',field:'insulation_thickness',message:`Cable ${tag || row + 1} needs insulation thickness`,fix:'Enter insulation thickness or select a conductor size with known defaults.'});
   if(context.fillWarningConduits.has(conduitId)) addDuctbankIssue(context,{table:'cable',row,code:'fill',field:'conduit_id',message:`Cable ${tag || row + 1} is in a conduit near or over fill limit`,fix:'Move this cable to another conduit or increase conduit size.'});
   if(context.thermalConduits.has(conduitId)){
     addDuctbankIssue(context,{table:'cable',row,code:'thermal',field:'est_load',message:`Cable ${tag || row + 1} has a thermal alert`,fix:'Reduce estimated load, adjust spacing, or review soil assumptions.'});
   }
   if(context.ampacityCables.has(tag)){
     if(conduitId) context.ampacityConduits.add(conduitId);
     addDuctbankIssue(context,{table:'cable',row,code:'ampacity',field:'est_load',message:`Cable ${tag || row + 1} exceeds an ampacity estimate`,fix:'Reduce estimated load, increase conductor size, or review ampacity assumptions.'});
   }
 });
 return context;
}

export function hasIssueCode(issues, codes){
 return issues.some(issue=>codes.includes(issue.code));
}

export function rowMatchesDuctbankFilter(type, rowData, index, context, activeDuctbankFilter='all'){
 const issues=type==='conduit'
   ? context.conduitIssuesByRow.get(index) || []
   : context.cableIssuesByRow.get(index) || [];
 if(activeDuctbankFilter==='all') return true;
 if(type==='conduit'){
   const id=normalizeDuctbankId(rowData.conduit_id);
   const assigned=(context.cableCountByConduit.get(id) || 0) > 0;
   if(activeDuctbankFilter==='assigned') return assigned;
   if(activeDuctbankFilter==='unassigned') return id ? !assigned : false;
   if(activeDuctbankFilter==='missing') return hasIssueCode(issues,['missing','duplicate','assignment']);
   if(activeDuctbankFilter==='fill') return hasIssueCode(issues,['fill']);
   if(activeDuctbankFilter==='thermal') return context.thermalConduits.has(id);
   if(activeDuctbankFilter==='ampacity') return context.ampacityConduits.has(id);
 }else{
   const tag=normalizeDuctbankId(rowData.tag);
   const conduitId=normalizeDuctbankId(rowData.conduit_id);
   const assigned=Boolean(conduitId && context.conduitIds.has(conduitId));
   if(activeDuctbankFilter==='assigned') return assigned;
   if(activeDuctbankFilter==='unassigned') return !assigned;
   if(activeDuctbankFilter==='missing') return hasIssueCode(issues,['missing','duplicate','assignment']);
   if(activeDuctbankFilter==='fill') return hasIssueCode(issues,['fill']);
   if(activeDuctbankFilter==='thermal') return context.thermalConduits.has(conduitId);
   if(activeDuctbankFilter==='ampacity') return context.ampacityCables.has(tag);
 }
 return true;
}
