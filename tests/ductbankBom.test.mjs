import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDuctbankBOM, conduitOutsideDiameterIn } from '../analysis/ductbankBom.mjs';

const conduits = [
  {conduit_id:'C1',conduit_type:'PVC Sch 40',trade_size:'4',x:0,y:0},
  {conduit_id:'C2',conduit_type:'PVC Sch 40',trade_size:'4',x:7.5,y:0},
  {conduit_id:'C3',conduit_type:'PVC Sch 40',trade_size:'4',x:0,y:8.5},
  {conduit_id:'C4',conduit_type:'PVC Sch 40',trade_size:'4',x:7.5,y:8.5}
];

test('ductbank BOM reports missing takeoff inputs',()=>{
  const bom=buildDuctbankBOM();
  assert.equal(bom.ready,false);
  assert.match(bom.warnings.join(' '),/route length/i);
  assert.match(bom.warnings.join(' '),/conduit/i);
  assert.equal(bom.optionalRows.length,3);
  assert.ok(bom.optionalRows.every(row=>row.included===false));
});

test('ductbank BOM calculates grouped raceway, civil, and accessory quantities while excluding cable',()=>{
  const bom=buildDuctbankBOM({
    tag:'DB-01',
    lengthFt:100,
    depthIn:36,
    concreteEncasement:true,
    conduits,
    cables:[
      {tag:'P-01',cable_type:'Power',conductors:3,conductor_size:'4/0',conductor_material:'Copper',voltage_rating:'600V',conduit_id:'C1'},
      {tag:'P-02',cable_type:'Power',conductors:3,conductor_size:'4/0',conductor_material:'Copper',voltage_rating:'600V',conduit_id:'C2'}
    ]
  });
  assert.equal(bom.ready,true);
  assert.equal(bom.summary.routeLengthFt,100);
  assert.equal(bom.summary.conduitLengthFt,420);
  assert.equal(bom.summary.spacerSets,21);
  assert.ok(bom.summary.excavationCubicYards > bom.summary.concreteCubicYards);
  assert.equal(bom.rows.find(row=>row.item==='PVC Sch 40 conduit').quantity,420);
  assert.equal(bom.rows.find(row=>row.item==='PVC Sch 40 couplings').quantity,36);
  assert.equal(bom.rows.find(row=>row.item==='Conduit end fittings').quantity,8);
  assert.equal(bom.rows.some(row=>row.category==='Cable'),false);
  assert.equal(bom.rows.some(row=>row.item==='Power'),false);
  assert.ok(bom.rows.some(row=>row.item==='Concrete encasement'));
  assert.match(bom.exclusions.join(' '),/cable schedule/i);
});

test('selected optional materials add auditable ground wire, dye, and shoring allowances',()=>{
  const bom=buildDuctbankBOM({
    lengthFt:100,
    depthIn:36,
    concreteEncasement:true,
    conduits,
    optionalMaterials:{
      groundWire:true,
      groundWireCount:2,
      redWarningDye:true,
      excavationShoring:true
    }
  });
  assert.equal(bom.summary.optionalLineItems,3);
  assert.equal(bom.optionalRows.filter(row=>row.included).length,3);
  assert.equal(bom.rows.find(row=>row.item==='#4/0 grounding conductor').quantity,210);
  assert.equal(bom.rows.find(row=>row.item==='Red warning dye / pigment').quantity,100);
  assert.equal(bom.rows.find(row=>row.item==='Excavation shoring / protective system allowance').quantity,944.17);
  assert.ok(bom.rows.filter(row=>row.optional).every(row=>row.category==='Optional'));
});

test('deep trench raises competent-person protective-system review guidance',()=>{
  const bom=buildDuctbankBOM({lengthFt:20,depthIn:60,conduits});
  assert.match(bom.warnings.join(' '),/competent person/i);
  assert.match(bom.warnings.join(' '),/shoring is only one/i);
});

test('non-encased ductbank omits concrete quantity and separates conduit types',()=>{
  const bom=buildDuctbankBOM({
    lengthFt:50,
    concreteEncasement:false,
    conduits:[
      {conduit_type:'EMT',trade_size:'2',x:0,y:0},
      {conduit_type:'RMC',trade_size:'3',x:5,y:0}
    ]
  });
  assert.equal(bom.summary.concreteCubicYards,0);
  assert.equal(bom.rows.filter(row=>row.item.endsWith(' conduit')).length,2);
  assert.equal(bom.rows.some(row=>row.item==='Concrete encasement'),false);
  assert.equal(conduitOutsideDiameterIn('RMC','3'),3.5);
});
