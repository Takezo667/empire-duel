const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const WIDTH = 18, HEIGHT = 12;
const resources = [
  {x:4,y:2,type:'wood'}, {x:13,y:9,type:'wood'}, {x:13,y:2,type:'wood'}, {x:4,y:9,type:'wood'},
  {x:7,y:2,type:'gold'}, {x:10,y:9,type:'gold'}, {x:10,y:2,type:'food'}, {x:7,y:9,type:'food'},
  {x:3,y:5,type:'food'}, {x:14,y:6,type:'food'}, {x:8,y:4,type:'wood'}, {x:9,y:7,type:'wood'},
  {x:6,y:5,type:'gold'}, {x:11,y:6,type:'gold'}, {x:6,y:7,type:'food'}, {x:11,y:4,type:'food'},
];
const SPAWNS = [{x:1,y:1},{x:16,y:10},{x:16,y:1},{x:1,y:10}];
const MAX_PLAYERS = 4;
const COST = {worker:{food:55},soldier:{food:70,gold:35},barracks:{wood:90,gold:45},tower:{wood:85,gold:65}};
const rooms = new Map(); let uid=1;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const id=()=>uid++;
const makeRoom = code => {
  const room={code, clients:Array(MAX_PLAYERS).fill(null),joined:Array(MAX_PLAYERS).fill(false),state:{units:[],buildings:[],resources:resources.map((r,i)=>({...r,id:i,amount:9999})),players:Array.from({length:MAX_PLAYERS},()=>({wood:160,food:180,gold:135})),winner:null,eliminated:[]},last:Date.now()};
  rooms.set(code,room);return room;
};
function spawn(room,p){
  const {x,y}=SPAWNS[p], s=room.state;
  const dx=x===1?1:-1, dy=y===1?1:-1;
  s.buildings.push({id:id(),p,type:'keep',x,y,hp:450,maxHp:450});
  s.units.push({id:id(),p,type:'worker',x:x+dx,y,hp:65,maxHp:65,target:null,cooldown:0});
  s.units.push({id:id(),p,type:'worker',x,y:y+dy,hp:65,maxHp:65,target:null,cooldown:0});
  s.units.push({id:id(),p,type:'soldier',x:x+dx,y:y+dy,hp:115,maxHp:115,target:null,cooldown:0});
}
function send(ws, obj){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function broadcast(room, obj){room.clients.forEach(c=>send(c,obj));}
function snapshot(room){broadcast(room,{type:'state',state:room.state,players:room.clients.map(c=>!!c),joined:room.joined,code:room.code});}
function occupied(s,x,y){return s.buildings.some(b=>b.hp>0&&b.x===x&&b.y===y)||s.resources.some(r=>r.x===x&&r.y===y);}
function pay(player,cost){if(Object.entries(cost).some(([k,v])=>player[k]<v))return false;Object.entries(cost).forEach(([k,v])=>player[k]-=v);return true;}
function handle(room,p,msg){
  const s=room.state;if(s.winner!==null||s.eliminated.includes(p))return;
  const player=s.players[p];
  if(msg.type==='order'){
    const u=s.units.find(u=>u.id===msg.id&&u.p===p&&u.hp>0);if(!u)return;
    const x=clamp(Math.floor(Number(msg.x)||0),0,WIDTH-1),y=clamp(Math.floor(Number(msg.y)||0),0,HEIGHT-1);
    const enemy=s.units.find(e=>e.id===msg.targetId&&e.p!==p&&e.hp>0)||s.buildings.find(e=>e.id===msg.targetId&&e.p!==p&&e.hp>0);
    const res=s.resources.find(r=>r.id===msg.resourceId);
    if(enemy)u.target={kind:'attack',id:enemy.id};
    else if(res&&u.type==='worker')u.target={kind:'harvest',id:res.id};
    else u.target={kind:'move',x,y};
  }
  if(msg.type==='build'){
    const u=s.units.find(u=>u.id===msg.id&&u.p===p&&u.type==='worker'&&u.hp>0),type=msg.building;
    const x=Math.floor(Number(msg.x)),y=Math.floor(Number(msg.y));
    if(!u||!['barracks','tower'].includes(type)||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>=WIDTH||y<0||y>=HEIGHT||occupied(s,x,y)||distance(u,{x,y})>3.6)return;
    if(!pay(player,COST[type])){send(room.clients[p],{type:'notice',text:'Ressources insuffisantes'});return;}
    s.buildings.push({id:id(),p,type,x,y,hp:type==='tower'?185:240,maxHp:type==='tower'?185:240,cooldown:0});
    u.target={kind:'move',x:clamp(x+(x<WIDTH/2?-1:1),0,WIDTH-1),y};
  }
  if(msg.type==='train'){
    const b=s.buildings.find(b=>b.id===msg.id&&b.p===p&&b.hp>0),type=msg.unit;
    if(!b||!((b.type==='keep'&&type==='worker')||(b.type==='barracks'&&type==='soldier')))return;
    if(!pay(player,COST[type])){send(room.clients[p],{type:'notice',text:'Ressources insuffisantes'});return;}
    const x=clamp(b.x+(b.x<WIDTH/2?1:-1),0,WIDTH-1),y=clamp(b.y+(s.units.filter(u=>u.p===p).length%3)-1,0,HEIGHT-1);
    s.units.push({id:id(),p,type,x,y,hp:type==='worker'?65:115,maxHp:type==='worker'?65:115,target:null,cooldown:0});
  }
}
function tick(room){
  const s=room.state;if(s.winner!==null)return;
  const dt=0.1;
  for(const u of s.units){
    if(u.hp<=0)continue;
    u.cooldown=Math.max(0,u.cooldown-dt);
    const t=u.target;if(!t)continue;
    let dest=null,attack=null,harvest=null;
    if(t.kind==='move')dest=t;
    if(t.kind==='attack') {attack=s.units.find(e=>e.id===t.id&&e.hp>0&&e.p!==u.p)||s.buildings.find(e=>e.id===t.id&&e.hp>0&&e.p!==u.p);if(!attack){u.target=null;continue;}dest=attack;}
    if(t.kind==='harvest') {harvest=s.resources.find(r=>r.id===t.id);if(!harvest){u.target=null;continue;}dest=harvest;}
    if(!dest)continue;
    const d=distance(u,dest),reach=attack?0.88:harvest?0.95:0.1;
    if(d>reach){const speed=(u.type==='worker'?1.3:1.65)*dt;u.x+=((dest.x-u.x)/d)*Math.min(speed,d-reach);u.y+=((dest.y-u.y)/d)*Math.min(speed,d-reach);}
    else if(attack&&u.cooldown<=0){attack.hp-=u.type==='soldier'?13:3;u.cooldown=u.type==='soldier'?0.85:1.4;}
    else if(harvest&&u.cooldown<=0){s.players[u.p][harvest.type]+=harvest.type==='food'?9:7;u.cooldown=1.1;}
    else if(t.kind==='move')u.target=null;
  }
  for(const b of s.buildings){
    if(b.hp<=0||b.type!=='tower')continue;b.cooldown=Math.max(0,(b.cooldown||0)-dt);
    if(b.cooldown<=0){const target=s.units.filter(u=>u.p!==b.p&&u.hp>0&&distance(u,b)<3.2).sort((a,c)=>distance(a,b)-distance(c,b))[0];if(target){target.hp-=14;b.cooldown=1.15;}}
  }
  s.units=s.units.filter(u=>u.hp>0);
  s.buildings=s.buildings.filter(b=>b.hp>0);
  for(let p=0;p<MAX_PLAYERS;p++){
    if(room.joined[p]&&!s.eliminated.includes(p)&&!s.buildings.some(b=>b.p===p&&b.type==='keep')){
      s.eliminated.push(p);
      s.units=s.units.filter(u=>u.p!==p);
      s.buildings=s.buildings.filter(b=>b.p!==p);
      broadcast(room,{type:'notice',text:`Le royaume du joueur ${p+1} a été éliminé !`});
    }
  }
  const survivors=room.joined.map((joined,p)=>joined&&!s.eliminated.includes(p)?p:null).filter(p=>p!==null);
  if(room.joined.filter(Boolean).length>=2&&survivors.length===1){
    s.winner=survivors[0];
    broadcast(room,{type:'notice',text:`Victoire du joueur ${s.winner+1} !`});
  }
}
const httpServer=http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  const file=path.join(ROOT,pathname==='/'?'index.html':pathname);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end('Introuvable');return;}
    const ext=path.extname(file);res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript'}[ext]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
  });
});
const wss=new WebSocket.Server({server:httpServer});
wss.on('connection',ws=>{
 let myRoom=null,slot=-1;
 ws.on('message',raw=>{
  let msg;try{msg=JSON.parse(raw)}catch{return;}
  if(msg.type==='join'&&!myRoom){
   const code=String(msg.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);if(code.length<3){send(ws,{type:'error',text:'Code de salon invalide'});return;}
   let room=rooms.get(code)||makeRoom(code);const idx=room.clients.findIndex((c,i)=>!c&&!room.joined[i]);
   if(idx<0){send(ws,{type:'error',text:'Salon complet (4 joueurs maximum)'});return;}
   if(room.state.winner!==null){send(ws,{type:'error',text:'Partie terminée : crée un autre salon'});return;}room.clients[idx]=ws;room.joined[idx]=true;spawn(room,idx);myRoom=room;slot=idx;room.last=Date.now();send(ws,{type:'joined',player:idx,code});snapshot(room);
  }else if(myRoom&&typeof msg.type==='string'){if(JSON.stringify(msg).length<1000){handle(myRoom,slot,msg);snapshot(myRoom);}}
 });
 ws.on('close',()=>{if(myRoom){myRoom.clients[slot]=null;myRoom.last=Date.now();broadcast(myRoom,{type:'notice',text:`Le joueur ${slot+1} s'est déconnecté`});snapshot(myRoom);}});
});
setInterval(()=>{for(const room of rooms.values()){if(room.clients.some(Boolean)){tick(room);snapshot(room);}else if(Date.now()-room.last>3600000)rooms.delete(room.code);}},100);
httpServer.listen(PORT,()=>console.log(`Empire Duel disponible sur http://localhost:${PORT}`));
