'use strict';
// EMPIRE DUEL REMASTER - Client RTS (camera, selection, commands, drawn sprites, minimap)
const $ = id => document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});
const mini=$('mini'),minictx=mini.getContext('2d');
const TILE=72, COLS=30, ROWS=22, WORLD_W=COLS*TILE, WORLD_H=ROWS*TILE;
const FACTIONS=['#65b5df','#e67568','#efc26d','#b895d9'];
const FACTION_NAMES=['AZUR','CARMIN','DORÉ','AMÉTHYSTE'];
const NAMES={villager:'Villageois',swordsman:'Épéiste',archer:'Archer',scout:'Éclaireur',keep:'Centre-ville',barracks:'Caserne',range:'Archerie',stable:'Écurie',tower:'Tour de garde',house:'Maison'};
const DESCS={villager:'Récolte des ressources et construit les bâtiments de ton royaume.',swordsman:'Infanterie résistante, redoutable au corps à corps.',archer:'Tire à distance ; protège-le derrière tes épéistes.',scout:'Unité mobile, excellente pour explorer et harceler.',keep:'Cœur de ton royaume. Recrute des villageois. Sa destruction te fait perdre.',barracks:'Forme des épéistes pour défendre et attaquer.',range:'Forme des archers, efficaces à distance.',stable:'Forme des éclaireurs rapides.',tower:'Attaque automatiquement les ennemis à proximité.',house:'Augmente de six ta capacité de population.'};
const COST={villager:{food:55},swordsman:{food:65,gold:30},archer:{wood:35,food:55,gold:25},scout:{food:85,gold:55},barracks:{wood:135,gold:50},range:{wood:145,gold:65},stable:{wood:160,gold:80},tower:{wood:100,gold:105},house:{wood:80}};
const ICONS={villager:'⚒',swordsman:'⚔',archer:'⌁',scout:'♞',keep:'♜',barracks:'⚔',range:'⌁',stable:'♞',tower:'♜',house:'⌂'};
let ws=null,me=null,state=null,code='',joined=[],connected=[],selected=[],buildMode=null,lastPanelKey='',toastTimer=0;
let camera={x:WORLD_W/2,y:WORLD_H/2,zoom:.99},viewport={w:900,h:650},keys=new Set(),drag=null,mouse={x:0,y:0,worldX:0,worldY:0},lastFrame=performance.now();
let lastMini=0,gameOverShown=false;
const randSeed=(x,y,s=0)=>{let a=Math.sin(x*127.1+y*311.7+s*79.7)*43758.5453;return a-Math.floor(a)};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rndcode=()=>Math.random().toString(36).slice(2,8).toUpperCase();
$('room').value=(new URLSearchParams(location.search).get('room')||rndcode()).toUpperCase();
$('join').addEventListener('click',join);$('room').addEventListener('keydown',e=>{if(e.key==='Enter')join();});
$('share').onclick=async()=>{const link=`${location.origin}/?room=${encodeURIComponent(code)}`;try{await navigator.clipboard.writeText(link);toast('Lien d’invitation copié ! Partage-le à tes amis.');}catch{window.prompt('Copie le lien :',link);}};
function toast(text){$('toast').textContent=text;$('message').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4300);}
function send(obj){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function join(){code=$('room').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);if(code.length<3){$('joinError').textContent='Code de salon : 3 caractères minimum.';return;}
 $('join').disabled=true;$('joinError').textContent='';const proto=location.protocol==='https:'?'wss:':'ws:';ws=new WebSocket(`${proto}//${location.host}`);
 ws.onopen=()=>send({type:'join',code,token:localStorage.getItem('empire-token-'+code)||''});
 ws.onmessage=ev=>{let msg;try{msg=JSON.parse(ev.data);}catch{return;}
  if(msg.type==='error'){$('joinError').textContent=msg.text;$('join').disabled=false;ws.close();return;}
  if(msg.type==='joined'){
   me=msg.player;localStorage.setItem('empire-token-'+code,msg.token);history.replaceState({},'',`?room=${code}`);$('welcome').classList.add('hidden');
   $('roomlabel').textContent=code;$('playerlabel').textContent=`Royaume ${FACTION_NAMES[me]}`;$('factionChip').style.background=FACTIONS[me];
   $('signal').classList.add('connected');$('connection').textContent='CONNECTÉ';
   camera.x=(msg.spawn.x+.5)*TILE;camera.y=(msg.spawn.y+.5)*TILE;camera.zoom=1.03;clampCamera();
   $('mini').parentElement.classList.add(['se','nw','sw','ne'][me]);
   toast(msg.restored?'Tu as retrouvé ton royaume !':'Ton royaume est prêt. Clique sur un villageois pour commencer.');
  }
  if(msg.type==='state'){state=msg.state;connected=msg.players;joined=msg.joined;
   if(me!==null&&selected.length===0){const u=state.units.find(u=>u.p===me&&u.type==='villager');if(u)selected=[u.id];}
   updatePanels();drawMini();
   if(state.winner!==null&&!gameOverShown){gameOverShown=true;$('victory').classList.remove('hidden');$('victoryTitle').textContent=state.winner===me?'VICTOIRE':'DÉFAITE';$('victoryIcon').textContent=state.winner===me?'♛':'⚔';$('victoryDescription').textContent=state.winner===me?'Ton empire domine le royaume.':'Le dernier royaume encore debout a gagné.';}
  }
  if(msg.type==='notice')toast(msg.text);
 };
 ws.onclose=()=>{$('signal').classList.remove('connected');$('connection').textContent='DÉCONNECTÉ';if(me===null){$('join').disabled=false;}else toast('Connexion interrompue. Recharge la page pour reprendre ton royaume.');};
 ws.onerror=()=>{$('joinError').textContent='Connexion au serveur impossible. Vérifie le déploiement.';};
}
function units(){return state?.units||[];}function buildings(){return state?.buildings||[];}function resources(){return state?.resources||[];}
function entity(id){return units().find(v=>v.id===id)||buildings().find(v=>v.id===id);}
function population(){if(!state||me===null)return{used:0,cap:10};return{used:units().filter(v=>v.p===me).length+buildings().filter(v=>v.p===me).reduce((s,b)=>s+b.queue.length,0),cap:Math.min(45,buildings().filter(b=>b.p===me&&b.progress>=1).reduce((s,b)=>s+(b.type==='keep'?10:b.type==='house'?6:0),0))};}
function updatePanels(){if(!state||me===null)return;const own=state.players[me];
 for(const name of ['wood','food','gold'])$(name).textContent=Math.floor(own[name]);const p=population();$('pop').textContent=`${p.used} / ${p.cap}`;
 $('opponent').textContent=`${connected.filter(Boolean).length} / 4 joueurs connectés`;
 $('playerList').innerHTML=Array.from({length:4},(_,i)=>{const isIn=joined[i],hasLost=state.eliminated.includes(i);return `<div class="player-row"><span class="player-color" style="background:${FACTIONS[i]}"></span><span>${FACTION_NAMES[i]}${i===me?' (toi)':''}</span><small>${hasLost?'ÉLIMINÉ':connected[i]?'EN LIGNE':isIn?'ABSENT':'EN ATTENTE'}</small></div>`;}).join('');
 selected=selected.filter(id=>{const u=entity(id);return u&&u.p===me;});
 const selectedUnits=selected.map(entity).filter(Boolean),focus=selectedUnits[0],multiple=selectedUnits.length>1;
 if(!focus){$('selectedName').textContent='Aucune sélection';$('selectedType').textContent='—';$('selectedDescription').textContent='Choisis une unité ou un bâtiment de ton royaume.';$('healthbar').classList.add('hidden');$('selectionArt').querySelector('.selection-icon').textContent='✣';$('actions').replaceChildren();return;}
 const panelKey=JSON.stringify([selected,Math.floor(own.wood/5),Math.floor(own.food/5),Math.floor(own.gold/5),p.used,p.cap,focus.type,Math.round(focus.hp),Math.round(focus.progress*10||10),focus.queue?.length,buildMode]);
 if(panelKey===lastPanelKey)return;lastPanelKey=panelKey;
 $('selectedName').textContent=multiple?`${selectedUnits.length} unités sélectionnées`:NAMES[focus.type];
 $('selectedType').textContent=multiple?'GROUPE':focus.type==='villager'||focus.type==='swordsman'||focus.type==='archer'||focus.type==='scout'?'UNITÉ':'BÂTIMENT';
 $('selectedDescription').textContent=multiple?'Clique droit pour donner le même ordre à toutes tes unités.':DESCS[focus.type];
 $('selectionArt').querySelector('.selection-icon').textContent=ICONS[focus.type]||'✣';$('selectionArt').lastElementChild.textContent=multiple?`${selectedUnits.length} UNITÉS`:NAMES[focus.type].toUpperCase();
 $('healthbar').classList.toggle('hidden',multiple);$('healthfill').style.width=`${Math.max(0,focus.hp/focus.maxHp*100)}%`;
 $('healthtext').textContent=multiple?'Groupe sélectionné':`Points de vie : ${Math.ceil(focus.hp)} / ${focus.maxHp}${focus.progress<1?' · Chantier '+Math.round(focus.progress*100)+' %':''}`;
 const actionArea=$('actions');actionArea.replaceChildren();
 function button(label,type,desc,fn,active=false){const b=document.createElement('button');b.className='action'+(active?' arrow-mode':'');
 const afford=Object.entries(COST[type]||{}).every(([k,n])=>own[k]>=n);b.disabled=!afford;
 const cost=Object.entries(COST[type]||{}).map(([k,n])=>`${n} ${k==='wood'?'bois':k==='food'?'vivres':'or'}`).join(' · ');
 const badge=document.createElement('span');badge.className='action-icon';badge.textContent=ICONS[type];
 const body=document.createElement('span');body.className='action-body';const title=document.createElement('span');title.className='action-title';title.textContent=label;
 const small=document.createElement('span');small.className='action-cost';small.textContent=cost||desc;body.append(title,small);b.append(badge,body);b.onclick=fn;actionArea.append(b);}
 if(!multiple){
  if(focus.type==='keep')button('Former un villageois','villager','',()=>send({type:'train',id:focus.id,unit:'villager'}));
  if(focus.type==='barracks')button('Former un épéiste','swordsman','',()=>send({type:'train',id:focus.id,unit:'swordsman'}));
  if(focus.type==='range')button('Former un archer','archer','',()=>send({type:'train',id:focus.id,unit:'archer'}));
  if(focus.type==='stable')button('Former un éclaireur','scout','',()=>send({type:'train',id:focus.id,unit:'scout'}));
  if(focus.type==='villager')for(const [type,label] of [['house','Maison (+6 pop.)'],['barracks','Caserne'],['range','Archerie'],['stable','Écurie'],['tower','Tour de garde']])button('Construire : '+label,type,'',()=>{buildMode=type;lastPanelKey='';$('buildHint').classList.remove('hidden');toast('Place ton bâtiment sur une case libre, près du villageois.');updatePanels();},buildMode===type);
 }
 if(!actionArea.children.length){const p=document.createElement('p');p.className='muted';p.textContent='Clic droit sur le terrain pour déplacer tes unités, sur les ressources pour récolter ou sur un adversaire pour attaquer.';actionArea.append(p);}
 $('unitOrder').textContent=focus.queue?.length?`${focus.queue.length} unité(s) en formation · ${Math.ceil(focus.queue[0].remaining)}s restantes`:focus.target?'Ordre : '+({move:'déplacement',attack:'attaque',harvest:'récolte',construct:'construction'}[focus.target.kind]||'en cours'):'';
}
function showBuildCancel(){buildMode=null;$('buildHint').classList.add('hidden');lastPanelKey='';updatePanels();}
function resize(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);viewport.w=Math.max(1,rect.width);viewport.h=Math.max(1,rect.height);
 const w=Math.round(viewport.w*dpr),h=Math.round(viewport.h*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.setTransform(dpr,0,0,dpr,0,0);clampCamera();}
function clampCamera(){const marginX=Math.min(viewport.w/(camera.zoom*2),WORLD_W*.35);const marginY=Math.min(viewport.h/(camera.zoom*2),WORLD_H*.35);
 camera.x=clamp(camera.x,marginX,WORLD_W-marginX);camera.y=clamp(camera.y,marginY,WORLD_H-marginY);}
function pointToWorld(px,py){return{x:(px-viewport.w/2)/camera.zoom+camera.x,y:(py-viewport.h/2)/camera.zoom+camera.y};}
function worldToScreen(x,y){return{x:(x-camera.x)*camera.zoom+viewport.w/2,y:(y-camera.y)*camera.zoom+viewport.h/2};}
function setZoom(n){const z=clamp(n,.55,1.75);camera.zoom=z;clampCamera();$('zoomLabel').textContent=Math.round(z*100)+'%';}
$('zoomIn').onclick=()=>setZoom(camera.zoom*1.2);$('zoomOut').onclick=()=>setZoom(camera.zoom/1.2);
$('home').onclick=()=>{if(me===null)return;const b=buildings().find(b=>b.p===me&&b.type==='keep');if(b){camera.x=(b.x+.5)*TILE;camera.y=(b.y+.5)*TILE;clampCamera();}};
canvas.addEventListener('wheel',ev=>{ev.preventDefault();setZoom(camera.zoom*(ev.deltaY<0?1.09:.91));},{passive:false});
canvas.addEventListener('contextmenu',ev=>ev.preventDefault());
function hitTest(world){const cx=world.x/TILE-.5,cy=world.y/TILE-.5;const near=(list,radius)=>list.map(u=>({...u,hit:Math.hypot(u.x-cx,u.y-cy)})).filter(u=>u.hit<radius).sort((a,b)=>a.hit-b.hit)[0];
 const u=near(units(),.47);if(u)return{kind:'unit',value:u};
 const b=near(buildings(),.84);if(b)return{kind:'building',value:b};
 const r=near(resources().filter(r=>r.amount>0),.95);if(r)return{kind:'resource',value:r};return null;}
function order(world){if(!state||me===null||!selected.length)return;const ids=selected.filter(id=>{const e=entity(id);return e&&e.p===me&&'target'in e;});if(!ids.length)return;
 const h=hitTest(world);const obj={type:'order',ids,x:clamp(world.x/TILE-.5,0,COLS-.01),y:clamp(world.y/TILE-.5,0,ROWS-.01)};
 if(h&&((h.kind==='unit'||h.kind==='building')&&h.value.p!==me))obj.enemyId=h.value.id;
 else if(h?.kind==='resource')obj.resourceId=h.value.id;
 else if(h?.kind==='building'&&h.value.p===me&&h.value.progress<1)obj.buildingId=h.value.id;
 send(obj);}
function leftClick(world,shift){if(!state||me===null||state.winner!==null)return;
 if(buildMode){const builder=selected.map(entity).find(e=>e?.p===me&&e.type==='villager');
  if(!builder){toast('Sélectionne d’abord un villageois.');showBuildCancel();return;}
  send({type:'build',id:builder.id,building:buildMode,x:Math.floor(world.x/TILE),y:Math.floor(world.y/TILE)});showBuildCancel();return;}
 const hit=hitTest(world);
 if(hit?.value?.p===me&&(hit.kind==='unit'||hit.kind==='building')){
  const id=hit.value.id;if(shift&&hit.kind==='unit'){selected=selected.includes(id)?selected.filter(x=>x!==id):[...selected,id];}else selected=[id];lastPanelKey='';updatePanels();return;}
 if(selected.length&&selected.some(id=>entity(id)?.target!==undefined)){order(world);return;}
 selected=[];lastPanelKey='';updatePanels();
}
canvas.addEventListener('pointerdown',e=>{if(me===null)return;canvas.setPointerCapture(e.pointerId);const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
 drag={x,y,x2:x,y2:y,button:e.button,shift:e.shiftKey,pan:e.button===1||e.altKey,cameraX:camera.x,cameraY:camera.y};});
canvas.addEventListener('pointermove',e=>{const rect=canvas.getBoundingClientRect();mouse.x=e.clientX-rect.left;mouse.y=e.clientY-rect.top;const w=pointToWorld(mouse.x,mouse.y);mouse.worldX=w.x;mouse.worldY=w.y;$('coords').textContent=`${Math.floor(w.x/TILE)+1} : ${Math.floor(w.y/TILE)+1}`;
 if(drag){drag.x2=mouse.x;drag.y2=mouse.y;if(drag.pan){camera.x=drag.cameraX+(drag.x-drag.x2)/camera.zoom;camera.y=drag.cameraY+(drag.y-drag.y2)/camera.zoom;clampCamera();}}});
canvas.addEventListener('pointerup',e=>{if(!drag)return;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;drag.x2=x;drag.y2=y;
 const was=drag;drag=null;if(was.pan)return;
 const amount=Math.hypot(x-was.x,y-was.y);
 if(was.button===2){order(pointToWorld(x,y));return;}
 if(was.button!==0)return;
 if(amount>12&&!buildMode){const a=pointToWorld(was.x,was.y),b=pointToWorld(x,y);const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
  const ids=units().filter(u=>u.p===me&&(u.x+.5)*TILE>=left&&(u.x+.5)*TILE<=right&&(u.y+.5)*TILE>=top&&(u.y+.5)*TILE<=bottom).map(u=>u.id);
  if(ids.length)selected=was.shift?[...new Set([...selected,...ids])]:ids;lastPanelKey='';updatePanels();return;}
 leftClick(pointToWorld(x,y),was.shift);
});
canvas.addEventListener('pointercancel',()=>drag=null);
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;const key=e.key.toLowerCase();keys.add(key);if(key==='escape')showBuildCancel();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
mini.addEventListener('pointerdown',e=>{const r=mini.getBoundingClientRect();camera.x=((e.clientX-r.left)/r.width)*WORLD_W;camera.y=((e.clientY-r.top)/r.height)*WORLD_H;clampCamera();});
window.addEventListener('resize',resize);
function colorHex(hex,alpha){if(!hex)return '#ffffff';const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${alpha})`;}
function polygon(points,fill,stroke=null,strokeWidth=1){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=strokeWidth;ctx.stroke();}}
function box(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function oval(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function line(x1,y1,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function txt(text,x,y,size,color='#fff',font='Inter,system-ui',align='center'){ctx.font=`700 ${size}px ${font}`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,x,y);}
let terrain=null;
function createTerrain(){terrain=document.createElement('canvas');terrain.width=WORLD_W;terrain.height=WORLD_H;const b=terrain.getContext('2d');
 const shades=['#61794b','#687e51','#718352','#61794b','#6c8252','#6a8050','#748954'];
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
  const v=randSeed(x,y),tx=x*TILE,ty=y*TILE;b.fillStyle=shades[Math.floor(v*shades.length)];b.fillRect(tx,ty,TILE,TILE);
  for(let j=0;j<17;j++){let rx=tx+randSeed(x+j*4,y,1)*TILE,ry=ty+randSeed(x,y+j*7,2)*TILE;
   b.fillStyle=randSeed(j,x,y)>.4?'#9ca67724':'#233b2640';b.fillRect(rx,ry,2+randSeed(j,y)*5,1+randSeed(x,j)*4);}
  if(randSeed(x,y,7)>.75){b.fillStyle='#c0ad7144';for(let j=0;j<3;j++)b.fillRect(tx+22+j*8,ty+36+(j%2)*7,2,3);}
 }
 // Four dusty routes converge at the center of the continent.
 const roads=[[[6.5,5.5],[9,7],[13,9],[15,11]],[[23.5,5.5],[21,7],[17,9],[15,11]],[[6.5,16.5],[9,15],[12,13],[15,11]],[[23.5,16.5],[21,15],[18,13],[15,11]]];
 roads.forEach(nodes=>{b.lineCap='round';b.lineJoin='round';b.beginPath();b.moveTo(nodes[0][0]*TILE,nodes[0][1]*TILE);for(let j=1;j<nodes.length-1;j++){const mx=(nodes[j][0]+nodes[j+1][0])/2,my=(nodes[j][1]+nodes[j+1][1])/2;b.quadraticCurveTo(nodes[j][0]*TILE,nodes[j][1]*TILE,mx*TILE,my*TILE);}b.lineTo(nodes.at(-1)[0]*TILE,nodes.at(-1)[1]*TILE);b.strokeStyle='#3a4b2d55';b.lineWidth=35;b.stroke();b.strokeStyle='#aa965f84';b.lineWidth=22;b.stroke();b.strokeStyle='#cfb47944';b.lineWidth=10;b.stroke();});
 for(let i=0;i<420;i++){const x=randSeed(i,37)*WORLD_W,y=randSeed(i,43)*WORLD_H;const size=1+randSeed(i,13)*4;b.fillStyle=randSeed(i,8)>.45?'#bbc18a70':'#294c3380';b.beginPath();b.ellipse(x,y,size*1.4,size*.7,0,0,Math.PI*2);b.fill();}
}
function tree(x,y,scale=1,seed=0){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);oval(4,17,26,9,'#1b2f2080');
 box(-4,-2,8,22,'#55452e');
 for(let i=0;i<3;i++){const tier=i*13;polygon([[-26+i*4,3+tier],[0,-45+tier],[26-i*4,3+tier]],i%2?'#295a3a':'#326844','#1f4b31',2);polygon([[-19+i*3,-4+tier],[-3,-36+tier],[-4,2+tier]],'#4f865152');}
 line(-7,-17,-2,-34,'#81a16b80',2);ctx.restore();}
function deciduousTree(x,y,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);oval(4,21,31,11,'#1c332287');polygon([[-6,21],[-9,-11],[6,-17],[7,21]],'#6a5030');
 [[-14,-16,19,'#2a5638'],[7,-22,23,'#3a6c43'],[22,-9,16,'#416d44'],[-4,-37,17,'#53834a']].forEach(a=>{oval(a[0],a[1],a[2],a[2]*.8,a[3]);oval(a[0]-5,a[1]-4,a[2]*.53,a[2]*.38,'#779a5a55');});ctx.restore();}
function wheat(x,y,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);oval(2,12,40,15,'#433d1f67');box(-33,-9,66,22,'#967b3c');for(let row=0;row<3;row++){
 for(let i=0;i<6;i++){const sx=-27+i*10+row%2*3,sy=-9+row*8;line(sx,sy+15,sx+1,sy-16,'#4f7a36',2);for(let k=0;k<3;k++){oval(sx-4,sy-14+k*6,3,5,'#c4aa50');oval(sx+5,sy-14+k*6,3,5,'#ddc96c');}}}ctx.restore();}
function mine(x,y,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);oval(3,20,38,12,'#25392380');polygon([[-31,18],[-19,-10],[-5,-17],[6,2],[18,-16],[32,17]],'#666965','#3d433e',2);
 polygon([[-31,18],[-5,-17],[4,16]],'#8b9290');polygon([[5,14],[18,-16],[32,17]],'#a4a29a');
 polygon([[-5,-17],[1,-4],[-11,-4]],'#d0caba');polygon([[18,-16],[22,-4],[12,-5]],'#e7d48d');
 [[-14,1],[7,9],[19,4]].forEach(([a,b])=>{polygon([[a,b-7],[a+5,b],[a,b+8],[a-5,b]],'#e8c16b','#a58236',1);});ctx.restore();}
function drawResource(r){const x=(r.x+.5)*TILE,y=(r.y+.5)*TILE;if(r.amount<=0)return;
 if(r.type==='wood'){tree(x-19,y+12,.72,r.id);deciduousTree(x+10,y+10,.70);tree(x+16,y-9,.55);}
 if(r.type==='food')wheat(x,y+5,.88);
 if(r.type==='gold')mine(x,y+4,.86);
}
function drawBuilding(b){const x=(b.x+.5)*TILE,y=(b.y+.5)*TILE,c=FACTIONS[b.p];ctx.save();ctx.translate(x,y);oval(3,24,39,17,'#14241db0');
 if(b.type==='keep'){
  // Stone castle: three towers, crenellated walls, central gate, banners.
  box(-31,-28,63,53,'#7b7c70');box(-28,-22,57,44,'#9ba093');
  for(let i=0;i<7;i++){box(-30+i*9,-31,6,11,i%2?'#b2b5a6':'#d1c9b7');}
  box(-36,-47,17,70,'#858b83');box(20,-47,17,70,'#858b83');
  for(const xx of [-36,20]){for(let i=0;i<3;i++)box(xx+i*6,-54,4,10,'#d1c9b7');box(xx+4,-24,6,11,'#303f42');}
  box(-11,-56,22,42,'#aab0a6');polygon([[-16,-55],[0,-79],[16,-55]],'#484d56','#242b30',1);
  box(-13,-2,26,27,'#413428');ctx.beginPath();ctx.arc(0,-2,13,Math.PI,2*Math.PI);ctx.fillStyle='#413428';ctx.fill();
  line(0,-26,0,7,'#4d3d2f',2);line(-15,9,15,9,'#605040',2);
  box(11,-58,3,41,'#d3c19b');polygon([[14,-58],[34,-54],[14,-42]],c);
 }else if(b.type==='tower'){
  box(-16,-55,32,81,'#989b8e');box(-12,-50,24,73,'#b5b2a2');for(let i=0;i<4;i++)box(-18+i*10,-64,8,12,'#a9aaa0');
  box(-6,-39,12,19,'#344348');box(-7,2,14,22,'#504439');line(5,-72,5,-54,'#e7ce91',3);polygon([[5,-72],[28,-67],[5,-58]],c);
 }else if(b.type==='house'){
  box(-30,-18,60,42,'#c3ac7c');box(-22,-13,40,38,'#a18b6a');polygon([[-37,-17],[0,-48],[37,-17]],'#99703e','#624d30',2);
  for(let i=0;i<5;i++)line(-27+i*13,-23,-15+i*9,-35,'#c7a15f',3);box(-7,3,14,23,'#544633');box(-24,-7,10,10,'#3d574e');
 }else if(b.type==='barracks'){
  box(-34,-23,68,49,'#9b8465');for(let i=0;i<6;i++)line(-31+i*12,-20,-31+i*12,24,'#5b4b38',3);
  polygon([[-42,-24],[0,-53],[42,-24]],'#80604a','#4c3e34',2);polygon([[-42,-24],[0,-53],[0,-23]],'#ad8159');
  box(-10,2,20,24,'#40372f');line(27,-43,27,-8,'#d1bd8c',3);polygon([[27,-43],[47,-36],[27,-24]],c);
  line(-24,7,-24,-14,'#aebdc1',4);line(-30,-13,-18,-13,'#c0c7bc',3);
 }else if(b.type==='range'){
  box(-34,-20,68,46,'#a39376');polygon([[-41,-20],[0,-49],[41,-20]],'#806b4d','#564632',2);
  box(-25,-15,10,29,'#785e3e');box(16,-15,10,29,'#785e3e');oval(0,2,15,15,'#d5bd80');oval(0,2,10,10,'#9c543e');oval(0,2,5,5,'#e2d3a0');
  line(28,-57,28,-25,'#d4c799',3);polygon([[28,-57],[49,-49],[28,-38]],c);
 }else if(b.type==='stable'){
  box(-36,-22,72,50,'#967d5d');polygon([[-42,-23],[0,-48],[42,-23]],'#a48659','#5b503b',2);
  for(let i=0;i<6;i++)line(-30+i*12,-22,-30+i*12,26,'#5d4c35',2);box(-14,-9,28,36,'#4d4532');
  polygon([[-15,13],[0,-4],[15,13]],'#9c7e58');oval(0,-6,7,5,'#a9956c');line(29,-50,29,-28,'#d1c09b',2);polygon([[29,-50],[48,-44],[29,-36]],c);
 }
 // Banner at feet for faction identification, along with construction scaffolding.
 box(-27,27,54,5,'#222922b5');box(-27,27,54*Math.max(0,b.hp/b.maxHp),5,c);
 if(b.progress<1){box(-39,-17,4,53,'#9c7444');box(35,-17,4,53,'#9c7444');line(-38,-14,38,22,'#e3bb67',4);line(-38,22,38,-14,'#e3bb67',4);}
 ctx.restore();}
function drawUnit(u,t){const x=(u.x+.5)*TILE,y=(u.y+.5)*TILE,c=FACTIONS[u.p];ctx.save();ctx.translate(x,y);const bob=Math.sin(t*5+u.id*2)*1.2;
 oval(2,13,15,5,'#11201894');ctx.translate(0,bob);
 if(u.type==='scout'){
  oval(0,-2,19,10,'#725641');polygon([[8,-10],[25,-18],[23,4],[8,4]],'#86674c');oval(22,-10,8,6,'#966f4b');
  for(const xx of [-10,10])line(xx,4,xx+3,18,'#30291f',3);
  box(-8,-23,14,17,c);oval(0,-27,6,7,'#edc9a0');polygon([[-9,-33],[0,-42],[9,-33]],'#585e61');
 }else{
  line(-5,5,-7,17,'#564335',4);line(5,5,7,17,'#564335',4);
  box(-10,-17,20,24,u.type==='villager'?'#9a8060':c);polygon([[-11,-18],[11,-18],[7,-23],[-7,-23]],'#ddd1aa');
  oval(0,-27,8,10,'#e2b58f');
  if(u.type==='villager'){
   polygon([[-12,-29],[0,-38],[12,-29]],'#75563a');line(13,-12,22,-28,'#705039',3);polygon([[19,-36],[29,-32],[21,-22]],'#a9b3ac');
  }else if(u.type==='swordsman'){
   box(-9,-37,18,9,'#747f85');polygon([[-12,-36],[0,-44],[12,-36]],'#acb1b2');oval(-16,-6,9,13,'#535d61');oval(-16,-7,6,10,c);
   line(16,-6,21,-34,'#d0d3c7',3);line(11,-22,27,-22,'#8d7d59',3);
  }else if(u.type==='archer'){
   polygon([[-9,-36],[0,-44],[9,-36]],'#4b6446');ctx.beginPath();ctx.arc(17,-18,14,-Math.PI*.5,Math.PI*.5);ctx.strokeStyle='#b4854a';ctx.lineWidth=3;ctx.stroke();line(17,-32,17,-4,'#e3c988',1);line(0,-15,29,-19,'#c0a173',2);
  }
 }
 if(selected.includes(u.id)){ctx.beginPath();ctx.ellipse(0,11,u.type==='scout'?25:21,9,0,0,Math.PI*2);ctx.strokeStyle='#f9e09b';ctx.lineWidth=2.5;ctx.stroke();}
 if(u.hp<u.maxHp||selected.includes(u.id)){box(-17,-48,34,4,'#322823');box(-17,-48,34*Math.max(0,u.hp/u.maxHp),4,u.hp/u.maxHp<.35?'#e56553':'#74b973');}
 ctx.restore();}
function drawMini(){if(!state)return;const w=mini.width,h=mini.height,minx=x=>x/COLS*w,miny=y=>y/ROWS*h;
 minictx.fillStyle='#537247';minictx.fillRect(0,0,w,h);
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){if(randSeed(x,y)>.65){minictx.fillStyle='#688154';minictx.fillRect(minx(x),miny(y),w/COLS+1,h/ROWS+1);}}
 for(const r of resources()){if(r.amount<=0)continue;minictx.fillStyle=r.type==='gold'?'#d7ba66':r.type==='food'?'#b9ad5f':'#294e34';minictx.fillRect(minx(r.x)-1,miny(r.y)-1,5,5);}
 for(const b of buildings()){minictx.fillStyle=FACTIONS[b.p];minictx.fillRect(minx(b.x)-3,miny(b.y)-3,b.type==='keep'?8:5,b.type==='keep'?8:5);}
 for(const u of units()){minictx.fillStyle=FACTIONS[u.p];minictx.fillRect(minx(u.x)-1,miny(u.y)-1,3,3);}
 const left=(camera.x-viewport.w/(2*camera.zoom))/TILE,top=(camera.y-viewport.h/(2*camera.zoom))/TILE;
 minictx.strokeStyle='#f6ebc9';minictx.lineWidth=1.5;minictx.strokeRect(minx(left),miny(top),minx(viewport.w/(camera.zoom*TILE)),miny(viewport.h/(camera.zoom*TILE)));
}
function frame(now){const dt=Math.min(.055,(now-lastFrame)/1000);lastFrame=now;const speed=480*dt/camera.zoom;
 if(keys.has('a')||keys.has('arrowleft'))camera.x-=speed;if(keys.has('d')||keys.has('arrowright'))camera.x+=speed;
 if(keys.has('w')||keys.has('arrowup'))camera.y-=speed;if(keys.has('s')||keys.has('arrowdown'))camera.y+=speed;clampCamera();
 resize();ctx.clearRect(0,0,viewport.w,viewport.h);box(0,0,viewport.w,viewport.h,'#233a2a');
 ctx.save();ctx.translate(viewport.w/2,viewport.h/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);
 if(!terrain)createTerrain();ctx.drawImage(terrain,0,0);
 if(state){for(const r of resources())drawResource(r);
  for(const b of buildings())drawBuilding(b);
  for(const u of units())drawUnit(u,now/1000);
  if(buildMode&&me!==null){const gx=Math.floor(mouse.worldX/TILE),gy=Math.floor(mouse.worldY/TILE);if(gx>=0&&gx<COLS&&gy>=0&&gy<ROWS){const occupied=resources().some(r=>r.x===gx&&r.y===gy&&r.amount>0)||buildings().some(b=>Math.hypot(b.x-gx,b.y-gy)<1.4);
    const worker=selected.map(entity).find(u=>u?.type==='villager');const valid=!occupied&&worker&&Math.hypot(gx-worker.x,gy-worker.y)<=5.8;
    box(gx*TILE,gy*TILE,TILE,TILE,valid?'#9bc78066':'#f06b5f65');ctx.lineWidth=3;ctx.strokeStyle=valid?'#d9f6a8':'#ff998c';ctx.strokeRect(gx*TILE+2,gy*TILE+2,TILE-4,TILE-4);
  }}
  if(drag&&!drag.pan&&Math.hypot(drag.x2-drag.x,drag.y2-drag.y)>12&&drag.button===0){const aa=pointToWorld(drag.x,drag.y),bb=pointToWorld(drag.x2,drag.y2);const lx=Math.min(aa.x,bb.x),ly=Math.min(aa.y,bb.y),ww=Math.abs(aa.x-bb.x),hh=Math.abs(aa.y-bb.y);
    box(lx,ly,ww,hh,'#d4eec32d');ctx.strokeStyle='#e7e5ac';ctx.lineWidth=2;ctx.strokeRect(lx,ly,ww,hh);}
 }
 ctx.restore();if(now-lastMini>350){drawMini();lastMini=now;}requestAnimationFrame(frame);
}
resize();createTerrain();requestAnimationFrame(frame);
