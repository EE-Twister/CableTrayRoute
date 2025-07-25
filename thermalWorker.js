// Worker for finite-difference ductbank thermal solver
const CONDUIT_SPECS={
 "EMT":{"1/2":0.304,"3/4":0.533,"1":0.864,"1-1/4":1.496,"1-1/2":2.036,"2":3.356,"2-1/2":5.858,"3":8.846,"3-1/2":11.545,"4":14.753},
 "RMC":{"1/2":0.314,"3/4":0.549,"1":0.887,"1-1/4":1.526,"1-1/2":2.071,"2":3.408,"2-1/2":4.866,"3":7.499,"3-1/2":10.01,"4":12.882,"5":20.212,"6":29.158},
 "PVC Sch 40":{"1/2":0.285,"3/4":0.508,"1":0.832,"1-1/4":1.453,"1-1/2":1.986,"2":3.291,"2-1/2":4.695,"3":7.268,"3-1/2":9.737,"4":12.554,"5":19.761,"6":28.567}
};
const AWG_AREA={"18":1624,"16":2583,"14":4107,"12":6530,"10":10380,"8":16510,"6":26240,"4":41740,"3":52620,"2":66360,"1":83690,"1/0":105600,"2/0":133100,"3/0":167800,"4/0":211600};
const BASE_RESISTIVITY={cu:0.017241,al:0.028264};
const TEMP_COEFF={cu:0.00393,al:0.00403};
const RESISTANCE_TABLE={cu:{},al:{}};
for(const sz in AWG_AREA){
  const areaMM2=AWG_AREA[sz]*0.0005067;
  RESISTANCE_TABLE.cu[sz]=BASE_RESISTIVITY.cu/areaMM2;
  RESISTANCE_TABLE.al[sz]=BASE_RESISTIVITY.al/areaMM2;
}
function sizeToArea(size){
  if(!size) return 0;
  const s=size.toString().trim();
  if(/kcmil/i.test(s)) return parseFloat(s)*1000;
  const m=s.match(/#?(\d+(?:\/0)?)/);
  if(!m) return 0;
  return AWG_AREA[m[1]]||0;
}
function dcResistance(size,material,temp=20){
  const key=size?size.toString().trim():'';
  const mat=material&&material.toLowerCase().includes('al')?'al':'cu';
  let base=RESISTANCE_TABLE[mat][key];
  if(base===undefined){
    const areaCM=sizeToArea(size);
    if(!areaCM) return 0;
    const areaMM2=areaCM*0.0005067;
    base=BASE_RESISTIVITY[mat]/areaMM2;
  }
  return base*(1+TEMP_COEFF[mat]*(temp-20));
}

function solve(conduits,cables,params,width,height,progressCb){
  const scale=40,margin=20;
  const step=4;
  const dx=(0.0254/scale)*step;
  const nx=Math.ceil(width/step);
  const ny=Math.ceil(height/step);
  const k=100/((params.soilResistivity)||90);
  const hConv=10;
  const Bi=hConv*dx/k;
  const earthT=params.earthTemp||20;
  const airT=isNaN(params.airTemp)?earthT:params.airTemp;
  const grid=Array.from({length:ny},()=>Array(nx).fill(earthT));
  const newGrid=Array.from({length:ny},()=>Array(nx).fill(earthT));
  const powerGrid=Array.from({length:ny},()=>Array(nx).fill(0));
  const conduitCells={};
  const heatMap={};
  cables.forEach(c=>{
    const cd=conduits.find(d=>d.conduit_id===c.conduit_id);
    if(!cd) return;
    const Rin=Math.sqrt(CONDUIT_SPECS[cd.conduit_type][cd.trade_size]/Math.PI);
    const cx=(cd.x+Rin)*0.0254;
    const cy=(cd.y+Rin)*0.0254;
    const Rdc=dcResistance(c.conductor_size,c.conductor_material,90);
    const current=parseFloat(c.est_load)||0;
    const power=current*current*Rdc;
    if(!heatMap[c.conduit_id]) heatMap[c.conduit_id]={cx,cy,r:Rin*0.0254,power:0};
    heatMap[c.conduit_id].power+=power*(c.conductors||1);
  });
  Object.keys(heatMap).forEach(cid=>{
    const h=heatMap[cid];
    const cxPx=Math.round((h.cx/0.0254*scale+margin)/step);
    const cyPx=Math.round((h.cy/0.0254*scale+margin)/step);
    const rPx=Math.max(1,Math.round((h.r/0.0254*scale)/step));
    const q=h.power/(Math.PI*h.r*h.r)*dx*dx/k;
    for(let j=Math.max(0,cyPx-rPx);j<=Math.min(ny-1,cyPx+rPx);j++){
      for(let i=Math.max(0,cxPx-rPx);i<=Math.min(nx-1,cxPx+rPx);i++){
        const dxp=i-cxPx,dyp=j-cyPx;
        if(dxp*dxp+dyp*dyp<=rPx*rPx){
          powerGrid[j][i]+=q;
          if(!conduitCells[cid]) conduitCells[cid]=[];
          conduitCells[cid].push([j,i]);
        }
      }
    }
  });
  let diff=Infinity,iter=0,maxIter=500;
  while(diff>0.01&&iter<maxIter){
    diff=0;
    for(let j=0;j<ny;j++){
      for(let i=0;i<nx;i++){
        let val;
        if(j===ny-1||i===0||i===nx-1){
          val=earthT;
        }else if(j===0){
          val=(grid[j+1][i]+Bi*airT)/(1+Bi);
        }else{
          val=0.25*(grid[j][i-1]+grid[j][i+1]+grid[j-1][i]+grid[j+1][i]+powerGrid[j][i]);
        }
        diff=Math.max(diff,Math.abs(val-grid[j][i]));
        newGrid[j][i]=val;
      }
    }
    for(let j=0;j<ny;j++){
      for(let i=0;i<nx;i++) grid[j][i]=newGrid[j][i];
    }
    iter++;
    if(progressCb && iter%25===0) progressCb(iter,maxIter);
  }
  const temps={};
  Object.keys(conduitCells).forEach(cid=>{
    const cells=conduitCells[cid];
    let sum=0;
    cells.forEach(([j,i])=>{sum+=grid[j][i];});
    temps[cid]=sum/cells.length;
  });
  return {grid,conduitTemps:temps,iter};
}

self.onmessage=e=>{
  const {conduits,cables,params,width,height}=e.data;
  const res=solve(conduits,cables,params,width,height,(it,max)=>{
    self.postMessage({type:'progress',iter:it,maxIter:max});
  });
  self.postMessage({type:'result',grid:res.grid,conduitTemps:res.conduitTemps});
};
