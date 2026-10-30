const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id), W=18,H=12,T=64;
let ws=null,me=null,state=null,players=[],selected=null,buildMode=null,code='';
const faction=['#6dbdf7','#ef7770','#ecc76c','#b697f5'];
const colorNames=['BLEU','ROUGE','OR','VIOLET'];
const randomCode=()=>Math.random().toString(36).slice(2,8).toUpperCase();
$('room').value=new URLSearchParams(location.search).get('room')||randomCode();
$('join').addEventListener('click',join);$('room').addEventListener('keydown',e=>{if(e.key==='Enter')join();});
function notice(text){$('message').textContent=text;}
function join(){code=$('room').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);if(code.length<3){$('joinError').textContent='Saisis un code de trois caractères minimum.';return;}
 $('join').disabled=true;const protocol=location.protocol==='https:'?'wss:':'ws:';
 ws=new WebSocket(`${protocol}//${location.host}`);
 ws.addEventListener('open',()=>ws.send(JSON.stringify({type:'join',code})));
 ws.addEventListener('message',evt=>{let m;try{m=JSON.parse(evt.data)}catch{return;}
  if(m.type==='error'){$('joinError').textContent=m.text;$('join').disabled=false;ws.close();}
  if(m.type==='joined'){me=m.player;history.replaceState({},'',`?room=${m.code}`);$('welcome').classList.add('hidden');$('roomlabel').textContent=m.code;$('playerlabel').textContent=`Tu es le joueur ${me+1} (${colorNames[me]})`;$('connection').textContent='● Connecté';notice('Choisis une unité pour commencer');}
  if(m.type==='state'){state=m.state;players=m.players;draw();updatePanel();$('opponent').textContent=`${players.filter(Boolean).length} / 4 joueurs connectés · ${m.joined.filter(Boolean).length} royaumes créés`; if(state.winner!==null)notice(state.winner===me?'🏆 VICTOIRE ! Dernier royaume debout.':`🏆 Le joueur ${state.winner+1} a gagné.`);else if(state.eliminated.includes(me))notice('💀 Ton royaume a été éliminé.');}
  if(m.type==='notice')notice(m.text);
 });
 ws.addEventListener('close',()=>{$('connection').textContent='● Déconnecté';if(me===null){$('join').disabled=false;}else notice('Connexion perdue : recharge la page pour revenir au salon.');});
 ws.addEventListener('error',()=>{$('joinError').textContent='Impossible de contacter le serveur.';});
}
$('share').onclick=async()=>{const link=`${location.origin}/?room=${encodeURIComponent(code)}`;try{await navigator.clipboard.writeText(link);notice('Lien copié : envoie-le à ton ami !');}catch{window.prompt('Copie ce lien :',link);}};
function send(o){if(ws&&ws.readyState===1)ws.send(JSON.stringify(o));}
function entity(id){return state?.units.find(u=>u.id===id)||state?.buildings.find(b=>b.id===id);}
function getCell(ev){const rect=canvas.getBoundingClientRect();const px=(ev.clientX-rect.left)*canvas.width/rect.width,py=(ev.clientY-rect.top)*canvas.height/rect.height;return{x:Math.floor(px/T),y:Math.floor(py/T),px:px/T,py:py/T};}
canvas.addEventListener('click',ev=>{if(!state||me===null||state.winner!==null||state.eliminated.includes(me))return;let {x,y,px,py}=getCell(ev);if(x<0||x>=W||y<0||y>=H)return;
 const unit=state.units.filter(u=>Math.hypot(u.x+.5-px,u.y+.5-py)<.42).sort((a,b)=>Math.hypot(a.x+.5-px,a.y+.5-py)-Math.hypot(b.x+.5-px,b.y+.5-py))[0];
 const building=state.buildings.find(b=>b.x===x&&b.y===y);
 const enemy=(unit&&unit.p!==me?unit:null)||(building&&building.p!==me?building:null);
 const own=(unit&&unit.p===me?unit:null)||(building&&building.p===me?building:null);
 if(buildMode){const u=entity(selected);if(u&&u.type==='worker'&&u.p===me)send({type:'build',id:u.id,building:buildMode,x,y});buildMode=null;updatePanel();return;}
 if(own){selected=own.id;updatePanel();draw();return;}
 const chosen=entity(selected);if(!chosen||!('target' in chosen)||chosen.p!==me)return;
 if(enemy)send({type:'order',id:chosen.id,targetId:enemy.id,x,y});
 else{const res=state.resources.find(r=>r.x===x&&r.y===y);if(res&&chosen.type==='worker')send({type:'order',id:chosen.id,resourceId:res.id,x,y});else send({type:'order',id:chosen.id,x,y});}
});
function updatePanel(){if(!state||me===null)return;const p=state.players[me];for(const k of ['wood','food','gold'])$(k).textContent=Math.floor(p[k]);let u=entity(selected),area=$('actions');area.replaceChildren();if(!u||u.p!==me){$('selected').textContent='Clique sur une unité ou un bâtiment de ta couleur.';return;}
 const names={keep:'🏰 Château',worker:'🧑‍🌾 Ouvrier',soldier:'⚔️ Soldat',barracks:'🛡️ Caserne',tower:'🏹 Tour'};
 $('selected').innerHTML=`<b>${names[u.type]}</b><br>Vie : ${Math.max(0,Math.ceil(u.hp))} / ${u.maxHp}`;
 function btn(label,cost,callback){const b=document.createElement('button');b.className='action';const total=Object.entries(cost).map(([key,n])=>`${n} ${key==='wood'?'🪵':key==='food'?'🌾':'🪙'}`).join(' · ');b.innerHTML=`${label}<small>${total}</small>`;b.disabled=Object.entries(cost).some(([k,n])=>p[k]<n);b.onclick=callback;area.append(b);}
 if(u.type==='keep')btn('Recruter un ouvrier',{food:55},()=>send({type:'train',id:u.id,unit:'worker'}));
 if(u.type==='barracks')btn('Former un soldat',{food:70,gold:35},()=>send({type:'train',id:u.id,unit:'soldier'}));
 if(u.type==='worker'){btn('Construire une caserne',{wood:90,gold:45},()=>{buildMode='barracks';notice('Clique sur une case libre à proximité de ton ouvrier');updatePanel();});btn('Construire une tour',{wood:85,gold:65},()=>{buildMode='tower';notice('Clique sur une case libre à proximité de ton ouvrier');updatePanel();});if(buildMode){let b=document.createElement('button');b.className='secondary';b.textContent='Annuler construction';b.onclick=()=>{buildMode=null;updatePanel();};area.append(b);}}
}
function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function text(s,x,y,size=18,color='#fff'){ctx.fillStyle=color;ctx.font=`${size}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(s,x,y);}
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function hpbar(u,x,y,w=50){rect(x-w/2,y,w,5,'#27372b');rect(x-w/2,y,w*Math.max(0,u.hp/u.maxHp),5,faction[u.p]);}
const grass=['#354c33','#3c5538','#415b3a','#3a5135','#3b5437'];
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);for(let y=0;y<H;y++)for(let x=0;x<W;x++){rect(x*T,y*T,T,T,grass[(x*5+y*7+x*y)%grass.length]);ctx.strokeStyle='#ffffff0a';ctx.strokeRect(x*T+.5,y*T+.5,T,T);if((x*7+y*13)%5===0){text('·',x*T+15,y*T+58,18,'#7a96655a');}}
 if(!state){text('EMPIRE DUEL',576,350,60,'#e8c677');text('Connecte-toi pour lancer la partie',576,405,20);return;}
 for(const r of state.resources){const cx=r.x*T+40,cy=r.y*T+40;ellipse(cx,cy+20,27,11,'#0003');if(r.type==='wood'){text('🌲',cx-10,cy,37);text('🌳',cx+12,cy+6,36);}else if(r.type==='gold'){text('⛰️',cx,cy,42);text('✨',cx+16,cy-12,19);}else{text('🌾',cx-12,cy,34);text('🌾',cx+14,cy+8,32);}}
 for(const b of state.buildings){const cx=(b.x+.5)*T,cy=(b.y+.5)*T;ellipse(cx,cy+24,33,13,'#0006');rect(cx-29,cy-24,58,52,['#2b5278','#7f3837','#8a7434','#56417d'][b.p]);ctx.strokeStyle=faction[b.p];ctx.lineWidth=3;ctx.strokeRect(cx-29,cy-24,58,52);text(b.type==='keep'?'🏰':b.type==='tower'?'🏹':'🏠',cx,cy-3,44);hpbar(b,cx,cy-39,63);if(b.id===selected){ctx.strokeStyle='#fff9b5';ctx.lineWidth=3;ctx.strokeRect(b.x*T+3,b.y*T+3,74,74);}}
 for(const u of state.units){let cx=(u.x+.5)*T,cy=(u.y+.5)*T;ellipse(cx,cy+19,22,8,'#0007');ellipse(cx,cy,22,22,faction[u.p]);ellipse(cx,cy,18,18,'#1f302c');text(u.type==='worker'?'🪓':'⚔️',cx,cy-1,27);hpbar(u,cx,cy-30,43);if(u.id===selected){ctx.beginPath();ctx.arc(cx,cy,29,0,2*Math.PI);ctx.strokeStyle='#fff4a4';ctx.lineWidth=3;ctx.stroke();}if(u.target&&u.target.kind==='harvest'){text('⛏',cx+22,cy-19,15);}}
 if(state.winner!==null){rect(0,320,1152,120,'#08120cdd');text(state.winner===me?'🏆 VICTOIRE !':`🏆 JOUEUR ${state.winner+1} VAINQUEUR`,576,380,43,'#edc878');}
}
window.addEventListener('keydown',e=>{if(e.key==='Escape'){buildMode=null;updatePanel();}});draw();
