const assert = require("assert");

async function run() {
  const { mapConduitRow } = await import("../racewaySampleData.js");
  const legacy1 = {
    "Conduit ID": "C-001",
    Type: "RMC",
    "Trade Size": "3",
    Ductbank: "DB-01",
  };
  const legacy2 = {
    conduitId: "C-002",
    type: "EMT",
    tradeSize: "2",
    ductbankTag: "DB-02",
    "Allowed Group": "A",
  };
  const legacy3 = {
    conduit_id: "C-003",
    Type: "PVC Sch 40",
    trade_size: "4",
    ductbank_tag: "DB-03",
  };
  const r1 = mapConduitRow(legacy1);
  const r2 = mapConduitRow(legacy2);
  const r3 = mapConduitRow(legacy3);
  assert.equal(r1.conduit_id, "C-001");
  assert.equal(r1.trade_size, "3");
  assert.equal(r1.ductbankTag, "DB-01");
  assert.equal(r2.allowed_cable_group, "A");
  assert.equal(r3.type, "PVC Sch 40");
  console.log("racewaySampleMapper.test passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
