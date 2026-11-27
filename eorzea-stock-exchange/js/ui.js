"use strict";
/* 艾奧傑亞證券交易所：UI 外框、左側選單、看盤專業功能、搜尋、跑馬燈 */
/* ========== UI 外框 ========== */
function showOverlay(t,s){$('#overlay').style.display='grid';$('#ovt').textContent=t;$('#ovs').textContent=s||'';$('#ovp').style.width='0'}
function setProgress(f,s){$('#ovp').style.width=(f*100).toFixed(0)+'%';if(s)$('#ovs').textContent=s}
function hideOverlay(){$('#overlay').style.display='none'}
function scopeName(){return S.scope?WN[S.scope]:DC+' DC'}

function renderShell(){
  $('#scope').innerHTML=`<option value="">陸行鳥 DC（全部）</option>`+WORLDS.map(([id,n])=>`<option value="${id}" ${S.scope==id?'selected':''}>${n}</option>`).join('');
  const r=location.hash||'#/';
  const L=(h,t,sub)=>`<a href="${h}" class="${sub?'sub ':''}${r===h||(h!=='#/'&&r.startsWith(h))?'on':''}">${t}</a>`;
  renderMbar();
  $('#nav').innerHTML=navHTML(L)+
    `<div class="foot">${navCustomized()?'<a class="nreset" data-navreset="1">重設選單順序</a><br>':''}<span class="maker">製作人（Threads）<br><a href="https://www.threads.com/@ilainosu.ffxiv" target="_blank" rel="noopener" title="在 Threads 上追蹤製作人">@ilainosu.ffxiv</a></span><br>資料：Universalis<br>名稱：ffxiv-datamining-tc<br>本站為非官方粉絲作品<br>FINAL FANTASY XIV © SQUARE ENIX<br>${S.cons?'成分股更新於<br>'+new Date(S.cons.t).toLocaleString('zh-TW'):''}</div>`;
  // 手機版：側欄頁尾移到頁面最下方；目前分頁捲到分頁列中間
  {const f=$('#nav .foot');$('#mfoot').innerHTML=f?f.innerHTML.replace(/<br>/g,'・'):''}
  if(matchMedia('(max-width:900px)').matches){const nv=$('#nav'),a=nv.querySelector('a.on');if(a)nv.scrollLeft=a.offsetLeft-nv.clientWidth/2+a.offsetWidth/2}
  renderUpd();
}
const star=id=>`<span class="star ${S.watch.includes(id)?'on':''}" data-star="${id}" title="自選股">★</span>`;
const nameCell=(id,showStar=true)=>{const it=ITEM[id];return `<div class="name">${showStar?star(id):''}${ico(it)}<span title="${esc(it.n)}">${esc(it.n)}</span>${mainQ(id)?'<span class="hq">HQ</span>':''}</div>`};

/* ========== 看盤專業功能 ========== */
const LIMIT=10;
const codeOf=id=>String(id).padStart(5,'0');
const isLimUp=c=>c!=null&&c>=LIMIT,isLimDn=c=>c!=null&&c<=-LIMIT;
function pctS(x){return '<span style="white-space:nowrap">'+pct(x)+(isLimUp(x)?'<span class="lim lu">漲停</span>':isLimDn(x)?'<span class="lim ld">跌停</span>':'')+'</span>'}
S.lastPx={};
function fx(id,v){const k=id+'|'+S.scope;const p=S.lastPx[k];S.lastPx[k]=v;return p!=null&&v!=null&&p!==v?(v>p?' fu':' fd'):''}
const pc=(v,ref)=>`<td class="num ${v==null||ref==null?'':cls(v-ref)}">${fmt(v)}</td>`;
function breadth(ids,world=S.scope){let up=0,dn=0,fl=0,lu=0,ld=0,amt=0,vol=0;
  ids.forEach(id=>{const s=stats(id,world);amt+=s.amt;vol+=s.vol;if(s.price==null)return;const c=s.chg;
    if(c==null||Math.abs(c)<0.005)fl++;else if(c>0)up++;else dn++;if(isLimUp(c))lu++;if(isLimDn(c))ld++});
  return {up,dn,fl,lu,ld,amt,vol}}
function renderMbar(){
  const el=$('#mbar');if(!el)return;
  if(!S.cons){el.innerHTML='<span class="muted" style="padding:0 14px">行情載入中…</span>';return}
  const ids=allCons();const ix=indexOf(ids);const b=breadth(ids);
  el.innerHTML=`<a class="mb-main" href="#/"><b>大盤</b><span class="num ${cls(ix.chg)}" style="font-size:15px;font-weight:700">${fmt(ix.v,2)}</span>${signed(ix.v!=null?ix.v-1000:null,2)}${pct(ix.chg)}</a>
  <span class="mb-i">成交額 <b class="num">${fmtBig(b.amt)}</b></span>
  <span class="mb-i">上漲 <b class="num up">${b.up}</b> <span class="muted">漲停</span> <b class="num up">${b.lu}</b></span>
  <span class="mb-i">下跌 <b class="num down">${b.dn}</b> <span class="muted">跌停</span> <b class="num down">${b.ld}</b></span>
  <span class="mb-i">平盤 <b class="num">${b.fl}</b></span>
  <span class="mb-sec">${SECTORS.map(s=>{const x=indexOf(S.cons.sectors[s.key]);return `<a href="#/sector/${s.key}">${s.name.replace('股','')} <span class="num ${cls(x.chg)}">${fmt(x.v,1)}</span>${pct(x.chg)}</a>`}).join('')}</span>
  <span class="mb-et"><span class="live"><i></i>盤中・24H</span><span class="muted">艾奧傑亞時間</span><b class="num" id="etclock">--:--</b></span>`;
  tickET();
}
function tickET(){const el=$('#etclock');if(!el)return;const et=Date.now()/1000*3600/175;el.textContent=String(Math.floor(et/3600)%24).padStart(2,'0')+':'+String(Math.floor(et/60)%60).padStart(2,'0')}

/* 報價表（類股、自選股、排行共用） */
const SORT={key:'amt',dir:-1};
function stockTable(ids,extra='',opt={}){
  let rows=ids.filter(id=>ITEM[id]).map(id=>{const s=stats(id);return {id,s,code:id,name:ITEM[id].n,price:s.price,diff:s.diff,chg:s.chg,open:s.open,high:s.high,low:s.low,ref:s.pP,amp:s.amp,vol:s.vol,amt:s.amt,vr:s.vr}});
  if(!opt.fixed)rows.sort((a,b)=>{const x=a[SORT.key],y=b[SORT.key];if(SORT.key==='name')return SORT.dir*x.localeCompare(y,'zh-Hant');return SORT.dir*((x??-Infinity)-(y??-Infinity))});
  if(opt.limit)rows=rows.slice(0,opt.limit);
  const OPT=new Set(['code','diff','open','high','low','ref','amp','vol','amt','vr']);
  const oc=k=>OPT.has(k)?` opt c-${k}`:'';
  // 手機版要保留的欄位：排行頁看排行種類，其餘看目前排序；排序欄不是次要欄位時預設保留成交額
  const show=opt.show||(OPT.has(SORT.key)?SORT.key:'amt');
  const H=(k,t,c='')=>opt.fixed?`<th class="${c}${oc(k)}">${t}</th>`:`<th data-sort="${k}" class="${c}${oc(k)}">${t}${SORT.key===k?(SORT.dir>0?' ▲':' ▼'):''}</th>`;
  const pcc=(v,ref,k)=>`<td class="num ${v==null||ref==null?'':cls(v-ref)}${oc(k)}">${fmt(v)}</td>`;
  return `<table class="quote" data-show="${show}"><tr>${opt.fixed?'<th class="l">#</th>':''}${H('code','代號','l')}${H('name','名稱','l')}${H('price','成交')}${H('diff','漲跌')}${H('chg','漲跌幅')}${H('open','開盤')}${H('high','最高')}${H('low','最低')}${H('ref','參考價')}${H('amp','振幅')}${H('vol','成交量')}${H('amt','成交額')}${H('vr','量比')}${opt.extraCol?`<th class="opt c-extra">${opt.extraCol.h}</th>`:''}</tr>
  ${rows.map((r,i)=>`<tr class="row" data-go="#/item/${r.id}">${opt.fixed?`<td class="l rk">${i+1}</td>`:''}<td class="l code opt c-code">${codeOf(r.id)}</td><td>${nameCell(r.id)}</td>
    <td class="num ${cls(r.chg)}${fx(r.id,r.price)}" style="font-weight:700">${fmt(r.price)}</td><td class="opt c-diff">${signed(r.diff)}</td><td>${pctS(r.chg)}</td>
    ${pcc(r.open,r.ref,'open')}${pcc(r.high,r.ref,'high')}${pcc(r.low,r.ref,'low')}<td class="num muted opt c-ref">${fmt(r.ref)}</td><td class="num opt c-amp">${r.amp!=null?fmt(r.amp,2)+'%':'—'}</td>
    <td class="num opt c-vol">${fmt(r.vol)}</td><td class="num opt c-amt">${fmtBig(r.amt)}</td><td class="num opt c-vr ${r.vr>=2?'up':''}">${r.vr!=null?fmt(r.vr,2):'—'}</td>${opt.extraCol?`<td class="num opt c-extra">${opt.extraCol.f(r)}</td>`:''}</tr>`).join('')||`<tr><td colspan=14 class="empty">${extra||'沒有資料'}</td></tr>`}</table>`;
}

/* ========== 左側選單：使用者可自訂順序 ==========
   電腦：直接用滑鼠拖曳；手機（上方分頁列）：長按任一分頁進入排序模式，用 ◀ ▶ 移動 */
const NAV_DEF=['home','wall','multi','heatmap','ranks','news','sector','servers','watch','journal'];
S.navOrder=lsGet('aex_navorder',null);S.navEdit=false;
const navOrder=()=>{const o=(S.navOrder||[]).filter(k=>NAV_DEF.includes(k));return [...o,...NAV_DEF.filter(k=>!o.includes(k))]};
const navCustomized=()=>navOrder().join()!==NAV_DEF.join();
function navHTML(L){
  const G={home:L('#/','看盤首頁'),wall:L('#/wall','看盤牆'),multi:L('#/multi','多圖看盤'),heatmap:L('#/heatmap','市場熱力圖'),ranks:L('#/ranks','排行'),news:L('#/news','重大訊息'),
    sector:L('#/sector/','類股')+SECTORS.map(s=>L('#/sector/'+s.key,s.name,1)).join('')+S.custom.map(c=>L('#/sector/'+c.id,'★ '+esc(c.name),1)).join('')+'<a class="sub" data-custom-new="1" style="cursor:pointer">＋ 自訂類股</a>',
    servers:L('#/servers','伺服器'),watch:L('#/watch','自選股'),journal:L('#/journal','交易紀錄本')};
  const ed=S.navEdit;
  return (ed?'<div class="nedit-bar"><span>調整選單順序</span><button class="btn sm" data-navreset="1">重設</button><button class="btn sm primary" data-navdone="1">完成</button></div>':'')+
    navOrder().map((k,i,a)=>`<div class="ng${ed?' edit':''}" data-nk="${k}" title="${ed?'':'拖曳可調整順序'}">${G[k].replace(/<a /g,'<a draggable="false" ')}${ed?`<span class="nmv"><button data-nmv="${k}|-1" ${i?'':'disabled'}>◀</button><button data-nmv="${k}|1" ${i<a.length-1?'':'disabled'}>▶</button></span>`:''}</div>`).join('');
}
function saveNavOrder(o){S.navOrder=o;lsSet('aex_navorder',o)}
(function setupNavDrag(){
  const nav=$('#nav');let drag=null,suppressUntil=0,lp=null;
  nav.addEventListener('pointerdown',ev=>{
    if(S.navEdit)return;const g=ev.target.closest('.ng');if(!g||ev.button!==0)return;
    if(ev.pointerType==='mouse'){drag={g,x:ev.clientX,y:ev.clientY,on:false};return}
    // 觸控：長按 0.5 秒進入排序模式
    const x=ev.clientX,y=ev.clientY;clearTimeout(lp?.t);
    lp={x,y,t:setTimeout(()=>{lp=null;suppressUntil=Date.now()+600;S.navEdit=true;navigator.vibrate?.(15);route()},500)};
  });
  document.addEventListener('pointermove',ev=>{
    if(lp&&Math.hypot(ev.clientX-lp.x,ev.clientY-lp.y)>10){clearTimeout(lp.t);lp=null}
    if(!drag)return;
    if(!drag.on){if(Math.hypot(ev.clientX-drag.x,ev.clientY-drag.y)<6)return;drag.on=true;drag.g.classList.add('dragging');document.body.classList.add('nav-dragging')}
    const horiz=getComputedStyle(nav).flexDirection==='row';const pos=horiz?ev.clientX:ev.clientY;
    const gs=[...nav.querySelectorAll('.ng')].filter(x=>x!==drag.g);
    const tgt=gs.find(x=>{const r=x.getBoundingClientRect();return pos<(horiz?r.left+r.width/2:r.top+r.height/2)});
    if(tgt){if(drag.g.nextElementSibling!==tgt)nav.insertBefore(drag.g,tgt)}
    else{const last=gs[gs.length-1];if(last&&last.nextElementSibling!==drag.g)last.after(drag.g)}
    ev.preventDefault();
  });
  const end=()=>{clearTimeout(lp?.t);lp=null;if(!drag)return;
    if(drag.on){drag.g.classList.remove('dragging');document.body.classList.remove('nav-dragging');suppressUntil=Date.now()+300;
      saveNavOrder([...nav.querySelectorAll('.ng')].map(x=>x.dataset.nk));}
    drag=null};
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
  // 拖曳或長按結束後的那一下點擊不要換頁；排序模式中連結不換頁
  nav.addEventListener('click',ev=>{
    if(Date.now()<suppressUntil){suppressUntil=0;ev.preventDefault();ev.stopPropagation();return}
    const t=ev.target;let el;
    if(el=t.closest('[data-nmv]')){ev.preventDefault();ev.stopPropagation();const [k,d]=el.dataset.nmv.split('|');const o=navOrder();const i=o.indexOf(k),j=i+(+d);
      if(j<0||j>=o.length)return;[o[i],o[j]]=[o[j],o[i]];saveNavOrder(o);route();return}
    if(t.closest('[data-navdone]')){ev.preventDefault();ev.stopPropagation();S.navEdit=false;route();return}
    if(t.closest('[data-navreset]')){ev.preventDefault();ev.stopPropagation();saveNavOrder(null);toast('已重設選單順序');route();return}
    if(S.navEdit&&t.closest('a')){ev.preventDefault();ev.stopPropagation()}
  },true);
  nav.addEventListener('contextmenu',ev=>{if(ev.target.closest('.ng'))ev.preventDefault()});
})();
/* ========== 搜尋 ========== */
function isSubseq(s,q){let i=0;for(const c of s){if(c===q[i])i++;if(i===q.length)return true}return false}
function searchItems(q,limit=20){
  q=q.trim();if(!q)return [];
  if(/^\d+$/.test(q)){const n=String(+q);const cs=new Set(allCons());
    return ITEMS.filter(it=>String(it.id).startsWith(n)).sort((a,b)=>(+cs.has(b.id))-(+cs.has(a.id))||String(a.id).length-String(b.id).length||a.id-b.id).slice(0,limit)}
  const terms=q.split(/\s+/);const res=[];
  for(const it of ITEMS){const n=it.n;let s;
    if(n===q)s=0;else if(n.startsWith(q))s=1;else if(n.includes(q))s=2;
    else if(terms.length>1&&terms.every(t=>n.includes(t)))s=3;
    else if(q.length>=2&&isSubseq(n,q.replace(/\s/g,'')))s=4;else continue;
    res.push([s+(allCons().includes(it.id)?-0.5:0),n.length,it]);
  }
  return res.sort((a,b)=>a[0]-b[0]||a[1]-b[1]).slice(0,limit).map(r=>r[2]);
}
function bindSearch(inp,dd,onPick){
  let list=[],sel=0;
  const draw=()=>{dd.innerHTML=list.map((it,i)=>`<div class="opt ${i===sel?'on':''}" data-i="${i}"><span class="code">${codeOf(it.id)}</span>${ico(it)}<span>${esc(it.n)}</span><span class="cat">${it.sec?SEC[it.sec].name+'・':''}${esc(CATS[it.cat]||'')}</span></div>`).join('')||'<div class="opt muted">找不到符合的物品</div>';dd.style.display='block'};
  inp.oninput=()=>{list=searchItems(inp.value);sel=0;inp.value.trim()?draw():dd.style.display='none'};
  inp.onkeydown=ev=>{if(dd.style.display!=='block')return;
    if(ev.key==='ArrowDown'){sel=Math.min(list.length-1,sel+1);draw();ev.preventDefault()}
    else if(ev.key==='ArrowUp'){sel=Math.max(0,sel-1);draw();ev.preventDefault()}
    else if(ev.key==='Enter'&&list[sel]){onPick(list[sel]);dd.style.display='none';ev.preventDefault()}
    else if(ev.key==='Escape')dd.style.display='none'};
  dd.onmousedown=ev=>{const o=ev.target.closest('.opt');if(o&&o.dataset.i!=null){onPick(list[+o.dataset.i]);dd.style.display='none';ev.preventDefault()}};
  inp.onblur=()=>setTimeout(()=>dd.style.display='none',150);
}

/* ========== 跑馬燈 ========== */
function renderTicker(all){
  $('#track').innerHTML=all.slice(0,40).map(x=>{const c=x.avg?cls(x.p/x.avg-1):'flat';return `<span class="t" data-go="#/item/${x.id}"><b>${esc(ITEM[x.id]?.n)}</b>${x.hq?'<span class="hq">HQ</span>':''}<span class="num ${c}">${fmt(x.p)}</span><span class="muted num">×${fmt(x.q)}</span><span class="muted">${esc(WN[x.w]||'')}・${tstr(x.t,false)}</span></span>`}).join('');
}
async function loadTicker(){
  if(S.snapMode){const a=(S.snapTicker||[]).filter(x=>ITEM[x.id]&&(!S.scope||x.w===S.scope));if(a.length>=5||!S.scope){renderTicker(a);return}}
  try{
    const sp=S.scope?`world=${S.scope}`:`dcName=${enc(DC)}`;
    const rec=await getJSON(`${API}/v2/extra/stats/most-recently-updated?${sp}&entries=50`);
    const ids=[...new Set((rec?.items||[]).map(x=>x.itemID).filter(id=>ITEM[id]))].slice(0,50);
    if(!ids.length)return;
    const scope=S.scope?S.scope:enc(DC);
    const d=await getJSON(`${API}/v2/${scope}/${ids.join(',')}?listings=0&entries=5`,{persist:false});
    const its=itemsOf(d);const all=[];
    Object.values(its).forEach(it=>(it.recentHistory||[]).filter(h=>!CLOSED.has(h.worldID)&&!(it.averagePrice&&(h.pricePerUnit>it.averagePrice*EXT||h.pricePerUnit<it.averagePrice/EXT))).forEach(h=>all.push({id:it.itemID,p:h.pricePerUnit,q:h.quantity,hq:h.hq,t:h.timestamp,w:h.worldID||S.scope,avg:it.averagePrice})));
    all.sort((a,b)=>b.t-a.t);renderTicker(all);
  }catch(e){console.warn('ticker',e)}
}

