'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, 'public');
const WIDTH = 30, HEIGHT = 22, MAX_PLAYERS = 4;
const SPAWNS = [{x:6,y:5},{x:23,y:16},{x:23,y:5},{x:6,y:16}];
const COST = {
  villager:{food:55}, swordsman:{food:65,gold:30}, archer:{wood:35,food:55,gold:25}, scout:{food:85,gold:55},
  barracks:{wood:135,gold:50}, range:{wood:145,gold:65}, stable:{wood:160,gold:80}, tower:{wood:100,gold:105}, house:{wood:80}
};
const UNITS = {
  villager:{hp:75,speed:1.75,damage:4,range:0.85,rate:1.3,train:4},
  swordsman:{hp:145,speed:1.95,damage:20,range:0.95,rate:0.85,train:7},
  archer:{hp:86,speed:1.9,damage:13,range:4.05,rate:1.25,train:9},
  scout:{hp:130,speed:2.75,damage:12,range:1.05,rate:0.7,train:11}
};
const BUILDINGS = {
  keep:{hp:950,train:['villager']}, barracks:{hp:445,train:['swordsman']},range:{hp:360,train:['archer']},
  stable:{hp:390,train:['scout']}, tower:{hp:310,train:[]},house:{hp:210,train:[]}
};
const rooms = new Map(); let NEXT_ID=1;
const uid=()=>NEXT_ID++;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const validInt=x=>Number.isFinite(x)&&Number.isInteger(x);
const finiteCoord=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<WIDTH;
function makeResources(){
 const coords=[];const used=new Set();
 function add(x,y,type){if(x<0||x>=WIDTH||y<0||y>=HEIGHT)return;if(SPAWNS.some(s=>Math.abs(x-s.x)<=2&&Math.abs(y-s.y)<=2))return;const key=`${x},${y}`;if(used.has(key))return;used.add(key);coords.push({id:uid(),x,y,type,amount:type==='gold'?1300:1800});}
 // Every starting position has access to all resource types.
 SPAWNS.forEach(({x,y},i)=>{const dx=x<WIDTH/2?1:-1,dy=y<HEIGHT/2?1:-1;
  add(x+dx*4,y,'wood');add(x+dx*5,y+dy,'wood');add(x,y+dy*4,'food');add(x+dx,y+dy*5,'food');add(x+dx*4,y+dy*4,'gold');});
 [[11,5,'wood'],[16,4,'food'],[12,8,'gold'],[18,9,'wood'],[15,11,'food'],[10,12,'wood'],[17,14,'gold'],[13,17,'wood'],[19,17,'food'],[8,10,'food'],[21,11,'wood'],[4,11,'gold'],[25,11,'gold'],[15,6,'gold'],[14,15,'food'],[21,5,'wood'],[8,16,'wood']].forEach(v=>add(...v));
 return coords;
}
function createRoom(code){const room={code,clients:Array(MAX_PLAYERS).fill(null),tokens:Array(MAX_PLAYERS).fill(null),joined:Array(MAX_PLAYERS).fill(false),last:Date.now(),elapsed:0,state:{map:{width:WIDTH,height:HEIGHT},players:Array.from({length:4},()=>({wood:230,food:245,gold:150})),units:[],buildings:[],resources:makeResources(),eliminated:[],winner:null}};rooms.set(code,room);return room;}
function makeUnit(s,p,type,x,y){const stat=UNITS[type];const u={id:uid(),p,type,x,y,hp:stat.hp,maxHp:stat.hp,target:null,cooldown:0,dir:p%2? -1:1};s.units.push(u);return u;}
function makeBuilding(s,p,type,x,y,constructing=false){const stats=BUILDINGS[type];const b={id:uid(),p,type,x,y,hp:constructing?Math.ceil(stats.hp*.24):stats.hp,maxHp:stats.hp,progress:constructing?0:1,queue:[],cooldown:0};s.buildings.push(b);return b;}
function spawn(room,p){const s=room.state,{x,y}=SPAWNS[p],dx=x<WIDTH/2?1:-1,dy=y<HEIGHT/2?1:-1;
 makeBuilding(s,p,'keep',x,y);makeUnit(s,p,'villager',x+dx,y);makeUnit(s,p,'villager',x,y+dy);makeUnit(s,p,'villager',x+dx,y+dy);makeUnit(s,p,'swordsman',x+dx*2,y+dy);
}
function send(ws,data){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function broadcast(room,data){room.clients.forEach(ws=>send(ws,data));}
function announce(room,text,p=null){if(p===null)broadcast(room,{type:'notice',text});else send(room.clients[p],{type:'notice',text});}
function snapshot(room){const s=room.state;broadcast(room,{type:'state',state:s,players:room.clients.map(Boolean),joined:room.joined,code:room.code,elapsed:room.elapsed});}
function pay(p,cost){if(Object.entries(cost).some(([key,value])=>p[key]<value))return false;Object.entries(cost).forEach(([key,value])=>p[key]-=value);return true;}
function alive(s,p){return !s.eliminated.includes(p)&&s.winner===null;}
function pop(s,p){const used=s.units.filter(u=>u.p===p).length+s.buildings.filter(b=>b.p===p).reduce((v,b)=>v+b.queue.length,0);
 const cap=s.buildings.filter(b=>b.p===p&&b.progress>=1).reduce((v,b)=>v+(b.type==='keep'?10:b.type==='house'?6:0),0);return{used,cap:Math.min(45,cap)};}
function sendError(room,p,message){announce(room,message,p);}
function handle(room,p,msg){const s=room.state;if(!alive(s,p))return;const owner=s.players[p];
 if(msg.type==='order'){
  const ids=Array.isArray(msg.ids)?msg.ids.slice(0,35):[msg.id];
  const units=ids.map(i=>s.units.find(u=>u.id===i&&u.p===p)).filter(Boolean);
  if(!units.length)return;
  const enemy=[...s.units,...s.buildings].find(e=>e.id===msg.enemyId&&e.p!==p&&e.hp>0);
  const res=s.resources.find(r=>r.id===msg.resourceId&&r.amount>0);
  const alliedBuilding=s.buildings.find(b=>b.id===msg.buildingId&&b.p===p&&b.progress<1);
  if(enemy){for(const u of units)u.target={kind:'attack',id:enemy.id};return;}
  if(res){for(const u of units){if(u.type==='villager')u.target={kind:'harvest',id:res.id};else u.target={kind:'move',x:res.x,y:res.y};}return;}
  if(alliedBuilding){for(const u of units.filter(u=>u.type==='villager'))u.target={kind:'construct',id:alliedBuilding.id};return;}
  if(!finiteCoord(msg.x)||typeof msg.y!=='number'||!Number.isFinite(msg.y)||msg.y<0||msg.y>=HEIGHT)return;
  const spread=units.length>1;units.forEach((u,i)=>{const angle=2*Math.PI*i/units.length;const r=spread?Math.sqrt(i)*.43:0;
   u.target={kind:'move',x:clamp(msg.x+Math.cos(angle)*r,.2,WIDTH-.2),y:clamp(msg.y+Math.sin(angle)*r,.2,HEIGHT-.2)};});return;
 }
 if(msg.type==='build'){
  const builder=s.units.find(u=>u.id===msg.id&&u.p===p&&u.type==='villager');
  const type=msg.building,x=msg.x,y=msg.y;
  if(!builder||!Object.hasOwn(COST,type)||!Object.hasOwn(BUILDINGS,type)||!validInt(x)||!validInt(y)||x<1||x>=WIDTH-1||y<1||y>=HEIGHT-1)return;
  if(dist(builder,{x,y})>5.8){sendError(room,p,'Construis à proximité de ton villageois.');return;}
  if(s.resources.some(r=>r.x===x&&r.y===y&&r.amount>0)||s.buildings.some(b=>dist(b,{x,y})<1.3)){sendError(room,p,'Emplacement occupé.');return;}
  if(!pay(owner,COST[type])){sendError(room,p,'Ressources insuffisantes.');return;}
  const b=makeBuilding(s,p,type,x,y,true);builder.target={kind:'construct',id:b.id};announce(room,'Chantier lancé. Tes villageois peuvent aider à construire.',p);return;
 }
 if(msg.type==='train'){
  const b=s.buildings.find(b=>b.id===msg.id&&b.p===p&&b.hp>0&&b.progress>=1),type=msg.unit;
  if(!b||!BUILDINGS[b.type].train.includes(type))return;
  if(b.queue.length>=5){sendError(room,p,'File de formation pleine (5 unités).');return;}
  const population=pop(s,p);if(population.used>=population.cap){sendError(room,p,'Population maximale : construis des maisons.');return;}
  if(!pay(owner,COST[type])){sendError(room,p,'Ressources insuffisantes.');return;}
  b.queue.push({type,remaining:UNITS[type].train});return;
 }
}
function getTarget(s,id,enemyOf){return [...s.units,...s.buildings].find(e=>e.id===id&&e.hp>0&&(enemyOf===null||e.p!==enemyOf));}
function tick(room,dt){const s=room.state;if(s.winner!==null)return;room.elapsed+=dt;
 for(const b of s.buildings){if(b.hp<=0||b.progress<1)continue;
  if(b.queue.length){const item=b.queue[0];item.remaining-=dt;if(item.remaining<=0){b.queue.shift();const p=b.p;const angle=(room.elapsed*.71+b.id)%(Math.PI*2);makeUnit(s,p,item.type,clamp(b.x+Math.cos(angle)*1.6,.1,WIDTH-.1),clamp(b.y+Math.sin(angle)*1.6,.1,HEIGHT-.1));}}
  if(b.type==='tower'){b.cooldown=Math.max(0,b.cooldown-dt);if(b.cooldown<=0){const target=s.units.filter(u=>u.p!==b.p&&u.hp>0&&dist(u,b)<4.25).sort((u,v)=>dist(u,b)-dist(v,b))[0];if(target){target.hp-=16;b.cooldown=1.3;}}}
 }
 for(const u of s.units){if(u.hp<=0)continue;const stats=UNITS[u.type];u.cooldown=Math.max(0,u.cooldown-dt);
  let t=u.target, dest=null,range=0.12,target=null,resource=null,building=null;
  if(t?.kind==='move'){dest=t;range=.12;}
  else if(t?.kind==='attack'){target=getTarget(s,t.id,u.p);if(target){dest=target;range=stats.range;}else u.target=null;}
  else if(t?.kind==='harvest'){resource=s.resources.find(r=>r.id===t.id&&r.amount>0);if(resource&&u.type==='villager'){dest=resource;range=1.05;}else u.target=null;}
  else if(t?.kind==='construct'){building=s.buildings.find(b=>b.id===t.id&&b.p===u.p&&b.progress<1);if(building&&u.type==='villager'){dest=building;range=1.15;}else u.target=null;}
  // Combat units defend themselves and engage nearby enemies when idle.
  if(!dest&&u.type!=='villager'){
   const near=s.units.filter(v=>v.p!==u.p&&v.hp>0&&dist(u,v)<(stats.range+1.6)).sort((a,b)=>dist(u,a)-dist(u,b))[0];
   if(near){target=near;dest=near;range=stats.range;u.target={kind:'attack',id:near.id};}
  }
  if(!dest)continue;
  const d=dist(u,dest);
  if(d>range+.04){const step=Math.min(stats.speed*dt,Math.max(0,d-range));u.x=clamp(u.x+(dest.x-u.x)/d*step,.1,WIDTH-.1);u.y=clamp(u.y+(dest.y-u.y)/d*step,.1,HEIGHT-.1);u.dir=dest.x>u.x?1:-1;}
  else if(target&&u.cooldown<=0){target.hp-=stats.damage;u.cooldown=stats.rate;}
  else if(resource&&u.cooldown<=0){const n=Math.min(resource.amount,resource.type==='food'?13:11);resource.amount-=n;s.players[u.p][resource.type]+=n;u.cooldown=1.15;if(resource.amount===0)u.target=null;}
  else if(building){building.progress=Math.min(1,building.progress+dt/7.5);building.hp=Math.max(building.hp,Math.round(building.maxHp*(.24+.76*building.progress)));if(building.progress===1){building.hp=building.maxHp;u.target=null;}}
  else if(t?.kind==='move'){u.target=null;}
 }
 s.units=s.units.filter(u=>u.hp>0);s.buildings=s.buildings.filter(b=>b.hp>0);
 for(let p=0;p<MAX_PLAYERS;p++)if(room.joined[p]&&!s.eliminated.includes(p)&&!s.buildings.some(b=>b.p===p&&b.type==='keep')){
  s.eliminated.push(p);s.units=s.units.filter(u=>u.p!==p);s.buildings=s.buildings.filter(b=>b.p!==p);announce(room,`Le royaume ${p+1} est tombé !`);
 }
 const survivors=room.joined.map((j,p)=>j&&!s.eliminated.includes(p)?p:null).filter(p=>p!==null);
 if(room.joined.filter(Boolean).length>=2&&survivors.length===1){s.winner=survivors[0];announce(room,`Victoire du royaume ${s.winner+1} !`);}
}
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const pathname=(()=>{try{return decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{return '';}})();
 if(pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}));return;}
 if(!pathname){res.writeHead(400).end();return;}
 const file=path.resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end('Introuvable');return;}res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);});
});
const wss=new WebSocket.Server({server,maxPayload:4096});
wss.on('connection',ws=>{
 let room=null,slot=-1,lastAction=0;
 ws.on('message',raw=>{
  let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
  if(msg.type==='join'&&!room){
   const code=String(msg.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
   if(code.length<3){send(ws,{type:'error',text:'Le code doit contenir au moins 3 caractères.'});return;}
   const r=rooms.get(code)||createRoom(code);if(r.state.winner!==null){send(ws,{type:'error',text:'Cette partie est terminée : crée un autre salon.'});return;}
   const token=String(msg.token||'');let idx=r.tokens.findIndex((v,i)=>v&&v===token&&!r.clients[i]);let restored=idx>=0;
   if(idx<0)idx=r.clients.findIndex((c,i)=>!c&&!r.joined[i]);
   if(idx<0){send(ws,{type:'error',text:'Salon complet (4 joueurs).'});return;}
   r.clients[idx]=ws;if(!restored){r.tokens[idx]=crypto.randomBytes(16).toString('hex');r.joined[idx]=true;spawn(r,idx);}
   room=r;slot=idx;r.last=Date.now();send(ws,{type:'joined',player:idx,code,token:r.tokens[idx],restored,spawn:SPAWNS[idx]});snapshot(r);return;
  }
  if(!room||!msg||typeof msg.type!=='string')return;
  const now=Date.now();if(now-lastAction<45)return;lastAction=now;
  handle(room,slot,msg);snapshot(room);
 });
 ws.on('close',()=>{if(!room)return;room.clients[slot]=null;room.last=Date.now();announce(room,`Joueur ${slot+1} déconnecté. Il peut revenir avec son navigateur.`);snapshot(room);});
});
let last=Date.now();setInterval(()=>{const now=Date.now(),dt=Math.min(.3,(now-last)/1000);last=now;
 for(const room of rooms.values()){if(room.clients.some(Boolean)){tick(room,dt);snapshot(room);}else if(now-room.last>3600000)rooms.delete(room.code);}
},150);
server.listen(PORT,'0.0.0.0',()=>console.log(`Empire Duel Remaster — http://localhost:${PORT}`));
