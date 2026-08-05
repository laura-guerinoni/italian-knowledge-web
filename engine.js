// Shared engine for the Italian Knowledge Web. One copy, used by every
// student's page. What each student sees is decided entirely by the data
// fetched before this file runs (see boot() below): topics.json, edges.json,
// categories.json, ui-strings.json, and data/students/<id>.json.
//
// A topic is visible to a student only if:
//   1. its key is in that student's `topics` allow-list, AND
//   2. it has content written for that student's `lang`.
// Anything else is silently omitted (no half-translated topics leaking through).

let DATA = {};     // resolved, single-language topic map for the current student
let EDGES = [];    // resolved edges, filtered to topics both endpoints of which are visible
let CAT_COLORS = {};
let UI = {};
let LANG = 'en';

function resolveForStudent(topicsRaw, edgesRaw, catColorsRaw, profile) {
  const allow = new Set(profile.topics);
  const resolved = {};
  for (const key of Object.keys(topicsRaw)) {
    if (!allow.has(key)) continue;
    const t = topicsRaw[key];
    const localized = t[profile.lang];
    if (!localized) continue; // hide topics not yet translated for this student
    resolved[key] = {
      icon: t.icon,
      title: t.title,
      category: t.category,
      subtitle: localized.subtitle,
      sections: localized.sections,
    };
  }
  const resolvedEdges = edgesRaw.filter(([a, b]) => resolved[a] && resolved[b]);
  return { data: resolved, edges: resolvedEdges, catColors: catColorsRaw };
}

function applyChrome(profile) {
  document.title = UI.docTitle.replace('{name}', profile.displayName);
  document.getElementById('header').querySelector('h1').textContent = UI.headerTitle;
  document.getElementById('search-input').placeholder = UI.searchPlaceholder;
  document.getElementById('hint').innerHTML = UI.hint;

  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  const catsInUse = new Set(Object.values(DATA).map(d => d.category));
  for (const cat of Object.keys(CAT_COLORS)) {
    if (!catsInUse.has(cat)) continue;
    const label = (UI.categories && UI.categories[cat]) || cat;
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.onclick = () => toggleCatFilter(cat, item);
    const dot = document.createElement('div');
    dot.className = 'legend-dot';
    dot.style.background = CAT_COLORS[cat];
    item.appendChild(dot);
    item.appendChild(document.createTextNode(label));
    legend.appendChild(item);
  }
}

// ─── GRAPH ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W, H, nodes = [], edgeList = [], zoom = 1, panX = 0, panY = 0;
let dragging = null, dragOffX = 0, dragOffY = 0;
let hoveredNode = null, selectedNode = null, filterQuery = '', filterCategory = null;
let t = 0;

const DPR = window.devicePixelRatio || 1;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);

// Seed positions by category cluster
const CLUSTER = {
  'core-verbs':{x:0.38,y:0.42},'modal-verbs':{x:0.65,y:0.28},'regular-verbs':{x:0.48,y:0.62},
  'liking':{x:0.68,y:0.62},'articles':{x:0.18,y:0.58},'adjectives':{x:0.22,y:0.3},
  'prepositions':{x:0.55,y:0.82},'questions':{x:0.78,y:0.48},'vocabulary':{x:0.52,y:0.88},'pronunciation':{x:0.12,y:0.42},
  'tenses':{x:0.35,y:0.75},
};

function init() {
  const keys = Object.keys(DATA);
  nodes = keys.map(key => {
    const d = DATA[key];
    const c = CLUSTER[d.category] || {x:0.5, y:0.5};
    return {
      key, data:d,
      x: W * c.x + (Math.random()-0.5)*120,
      y: H * c.y + (Math.random()-0.5)*120,
      vx:0, vy:0,
      radius: 28,
      color: CAT_COLORS[d.category] || '#888',
      phase: Math.random()*Math.PI*2,
      pSpeed: 0.4+Math.random()*0.6,
    };
  });
  edgeList = EDGES.map(([a,b])=>{
    const s=nodes.find(n=>n.key===a), t2=nodes.find(n=>n.key===b);
    return s&&t2?{s,t:t2}:null;
  }).filter(Boolean);
}

function forces() {
  const REP=2800, ATT=0.016, IDEAL=155, DAMP=0.83, CENTER=0.004;
  for(let i=0;i<nodes.length;i++) {
    const a=nodes[i];
    for(let j=i+1;j<nodes.length;j++) {
      const b=nodes[j];
      const dx=b.x-a.x, dy=b.y-a.y, d=Math.sqrt(dx*dx+dy*dy)||1;
      const f=REP/(d*d), fx=f*dx/d, fy=f*dy/d;
      a.vx-=fx;a.vy-=fy;b.vx+=fx;b.vy+=fy;
    }
  }
  for(const e of edgeList) {
    const dx=e.t.x-e.s.x, dy=e.t.y-e.s.y, d=Math.sqrt(dx*dx+dy*dy)||1;
    const f=ATT*(d-IDEAL), fx=f*dx/d, fy=f*dy/d;
    e.s.vx+=fx;e.s.vy+=fy;e.t.vx-=fx;e.t.vy-=fy;
  }
  for(const n of nodes) {
    if(n===dragging)continue;
    n.vx+=(W/2-n.x)*CENTER; n.vy+=(H/2-n.y)*CENTER;
    n.vx*=DAMP; n.vy*=DAMP;
    n.x+=n.vx; n.y+=n.vy;
  }
}

function hex2rgba(h,a) {
  const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function isVisible(n) {
  if(!filterQuery)return true;
  const q=filterQuery.toLowerCase();
  return n.data.title.toLowerCase().includes(q)||n.data.subtitle.toLowerCase().includes(q)||n.key.toLowerCase().includes(q);
}

function draw() {
  t+=0.012;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.setTransform(DPR*zoom,0,0,DPR*zoom,panX*DPR,panY*DPR);

  const focusNode = hoveredNode || selectedNode || null;
  const hovConnected = new Set();
  if(focusNode) {
    hovConnected.add(focusNode);
    for(const e of edgeList) {
      if(e.s===focusNode) hovConnected.add(e.t);
      if(e.t===focusNode) hovConnected.add(e.s);
    }
  }

  for(const e of edgeList) {
    const sv=isVisible(e.s), tv=isVisible(e.t);
    const edgeInCluster = focusNode ? (hovConnected.has(e.s) && hovConnected.has(e.t)) : true;
    const edgeInCat = filterCategory ? (e.s.data.category===filterCategory && e.t.data.category===filterCategory) : true;
    const alpha=(sv&&tv) ? (focusNode ? (edgeInCluster ? 0.6 : 0.06) : (filterCategory ? (edgeInCat ? 0.5 : 0.04) : 0.3)) : 0.06;
    const pulse=0.5+0.5*Math.sin(t*1.5+e.s.phase);
    ctx.beginPath(); ctx.moveTo(e.s.x,e.s.y); ctx.lineTo(e.t.x,e.t.y);
    const g=ctx.createLinearGradient(e.s.x,e.s.y,e.t.x,e.t.y);
    g.addColorStop(0,hex2rgba(e.s.color,alpha*(0.7+0.3*pulse)));
    g.addColorStop(1,hex2rgba(e.t.color,alpha*(0.7+0.3*pulse)));
    ctx.strokeStyle=g;
    ctx.lineWidth=(focusNode&&(e.s===focusNode||e.t===focusNode))?2.5:1;
    ctx.stroke();
    if(sv&&tv) {
      const tp=((t*0.35+e.s.phase)%1+1)%1;
      ctx.beginPath();
      ctx.arc(e.s.x+(e.t.x-e.s.x)*tp, e.s.y+(e.t.y-e.s.y)*tp, 2.2, 0, Math.PI*2);
      ctx.fillStyle=hex2rgba(e.s.color,0.8); ctx.fill();
    }
  }

  for(const n of nodes) {
    const vis=isVisible(n);
    const hov=n===hoveredNode, sel=n===selectedNode;
    const inCluster = focusNode ? hovConnected.has(n) : true;
    const inCatFilter = filterCategory ? (n.data.category === filterCategory) : true;
    const pulse=1+0.05*Math.sin(t*n.pSpeed+n.phase);
    const r=n.radius*pulse*(hov?1.18:1);
    const baseAlpha = vis ? (focusNode ? (inCluster ? 1 : 0.28) : (filterCategory ? (inCatFilter ? 1 : 0.12) : 1)) : 0.12;
    ctx.globalAlpha=baseAlpha;

    if(vis) {
      const gw=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r*2.5);
      gw.addColorStop(0,hex2rgba(n.color,0.2)); gw.addColorStop(1,hex2rgba(n.color,0));
      ctx.beginPath(); ctx.arc(n.x,n.y,r*2.5,0,Math.PI*2);
      ctx.fillStyle=gw; ctx.fill();
    }

    const cg=ctx.createRadialGradient(n.x-r*0.2,n.y-r*0.2,0,n.x,n.y,r);
    cg.addColorStop(0,hex2rgba(n.color,0.72)); cg.addColorStop(1,hex2rgba(n.color,0.62));
    ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2);
    ctx.fillStyle=cg; ctx.fill();
    ctx.strokeStyle=sel?'rgba(44,31,20,0.9)':hex2rgba('#2C1F14',hov?0.5:0.15);
    ctx.lineWidth=sel?2.5:1.5; ctx.stroke();

    ctx.font=`${r*0.72}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#fff'; ctx.fillText(n.data.icon,n.x,n.y-1);

    ctx.font=`bold ${Math.max(9,r*0.3)}px "Segoe UI",sans-serif`;
    ctx.fillStyle=vis?'rgba(44,31,20,0.85)':'rgba(44,31,20,0.25)';
    ctx.fillText(n.data.title,n.x,n.y+r+11);
    ctx.globalAlpha=1;
  }
  forces(); requestAnimationFrame(draw);
}

function worldPos(ex,ey){return{x:(ex-panX)/zoom,y:(ey-panY)/zoom};}
function nodeAt(ex,ey){
  const{x,y}=worldPos(ex,ey);
  for(let i=nodes.length-1;i>=0;i--){
    const n=nodes[i],dx=x-n.x,dy=y-n.y;
    if(dx*dx+dy*dy<(n.radius*1.5)*(n.radius*1.5))return n;
  }return null;
}

let lastMX,lastMY,isPan=false,dragMoved=false;
canvas.addEventListener('mousedown',e=>{
  const n=nodeAt(e.clientX,e.clientY);
  if(n){dragging=n;dragMoved=false;const w=worldPos(e.clientX,e.clientY);dragOffX=n.x-w.x;dragOffY=n.y-w.y;}
  else{isPan=true;lastMX=e.clientX;lastMY=e.clientY;}
});
canvas.addEventListener('mousemove',e=>{
  hoveredNode=(filterCategory||selectedNode)?null:nodeAt(e.clientX,e.clientY);
  canvas.style.cursor=hoveredNode?'pointer':(isPan?'grabbing':'grab');
  if(dragging){const w=worldPos(e.clientX,e.clientY);dragging.x=w.x+dragOffX;dragging.y=w.y+dragOffY;dragging.vx=0;dragging.vy=0;dragMoved=true;}
  else if(isPan){panX+=e.clientX-lastMX;panY+=e.clientY-lastMY;lastMX=e.clientX;lastMY=e.clientY;}
});
canvas.addEventListener('mouseup',e=>{
  if(dragging&&!dragMoved)openPanel(dragging.key);
  dragging=null;isPan=false;
});
canvas.addEventListener('click',e=>{
  const n=nodeAt(e.clientX,e.clientY);
  if(!n&&!e.target.closest('#panel'))closePanel();
});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const f=e.deltaY<0?1.1:0.91;
  panX=e.clientX-(e.clientX-panX)*f;
  panY=e.clientY-(e.clientY-panY)*f;
  zoom=Math.max(0.25,Math.min(3.5,zoom*f));
},{passive:false});

// ─── PANEL ──────────────────────────────────────────────────────────────
function openPanel(key){
  const d=DATA[key]; if(!d)return;
  selectedNode=nodes.find(n=>n.key===key);
  document.getElementById('panel-icon').textContent=d.icon;
  document.getElementById('panel-title').textContent=d.title;
  document.getElementById('panel-subtitle').textContent=d.subtitle;
  document.getElementById('panel-body').innerHTML=d.sections.map(s=>{
    if(s.type==='links')return`<div class="section"><div class="section-title">${s.title}</div><div class="links-section">${s.items.map(k=>{const dd=DATA[k];return`<button class="link-btn" onclick="openPanel('${k}')">${dd?dd.icon+' ':''} ${dd?dd.title:k}</button>`;}).join('')}</div></div>`;
    if(s.type==='pills')return`<div class="section"><div class="section-title">${s.title}</div><div class="pills">${s.items.map(i=>`<span class="pill">${i}</span>`).join('')}</div></div>`;
    if(s.type==='rule')return`<div class="section"><div class="section-title">${s.title}</div><div class="rule-box">${s.content}</div></div>`;
    if(s.type==='examples')return`<div class="section"><div class="section-title">${s.title}</div><ul class="examples-list">${s.items.map(i=>`<li><span class="it">${i.it}</span><br><span class="en">${i.tr}</span></li>`).join('')}</ul></div>`;
    if(s.type==='table')return`<div class="section"><div class="section-title">${s.title}</div><table class="conj-table">${s.rows.map(r=>`<tr><td class="pro">${r[0]}</td><td class="form">${r[1]}</td>${r[2]?`<td style="color:rgba(255,255,255,0.38);font-size:11px">${r[2]}</td>`:''}</tr>`).join('')}</table></div>`;
    return'';
  }).join('');
  const cards = buildCards(key);
  if (cards.length > 0) {
    document.getElementById('panel-body').innerHTML +=
      `<button id="drill-btn" onclick="openDrill('${key}')">${UI.drillButton.replace('{count}', cards.length)}</button>`;
  }

  document.getElementById('panel').classList.add('open');
}
function closePanel(){document.getElementById('panel').classList.remove('open');selectedNode=null;}
function filterNodes(q){filterQuery=q;}
function toggleCatFilter(cat, el) {
  if (filterCategory === cat) {
    filterCategory = null;
    document.querySelectorAll('.legend-item').forEach(i => i.classList.remove('active'));
  } else {
    filterCategory = cat;
    document.querySelectorAll('.legend-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
  }
}

// ─── FLASHCARD DRILL ──────────────────────────────────────────────────
let fcCards = [], fcIndex = 0, fcRevealed = false;

function buildCards(key) {
  const d = DATA[key];
  if (!d) return [];
  const cards = [];
  for (const s of d.sections) {
    if (s.type === 'table') {
      for (const row of s.rows) {
        if (!row[1]) continue;
        cards.push({ type: s.title, front: row[0], back: row[1] + (row[2] ? ' — ' + row[2] : '') });
      }
    } else if (s.type === 'examples') {
      for (const ex of s.items) {
        cards.push({ type: UI.cardTypeTranslate, front: ex.it, back: ex.tr });
      }
    } else if (s.type === 'pills') {
      for (const item of s.items) {
        const sep = item.indexOf(' — ');
        if (sep > -1) {
          cards.push({ type: UI.cardTypeVocabulary, front: item.slice(0, sep), back: item.slice(sep + 3) });
        }
      }
    }
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function openDrill(key) {
  const d = DATA[key];
  if (!d) return;
  fcCards = buildCards(key);
  if (fcCards.length === 0) return;
  fcIndex = 0;
  document.getElementById('fc-topic').textContent = d.icon + '  ' + d.title;
  document.getElementById('fc-icon').textContent = d.icon;
  showCard();
  document.getElementById('flashcard-overlay').classList.add('active');
}

function showCard() {
  const c = fcCards[fcIndex];
  fcRevealed = false;
  document.getElementById('fc-type-label').textContent = c.type;
  document.getElementById('fc-front').textContent = c.front;
  document.getElementById('fc-back').textContent = c.back;
  document.getElementById('fc-back').style.display = 'none';
  document.getElementById('fc-tap-hint').style.display = '';
  document.getElementById('fc-progress').textContent = (fcIndex + 1) + ' / ' + fcCards.length;
  document.getElementById('fc-card').style.borderColor = '';
}

function revealCard() {
  if (fcRevealed) { nextCard(); return; }
  fcRevealed = true;
  document.getElementById('fc-back').style.display = '';
  document.getElementById('fc-tap-hint').style.display = 'none';
  document.getElementById('fc-card').style.borderColor = 'rgba(168,216,234,0.5)';
}

function nextCard() {
  fcIndex = (fcIndex + 1) % fcCards.length;
  showCard();
}

function prevCard() {
  fcIndex = (fcIndex - 1 + fcCards.length) % fcCards.length;
  showCard();
}

function closeDrill() {
  document.getElementById('flashcard-overlay').classList.remove('active');
}

function randomDrill() {
  const drillable = nodes.filter(n => buildCards(n.key).length > 0);
  if (!drillable.length) return;
  const n = drillable[Math.floor(Math.random() * drillable.length)];
  openDrill(n.key);
}

document.addEventListener('keydown', e => {
  const overlay = document.getElementById('flashcard-overlay');
  if (overlay.classList.contains('active')) {
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); revealCard(); }
    if (e.key === 'ArrowLeft') prevCard();
    if (e.key === 'Escape') closeDrill();
  } else {
    if (e.key === 'f' || e.key === 'F') randomDrill();
  }
});

// ─── BOOT ───────────────────────────────────────────────────────────────
async function boot(studentId) {
  const [topicsRaw, edgesRaw, catColorsRaw, uiStrings, profile] = await Promise.all([
    fetch('../data/topics.json').then(r => r.json()),
    fetch('../data/edges.json').then(r => r.json()),
    fetch('../data/categories.json').then(r => r.json()),
    fetch('../data/ui-strings.json').then(r => r.json()),
    fetch(`../data/students/${studentId}.json`).then(r => r.json()),
  ]);

  LANG = profile.lang;
  UI = uiStrings[LANG] || uiStrings.en;
  const resolved = resolveForStudent(topicsRaw, edgesRaw, catColorsRaw, profile);
  DATA = resolved.data;
  EDGES = resolved.edges;
  CAT_COLORS = resolved.catColors;

  applyChrome(profile);
  start();
}

function start() {
  resize();
  if (!W || !H) { requestAnimationFrame(start); return; }
  init();
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  nodes.forEach(n=>{minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);});
  panX = W/2 - (minX+maxX)/2;
  panY = H/2 - (minY+maxY)/2;
  draw();
}
