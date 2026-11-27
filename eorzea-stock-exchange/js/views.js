"use strict";
/* 艾奧傑亞證券交易所：各頁面：排行、重大訊息、熱力圖、首頁、類股、個股、伺服器、自選股、自訂類股、多圖看盤、看盤牆 */
/* ========== 排行 ========== */
const RANKS=[['gain','漲幅'],['loss','跌幅'],['amp','振幅'],['vr','量比（爆量）'],['vol','成交量'],['amt','成交額'],['high','創 8 日新高'],['low','創 8 日新低'],['limup','漲停'],['limdn','跌停']];
function rankIds(k){
  const all=allCons().map(id=>({id,s:stats(id)})).filter(r=>r.s.price!=null);
  const act=r=>r.s.today.length>=2&&r.s.prev.length>=3;
  const by=(f,flt=()=>true)=>all.filter(flt).sort(f).map(r=>r.id);
  switch(k){
    case 'gain':return by((a,b)=>b.s.chg-a.s.chg,r=>act(r)&&r.s.chg>0);
    case 'loss':return by((a,b)=>a.s.chg-b.s.chg,r=>act(r)&&r.s.chg<0);
    case 'amp':return by((a,b)=>b.s.amp-a.s.amp,r=>r.s.amp!=null&&r.s.today.length>=3);
    case 'vr':return by((a,b)=>b.s.vr-a.s.vr,r=>r.s.vr!=null&&r.s.today.length>=3);
    case 'vol':return by((a,b)=>b.s.vol-a.s.vol,r=>r.s.vol>0);
    case 'amt':return by((a,b)=>b.s.amt-a.s.amt,r=>r.s.amt>0);
    case 'high':return by((a,b)=>b.s.high/b.s.prevHigh-a.s.high/a.s.prevHigh,r=>act(r)&&r.s.high>r.s.prevHigh);
    case 'low':return by((a,b)=>a.s.low/a.s.prevLow-b.s.low/b.s.prevLow,r=>act(r)&&r.s.low<r.s.prevLow);
    case 'limup':return by((a,b)=>b.s.chg-a.s.chg,r=>act(r)&&isLimUp(r.s.chg));
    case 'limdn':return by((a,b)=>a.s.chg-b.s.chg,r=>act(r)&&isLimDn(r.s.chg));
  }
  return [];
}
function renderRanks(k){
  if(!RANKS.some(r=>r[0]===k))k='gain';
  const ids=rankIds(k);
  const extra={high:{h:'前 8 日最高',f:r=>fmt(r.s.prevHigh)},low:{h:'前 8 日最低',f:r=>fmt(r.s.prevLow)}}[k];
  $('#view').innerHTML=`<h1>排行 <span class="muted" style="font-size:13px;font-weight:400">${scopeName()}・成分股 ${allCons().length} 檔・今日（近 24 小時）</span></h1>
  <div class="tabs" style="flex-wrap:wrap">${RANKS.map(([key,t])=>`<a class="btn ${k===key?'on':''}" href="#/ranks/${key}">${t}<span class="muted"> ${rankIds(key).length}</span></a>`).join('')}</div>
  <div class="panel">${stockTable(ids,'目前沒有符合的股票',{fixed:true,limit:50,extraCol:extra,show:{amp:'amp',vr:'vr',vol:'vol',amt:'amt',high:'extra',low:'extra'}[k]||'vol'})}
  <p class="note">漲跌停以 ±${LIMIT}% 計（比照台股）。量比＝今日成交量 ÷ 前 7 日日均量。振幅＝（最高－最低）÷ 參考價。參考價為前 7 日成交的數量加權中位數。</p></div>`;
}

/* ========== 重大訊息 ========== */
function genNews(){
  const out=[];if(!S.cons)return out;
  allCons().forEach(id=>{const s=stats(id);if(s.price==null)return;const n=ITEM[id].n;const tt=s.today.length?Math.max(...s.today.map(x=>x.t)):(S.updated||Date.now())/1000;
    const push=(p,tag,c,text)=>out.push({p,t:tt,id,tag,c,text});
    const act=s.today.length>=3&&s.prev.length>=3;
    if(act&&isLimUp(s.chg))push(3,'漲停','lu',`${n} 上漲 ${fmt(s.chg,1)}%，成交價 ${fmt(s.price)}（參考價 ${fmt(s.pP)}）`);
    if(act&&isLimDn(s.chg))push(3,'跌停','ld',`${n} 下跌 ${fmt(-s.chg,1)}%，成交價 ${fmt(s.price)}（參考價 ${fmt(s.pP)}）`);
    if(s.vr!=null&&s.vr>=3&&s.today.length>=5)push(2,'爆量','warn',`${n} 今日成交 ${fmt(s.vol)}，是前 7 日均量的 ${fmt(s.vr,1)} 倍`);
    if(act&&s.high>s.prevHigh)push(1,'新高','lu',`${n} 今日最高 ${fmt(s.high)}，創 8 日新高`);
    if(act&&s.low<s.prevLow)push(1,'新低','ld',`${n} 今日最低 ${fmt(s.low)}，創 8 日新低`);
    if(s.today.length>=5){const bm={};let tot=0;s.today.forEach(x=>{bm[x.b]=(bm[x.b]||0)+x.q;tot+=x.q});const top=Math.max(...Object.values(bm));
      if(tot&&top/tot>=.5)push(1,'籌碼集中','warn',`${n} 今日單一買家買下 ${fmt(top/tot*100,0)}% 的成交量`)}
  });
  SECTORS.forEach(sec=>{const ix=indexOf(S.cons.sectors[sec.key]);if(ix.chg!=null&&Math.abs(ix.chg)>=5)out.push({p:2,t:(S.updated||Date.now())/1000,sec:sec.key,tag:'類股',c:ix.chg>0?'lu':'ld',text:`${sec.name}指數${ix.chg>0?'上漲':'下跌'} ${fmt(Math.abs(ix.chg),2)}%，報 ${fmt(ix.v,2)} 點`})});
  return out.sort((a,b)=>b.t-a.t||b.p-a.p);
}
function newsList(list){
  return list.map(x=>`<div class="news" data-go="${x.sec?'#/sector/'+x.sec:'#/item/'+x.id}"><span class="num muted">${tstr(x.t)}</span><span class="ntag ${x.c}">${x.tag}</span><span>${esc(x.text)}</span></div>`).join('')||'<div class="empty">目前沒有重大訊息</div>';
}
function renderNews(){
  const list=genNews();const tags=[...new Set(list.map(x=>x.tag))];
  const f=S.newsTag&&tags.includes(S.newsTag)?S.newsTag:'';
  $('#view').innerHTML=`<h1>重大訊息 <span class="muted" style="font-size:13px;font-weight:400">${scopeName()}・依成分股行情自動產生・${list.length} 則</span></h1>
  <div class="tabs" style="flex-wrap:wrap"><button class="btn ${!f?'on':''}" data-ntag="">全部</button>${tags.map(t=>`<button class="btn ${f===t?'on':''}" data-ntag="${t}">${t} <span class="muted">${list.filter(x=>x.tag===t).length}</span></button>`).join('')}</div>
  <div class="panel">${newsList(f?list.filter(x=>x.tag===f):list)}
  <p class="note">規則：漲跌停 ±${LIMIT}%；爆量＝今日量達前 7 日均量 3 倍以上；新高／新低＝今日最高／最低突破前 8 日；籌碼集中＝單一買家佔今日成交 50% 以上；類股＝指數漲跌 5% 以上。不顯示買家名稱。</p></div>`;
}

/* ========== 市場熱力圖 ========== */
S.hmSize=lsGet('aex_hmsize','today');
function squarify(nodes,rect){
  const res=[];const tot=nodes.reduce((s,n)=>s+n.v,0);if(!tot)return res;
  const area=rect.w*rect.h;const items=nodes.map(n=>({n,a:n.v/tot*area}));let r={...rect},row=[];
  const worst=(rw,len)=>{const s=rw.reduce((a,b)=>a+b.a,0);let mx=0,mn=Infinity;rw.forEach(x=>{mx=Math.max(mx,x.a);mn=Math.min(mn,x.a)});return Math.max(len*len*mx/(s*s),(s*s)/(len*len*mn))};
  const lay=rw=>{const s=rw.reduce((a,b)=>a+b.a,0);
    if(r.w>=r.h){const cw=s/r.h;let y=r.y;rw.forEach(it=>{const h=it.a/cw;res.push({n:it.n,x:r.x,y,w:cw,h});y+=h});r={x:r.x+cw,y:r.y,w:r.w-cw,h:r.h}}
    else{const rh=s/r.w;let x=r.x;rw.forEach(it=>{const w=it.a/rh;res.push({n:it.n,x,y:r.y,w,h:rh});x+=w});r={x:r.x,y:r.y+rh,w:r.w,h:r.h-rh}}};
  for(const it of items){const len=Math.min(r.w,r.h);if(!row.length||worst([...row,it],len)<=worst(row,len))row.push(it);else{lay(row);row=[it]}}
  if(row.length)lay(row);return res;
}
function hmColor(c){if(c==null||Math.abs(c)<0.005)return '#2b303b';const a=Math.min(1,Math.abs(c)/LIMIT);const base=c>0?[214,48,58]:[22,150,92],g=[43,48,59];
  return `rgb(${g.map((v,i)=>Math.round(v+(base[i]-v)*(.3+.7*a))).join(',')})`}
function renderHeatmap(){
  const mode=S.hmSize;
  $('#view').innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap"><h1 style="margin:0">市場熱力圖 <span class="muted" style="font-size:13px;font-weight:400">${scopeName()}・方塊大小＝${mode==='today'?'今日成交額':'前 7 日日均成交額'}・顏色＝今日漲跌幅</span></h1>
    <span class="seg"><button data-hmsize="today" class="${mode==='today'?'on':''}">今日成交額</button><button data-hmsize="avg" class="${mode==='avg'?'on':''}">前 7 日均額</button></span>
    <span class="hm-legend">${[-10,-6,-3,-1,0,1,3,6,10].map(v=>`<i style="background:${hmColor(v)}">${v>0?'+':''}${v}%</i>`).join('')}</span></div>
  <div id="hm"></div>`;
  const box=$('#hm');const W=box.clientWidth,Hh=Math.max(520,window.innerHeight-56-32-34-120);box.style.height=Hh+'px';
  const groups=SECTORS.map(s=>{const items=S.cons.sectors[s.key].map(id=>{const st=stats(id);return {id,st,v:mode==='today'?st.amt:(st.dAmt||0)}}).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
    return {s,items,v:items.reduce((a,b)=>a+b.v,0)}}).filter(g=>g.v>0).sort((a,b)=>b.v-a.v);
  let html='';
  squarify(groups,{x:0,y:0,w:W,h:Hh}).forEach(gr=>{const G=gr.n;const ix=indexOf(S.cons.sectors[G.s.key]);
    html+=`<div class="hm-g" style="left:${gr.x}px;top:${gr.y}px;width:${gr.w}px;height:${gr.h}px"><div class="hm-gh" data-go="#/sector/${G.s.key}">${G.s.name} ${pct(ix.chg)}</div></div>`;
    squarify(G.items,{x:gr.x+2,y:gr.y+22,w:gr.w-4,h:gr.h-24}).forEach(b=>{const it=b.n;const c=it.st.chg;const big=b.w>70&&b.h>40,mid=b.w>44&&b.h>24;
      html+=`<div class="hm-b" data-go="#/item/${it.id}" title="${esc(ITEM[it.id].n)}　${fmt(it.st.price)}　${c!=null?(c>0?'+':'')+fmt(c,2)+'%':'—'}　成交額 ${fmtBig(it.st.amt)}" style="left:${b.x}px;top:${b.y}px;width:${b.w-2}px;height:${b.h-2}px;background:${hmColor(c)}">
        ${mid?`<div class="hm-n" style="font-size:${big?13:11}px">${esc(ITEM[it.id].n)}</div>`:''}${big?`<div class="num" style="font-size:12px">${c!=null?(c>0?'+':'')+fmt(c,2)+'%':'—'}</div><div class="num" style="font-size:11px;opacity:.75">${fmt(it.st.price)}</div>`:''}</div>`});
  });
  box.innerHTML=html||'<div class="empty">今日還沒有成交</div>';
}
document.addEventListener('click',ev=>{
  const t=ev.target;let el;
  if(el=t.closest('[data-hmsize]')){S.hmSize=el.dataset.hmsize;lsSet('aex_hmsize',S.hmSize);route();return}
  if(el=t.closest('[data-ntag]')){S.newsTag=el.dataset.ntag;route();return}
  if(el=t.closest('[data-kov]')){S.kopt.ov=el.dataset.kov;lsSet('aex_kopt',S.kopt);route();return}
  if(el=t.closest('[data-krange]')){S.kopt.range=+el.dataset.krange;lsSet('aex_kopt',S.kopt);route();return}
  if(el=t.closest('[data-ksub]')){S.kopt.sub=el.dataset.ksub;lsSet('aex_kopt',S.kopt);route();return}
});
S.kopt=Object.assign({ov:'ma',sub:'vol'},lsGet('aex_kopt',{}));

/* ========== 首頁 ========== */
function rankTable(rows,col,title,sub){
  return `<div class="panel"><h2>${title}<span class="muted">${sub||''}</span></h2><table><tr><th>名稱</th><th>股價</th><th>漲跌幅</th><th class="hm">${col.h}</th></tr>
  ${rows.length?rows.map((r,i)=>`<tr class="row" data-go="#/item/${r.id}"><td><div class="name"><span class="rk">${i+1}</span><span class="code">${codeOf(r.id)}</span>${ico(ITEM[r.id])}<span>${esc(ITEM[r.id].n)}</span>${mainQ(r.id)?'<span class="hq">HQ</span>':''}</div></td>
  <td class="num ${cls(r.s.chg)}${fx(r.id,r.s.price)}">${fmt(r.s.price)}</td><td>${pctS(r.s.chg)}</td><td class="num hm">${col.f(r)}</td></tr>`).join(''):`<tr><td colspan="4" class="empty">暫無資料</td></tr>`}</table></div>`;
}
function spreadRows(){
  const out=[];
  allCons().forEach(id=>{
    const q=mainQ(id);const e=(S.hist[id]?.e||[]).filter(x=>x.hq===q);const per={};
    e.forEach(x=>(per[x.w]=per[x.w]||[]).push(x));
    const dcMed=wmedian(e);if(!dcMed)return;
    // 排除亂掛價：各服 7 日股價須落在 DC 股價的 1/4～4 倍內
    const ps=Object.entries(per).filter(([w,a])=>a.length>=5).map(([w,a])=>({w:+w,p:wmedian(a)})).filter(x=>x.p>=dcMed/4&&x.p<=dcMed*4);
    if(ps.length<2)return;ps.sort((a,b)=>a.p-b.p);const lo=ps[0],hi=ps[ps.length-1];
    out.push({id,lo,hi,sp:(hi.p/lo.p-1)*100});
  });
  return out.sort((a,b)=>b.sp-a.sp).slice(0,10);
}
function renderHome(){
  const ids=allCons();
  const all=ids.map(id=>({id,s:stats(id)})).filter(r=>r.s.price!=null);
  const withChg=all.filter(r=>r.s.chg!=null&&r.s.today.length>=2&&r.s.prev.length>=3);
  const gain=[...withChg].sort((a,b)=>b.s.chg-a.s.chg).filter(r=>r.s.chg>0).slice(0,10);
  const loss=[...withChg].sort((a,b)=>a.s.chg-b.s.chg).filter(r=>r.s.chg<0).slice(0,10);
  const vol=[...all].sort((a,b)=>b.s.vol-a.s.vol).slice(0,10);
  const amt=[...all].sort((a,b)=>b.s.amt-a.s.amt).slice(0,10);
  const cards=[{key:null,name:'大盤指數',ids}].concat(SECTORS.map(s=>({key:s.key,name:s.name,ids:S.cons.sectors[s.key]})));
  ensureCustomHist();
  const customCards=S.custom.map(c=>{const ix=indexOf(c.ids);const sp=indexSeries(c.ids);
    return `<div class="card" data-go="#/sector/${c.id}"><div class="t">★ ${esc(c.name)}</div><div class="v num ${cls(ix.chg)}">${fmt(ix.v,2)}</div><div>${pct(ix.chg)}</div><div class="note">${ix.n}／${c.ids.length} 檔計價</div>${sparkline(sp,90,30)}</div>`}).join('');
  const cardHtml=cards.map(c=>{const ix=indexOf(c.ids);const sp=indexSeries(c.ids);
    return `<div class="card ${c.key?'':'main'}" data-go="${c.key?'#/sector/'+c.key:'#/sector/'}"><div class="t">${c.name}</div>
    <div class="v num ${cls(ix.chg)}">${fmt(ix.v,2)}</div><div>${pct(ix.chg)}</div><div class="note">${ix.n} 檔計價</div>${sparkline(sp,90,30)}</div>`}).join('');
  let spread;
  if(S.scope)spread=`<div class="panel"><h2>跨服價差榜</h2><div class="empty">切回「陸行鳥 DC」才能比較各伺服器價差</div></div>`;
  else{const sr=spreadRows();spread=`<div class="panel"><h2>跨服價差榜<span class="muted">近 7 日成交價</span></h2><table><tr><th>名稱</th><th>最低</th><th>最高</th><th>價差</th></tr>
    ${sr.map((r,i)=>`<tr class="row" data-go="#/item/${r.id}"><td><div class="name"><span class="rk">${i+1}</span><span class="code">${codeOf(r.id)}</span>${ico(ITEM[r.id])}<span>${esc(ITEM[r.id].n)}</span></div></td>
    <td class="num">${fmt(r.lo.p)} <span class="muted">${WN[r.lo.w]}</span></td><td class="num">${fmt(r.hi.p)} <span class="muted">${WN[r.hi.w]}</span></td><td class="num up">${fmt(r.sp,1)}%</td></tr>`).join('')||'<tr><td colspan=4 class="empty">暫無資料</td></tr>'}</table></div>`}
  $('#view').innerHTML=`<h1>看盤首頁 <span class="muted" style="font-size:13px;font-weight:400">${scopeName()}・今日（近 24 小時）對比前 7 日</span></h1>
  <div class="grid g6" style="margin-bottom:14px">${cardHtml}</div>
  ${customCards?`<div class="grid g6" style="margin-bottom:14px">${customCards}</div>`:''}
  <div class="panel" style="margin-bottom:14px"><h2>重大訊息<span class="muted">自動產生</span><a href="#/news" class="btn sm" style="margin-left:auto">全部 ${genNews().length} 則</a></h2>
    <div class="news2">${newsList(genNews().slice(0,8))}</div></div>
  <div class="grid g2">
   ${rankTable(gain,{h:'成交量',f:r=>fmt(r.s.vol)},'漲幅榜','')}
   ${rankTable(loss,{h:'成交量',f:r=>fmt(r.s.vol)},'跌幅榜','')}
   ${spread}
   ${rankTable(vol,{h:'成交量',f:r=>fmt(r.s.vol)},'成交量榜','近 24 小時')}
   ${rankTable(amt,{h:'成交額',f:r=>fmtBig(r.s.amt)},'成交額榜','近 24 小時')}
   ${serverMini()}
  </div>`;
}
function worldAgg(world){let vol=0,amt=0,pamt=0;const buyers=new Set();
  allCons().forEach(id=>{const s=stats(id,world);if(s.dAmt==null)return;vol+=s.vol;amt+=s.amt;pamt+=s.dAmt*7;s.today.forEach(x=>x.b&&buyers.add(x.b))});
  return {vol,amt,pamt,buyers:buyers.size}}
function serverMini(){
  const rows=WORLDS.map(([id,n])=>({id,n,a:worldAgg(id)}));const mx=Math.max(1,...rows.map(r=>r.a.amt));
  return `<div class="panel"><h2>各伺服器成交額<span class="muted">近 24 小時・成分股</span></h2><table>${rows.sort((a,b)=>b.a.amt-a.a.amt).map(r=>`<tr class="row" data-go="#/servers"><td style="width:80px">${r.n}</td><td><div class="hbar"><i style="width:${r.a.amt/mx*100}%"></i></div></td><td class="num" style="width:90px">${fmtBig(r.a.amt)}</td></tr>`).join('')}</table></div>`;
}

/* ========== 類股 ========== */
async function renderSector(key,tok){
  const custom=key&&key.startsWith('c_')?customOf(key):null;
  if(key&&key.startsWith('c_')&&!custom){location.hash='#/sector/';return}
  const ids=sectorIds(key);const title=custom?'★ '+esc(custom.name):key?SEC[key].name:'大盤（全部成分股）';
  if(custom&&ids.some(id=>!S.hist[id])){$('#view').innerHTML='<div class="empty">載入自訂類股…</div>';await loadHist(ids);if(tok!==TOKEN)return}
  const ix=indexOf(ids);
  $('#view').innerHTML=`<h1>${title} <span class="muted" style="font-size:13px;font-weight:400">${scopeName()}</span></h1>
  <div class="tabs" style="flex-wrap:wrap"><a class="btn ${!key?'on':''}" href="#/sector/">大盤</a>${SECTORS.map(s=>`<a class="btn ${key===s.key?'on':''}" href="#/sector/${s.key}">${s.name}</a>`).join('')}
    ${S.custom.map(c=>`<a class="btn ${key===c.id?'on':''}" href="#/sector/${c.id}">★ ${esc(c.name)}</a>`).join('')}<button class="btn" data-custom-new="1">＋ 自訂類股</button>
    ${custom?`<button class="btn sm" data-custom-edit="${custom.id}" style="margin-left:auto">編輯成分股</button>`:''}</div>
  <div class="grid" style="grid-template-columns:280px 1fr;margin-bottom:14px">
    <div class="panel"><div class="muted">類股指數（前 7 日 = 1,000）</div><div class="num ${cls(ix.chg)}" style="font-size:34px;font-weight:700">${fmt(ix.v,2)}</div>${pct(ix.chg)}
      <div class="kv" style="margin-top:14px"><div>成分股</div><div class="num">${ids.length} 檔</div><div>今日有計價</div><div class="num">${ix.n} 檔</div>
      <div>今日成交額</div><div class="num">${fmtBig(ids.reduce((s,id)=>s+stats(id).amt,0))}</div>
      <div>上漲／下跌</div><div class="num"><span class="up">${ids.filter(id=>stats(id).chg>0).length}</span> ／ <span class="down">${ids.filter(id=>stats(id).chg<0).length}</span></div></div>
      <p class="note">已排除極端成交（與前後成交中位數相差 3 倍以上）。指數以前 7 日成交額加權，計算各成分股「今日股價／前 7 日股價」。</p></div>
    <div class="panel"><h2>指數走勢<span class="muted">近 8 日（每 24 小時一點）</span></h2><canvas id="idx" style="height:240px"></canvas></div>
  </div>
  <div class="panel">${stockTable(ids,custom?'這個自訂類股還沒有股票':'')}</div>`;
  drawLine($('#idx'),indexSeries(ids));
}

/* ========== 個股 ========== */
const ITEMV={mode:'day'};
S.histL={};   // `${id}|${天數}` -> {t, e, removed, raw}：個股 K 線用的長期資料
async function loadLong(id,days){
  const k=id+'|'+days;const h=S.histL[k];if(h&&Date.now()-h.t<TTL)return h;
  const d=await getJSON(`${API}/v2/history/${enc(DC)}/${id}?entriesToReturn=9999&entriesWithin=${days*DAY}&fields=entries.hq,entries.pricePerUnit,entries.quantity,entries.timestamp,entries.worldID`,{persist:false});
  const raw=d?.entries||[];const cl=cleanEntries(normEntries(raw));
  return S.histL[k]={t:Date.now(),e:cl.e,removed:cl.removed,raw:raw.length};
}
const KRANGES=[[30,'1 個月'],[90,'3 個月'],[180,'6 個月']];
async function renderItem(id,tok){
  const it=ITEM[id];if(!it){$('#view').innerHTML='<div class="empty">找不到這個物品</div>';return}
  $('#view').innerHTML=`<div class="empty">載入 ${codeOf(id)} ${esc(it.n)} 的資料…</div>`;
  let cur;
  try{
    [cur]=await Promise.all([
      getJSON(`${API}/v2/${enc(DC)}/${id}?listings=100&entries=20`,{persist:false}),
      loadHist([id],{within:30*DAY,store:S.hist30,size:1}),
      loadHist([id]),
    ]);
  }catch(e){if(tok===TOKEN)$('#view').innerHTML=`<div class="empty">讀取失敗：${esc(e.message)}</div>`;return}
  if(tok!==TOKEN)return;
  const q=mainQ(id);const w=S.scope;
  const e30=Object.assign(S.hist30[id]?.e||[],{_cap:(S.hist30[id]?.raw||0)>=999});
  const s=statsOf(e30,q,w);
  const esScope=e30.filter(x=>x.hq===q&&(!w||x.w===w));
  const now=nowS();
  const e7=esScope.filter(x=>x.t>=now-7*DAY);
  const span=esScope.length?(now-Math.min(...esScope.map(x=>x.t)))/DAY:0;
  const capped=(S.hist30[id]?.raw||0)>=999;const removed=S.hist30[id]?.removed||0;
  const refP=s.pP??s.pT;
  const listings=(cur?.listings||[]).filter(l=>l.hq===q&&!CLOSED.has(l.worldID)&&(refP==null||l.pricePerUnit<=refP*EXT));
  const lsScope=listings.filter(l=>!w||l.worldID===w);
  const lsQty=lsScope.reduce((a,l)=>a+l.quantity,0);
  // 五檔
  const askMap={};lsScope.forEach(l=>askMap[l.pricePerUnit]=(askMap[l.pricePerUnit]||0)+l.quantity);
  const asks=Object.entries(askMap).map(([p,v])=>({p:+p,v})).sort((a,b)=>a.p-b.p).slice(0,5);
  const bidMap={};s.today.forEach(x=>bidMap[x.p]=(bidMap[x.p]||0)+x.q);
  const bestAsk=asks[0]?.p;const bids=Object.entries(bidMap).map(([p,v])=>({p:+p,v})).filter(b=>bestAsk==null||b.p<=bestAsk).sort((a,b)=>b.p-a.p).slice(0,5);
  const bookMax=Math.max(1,...asks.map(a=>a.v),...bids.map(b=>b.v));
  const askTot=asks.reduce((a,b)=>a+b.v,0),bidTot=bids.reduce((a,b)=>a+b.v,0);
  const bookRow=(r,side)=>`<tr><td class="${side==='a'?'down':'up'}">${side==='a'?'賣':'買'}</td><td class="num ${refP!=null?cls(r.p-refP):''}">${fmt(r.p)}</td><td class="num bar"><i style="width:${r.v/bookMax*100}%;background:${side==='a'?'var(--down)':'var(--up)'}"></i>${fmt(r.v)}</td></tr>`;
  const askRows=[...asks].reverse().map(r=>bookRow(r,'a')).join('')||'<tr><td colspan=3 class="empty">目前沒有上架</td></tr>';
  const bidRows=bids.map(r=>bookRow(r,'b')).join('')||'<tr><td colspan=3 class="empty">近 24 小時沒有成交</td></tr>';
  // 主力買家
  const bm={};let btot=0;e7.forEach(x=>{if(!x.b)return;bm[x.b]=(bm[x.b]||0)+x.q;btot+=x.q});
  const buyers=Object.entries(bm).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const top5=buyers.reduce((a,b)=>a+b[1],0)/(btot||1)*100;
  const conc=buyers.length?(buyers[0][1]/btot*100>=40?'<span class="tag red">高度集中</span>':top5>=60?'<span class="tag">中度集中</span>':'<span class="tag green">分散</span>'):'';
  // 各服報價
  const wrows=WORLDS.map(([wid,wn])=>{const ls=listings.filter(l=>l.worldID===wid);const es=e30.filter(x=>x.hq===q&&x.w===wid&&x.t>=now-7*DAY);
    return {wid,wn,min:ls.length?Math.min(...ls.map(l=>l.pricePerUnit)):null,lq:ls.reduce((a,l)=>a+l.quantity,0),p7:wmedian(es),dv:es.reduce((a,x)=>a+x.q,0)/7}});
  const mins=wrows.filter(r=>r.min!=null).map(r=>r.min);const wMin=Math.min(...mins),wMax=Math.max(...mins);
  const lowList=lsScope.length?Math.min(...lsScope.map(l=>l.pricePerUnit)):null;
  const secName=it.sec?SEC[it.sec].name:'其他';
  const jobs=JOBS.filter((_,i)=>it.jobs&(1<<i));
  const pb=it.npc>0&&s.price!=null?s.price/it.npc:null;
  const turnover=lsQty?s.vol/lsQty*100:null;
  const mode=ITEMV.mode;const ko=S.kopt;
  // 日 K 超過 30 天或週 K 時改用長期資料
  const kdays=mode==='week'?365:mode==='day'?(ko.range||30):0;
  let kL=null;if(kdays>30){try{kL=await loadLong(id,kdays)}catch(e){console.warn('long hist',e)}if(tok!==TOKEN)return}
  const kEs=kL?kL.e.filter(x=>x.hq===q&&(!w||x.w===w)):esScope;
  const kSpan=kEs.length?(now-Math.min(...kEs.map(x=>x.t)))/DAY:0;
  const kCapped=kL?kL.raw>=9999:capped;const kRemoved=kL?kL.removed:removed;
  const chartH=mode==='tick'?400:(ko.sub!=='vol'?470:400);
  const qb=(k,v,c='')=>`<div><span class="muted">${k}</span><b class="num ${c}">${v}</b></div>`;
  $('#view').innerHTML=`
  <div class="item-head">${ico(it,1)}
    <div class="meta"><div style="font-size:20px;font-weight:700"><span class="code" style="font-size:15px">${codeOf(id)}</span> ${esc(it.n)} ${q?'<span class="hq">HQ</span>':''}</div>
      <div class="muted">${secName}・${esc(CATS[it.cat]||'')}・${scopeName()}</div></div>
    <div class="qbig"><span class="p num ${cls(s.chg)}${fx(id,s.price)}">${fmt(s.price)}</span>
      <div>${signed(s.diff)}　${pctS(s.chg)}</div></div>
    <div class="qgrid">${qb('開盤',fmt(s.open),s.open!=null&&refP!=null?cls(s.open-refP):'')}${qb('最高',fmt(s.high),s.high!=null&&refP!=null?cls(s.high-refP):'')}${qb('最低',fmt(s.low),s.low!=null&&refP!=null?cls(s.low-refP):'')}${qb('參考價',fmt(s.pP))}
      ${qb('振幅',s.amp!=null?fmt(s.amp,2)+'%':'—')}${qb('成交量',fmt(s.vol))}${qb('成交額',fmtBig(s.amt))}${qb('量比',s.vr!=null?fmt(s.vr,2):'—',s.vr>=2?'up':'')}</div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
      ${it.canHq?`<div class="seg"><button data-q="0" class="${!q?'on':''}">NQ</button><button data-q="1" class="${q?'on':''}">HQ</button></div>`:''}
      <button class="btn" data-star="${id}">${S.watch.includes(id)?'★ 已加入自選':'☆ 加入自選'}</button>
      <button class="btn" data-addcustom="${id}">加入自訂類股</button>
      <button class="btn primary" data-log="${id}">記一筆</button>
    </div>
  </div>
  <div class="grid" style="grid-template-columns:1fr 340px;margin-bottom:14px">
    <div class="panel"><h2 style="flex-wrap:wrap">
      <span class="seg"><button data-mode="tick" class="${mode==='tick'?'on':''}">分時</button><button data-mode="hour" class="${mode==='hour'?'on':''}">小時 K</button><button data-mode="day" class="${mode==='day'?'on':''}">日 K</button><button data-mode="week" class="${mode==='week'?'on':''}">週 K</button></span>
      ${mode==='day'?`<span class="seg">${KRANGES.map(([v,n])=>`<button data-krange="${v}" class="${(ko.range||30)===v?'on':''}">${n}</button>`).join('')}</span>`:''}
      ${mode!=='tick'?`<span class="seg"><button data-kov="ma" class="${ko.ov==='ma'?'on':''}">均線</button><button data-kov="boll" class="${ko.ov==='boll'?'on':''}">布林</button><button data-kov="none" class="${ko.ov==='none'?'on':''}">無</button></span>
      <span class="seg"><button data-ksub="vol" class="${ko.sub==='vol'?'on':''}">量</button><button data-ksub="kd" class="${ko.sub==='kd'?'on':''}">KD</button><button data-ksub="rsi" class="${ko.sub==='rsi'?'on':''}">RSI</button><button data-ksub="macd" class="${ko.sub==='macd'?'on':''}">MACD</button></span>`:''}
      <span class="muted">${mode==='tick'?'近 24 小時・每 10 分鐘':mode==='day'?`近 ${ko.range||30} 日`:mode==='week'?'近 1 年・每根一週':'近 72 小時'}${(mode==='tick'?removed:kRemoved)?'・已排除 '+(mode==='tick'?removed:kRemoved)+' 筆極端成交':''}${(mode==='tick'?capped:kCapped)?`・<span class="up">達 ${kL?'9,999':'999'} 筆上限，只涵蓋約 ${fmt(mode==='tick'?span:kSpan,1)} 天</span>`:''}${kdays>30&&!kL?'・<span class="up">長期資料讀取失敗，先顯示 30 天</span>':''}</span></h2>
      <div class="chartbox" id="kbox"><canvas style="height:${chartH}px"></canvas><div class="tip"></div></div></div>
    <div class="grid" style="align-content:start">
      <div class="panel"><h2>五檔報價<span class="muted">賣盤＝上架；買盤＝近 24h 成交模擬</span></h2>
        <table class="book">${askRows}<tr><td colspan=3 style="border-bottom:1px dashed #333;padding:0"></td></tr>${bidRows}</table>
        ${askTot+bidTot?`<div class="note" style="display:flex;justify-content:space-between;margin-top:6px"><span>委買 <b class="num up">${fmt(bidTot)}</b></span><span>委賣 <b class="num down">${fmt(askTot)}</b></span></div>
        <div class="hbar" style="display:flex"><i style="width:${bidTot/(askTot+bidTot)*100}%;background:var(--up)"></i><i style="flex:1;background:var(--down)"></i></div>`:''}</div>
      <div class="panel"><h2>基本資料</h2><div class="kv">
        <div>代號</div><div class="num">${codeOf(id)}</div>
        <div>產業（類股）</div><div>${secName}・${esc(CATS[it.cat]||'')}</div>
        <div>物品等級</div><div class="num">${it.ilvl||'—'}</div>
        <div>可否 HQ</div><div>${it.canHq?'可':'否'}</div>
        <div>堆疊上限</div><div class="num">${fmt(it.stack)}</div>
        <div>製作職業</div><div>${jobs.length?jobs.join('、'):'不可製作'}</div>
        <div>NPC 收購價（淨值）</div><div class="num">${it.npc?fmt(it.npc):'—'}</div>
        <div>股價淨值比</div><div class="num">${pb!=null?fmt(pb,pb>=100?0:2)+' 倍':'—'}</div>
        <div>週轉率</div><div class="num">${turnover!=null?fmt(turnover,1)+'%':'—'}</div>
        <div>前 7 日日均量</div><div class="num">${fmt(s.dVol,1)}</div>
        <div>近 30 日日均量</div><div class="num">${span?fmt(esScope.reduce((a,x)=>a+x.q,0)/Math.min(30,Math.max(1,span)),1):'—'}</div>
        <div>最低上架</div><div class="num">${fmt(lowList)}</div>
        <div>上架總量</div><div class="num">${fmt(lsQty)}${(cur?.listings||[]).length>=100?'+':''}</div>
        <div>資料上傳</div><div>${ago(cur?.lastUploadTime)}</div>
      </div><p class="note">股價淨值比＝股價 ÷ NPC 收購價；週轉率＝今日成交量 ÷ 上架總量。</p></div>
    </div>
  </div>
  <div class="grid g3">
    <div class="panel"><h2>成交明細<span class="muted">最近 50 筆</span></h2><div style="max-height:420px;overflow:auto"><table class="compact t-tx"><tr><th class="l">時間</th><th class="l">伺服器</th><th>單價</th><th>數量</th><th>金額</th><th class="l">買家</th></tr>
      ${[...esScope].sort((a,b)=>b.t-a.t).slice(0,50).map(x=>`<tr><td class="num l muted">${tstr(x.t)}</td><td class="l">${WN[x.w]||x.w}</td><td class="num ${refP!=null?cls(x.p-refP):''}">${fmt(x.p)}</td><td class="num">${fmt(x.q)}</td><td class="num">${fmtBig(x.p*x.q)}</td><td class="l muted b" title="${esc(x.b)}">${esc(x.b)}</td></tr>`).join('')||'<tr><td colspan=6 class="empty">沒有成交</td></tr>'}</table></div></div>
    <div class="panel"><h2>主力買家<span class="muted">近 7 日・依數量</span>${conc}</h2>
      ${buyers.length?buyers.map(([b,v],i)=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><span><span class="rk">${i+1}</span>${esc(b)}</span><span class="num">${fmt(v)}（${fmt(v/btot*100,1)}%）</span></div><div class="hbar"><i style="width:${v/btot*100}%"></i></div></div>`).join('')+
        `<p class="note">前 5 名合計佔 ${fmt(top5,1)}%，共 ${Object.keys(bm).length} 位買家。</p>`:'<div class="empty">近 7 日沒有成交</div>'}</div>
    <div class="panel"><h2>各服報價<span class="muted">${q?'HQ':'NQ'}・上架為 DC 最低 100 筆內</span></h2><table class="t-ws"><tr><th class="l">伺服器</th><th>最低上架</th><th>上架量</th><th>7 日股價</th><th>日均量</th></tr>
      ${wrows.map(r=>`<tr class="${S.scope===r.wid?'':'row'}" data-world="${r.wid}"><td class="l">${r.wn}${r.min!=null&&r.min===wMin&&mins.length>1?' <span class="tag green">最低</span>':''}${r.min!=null&&r.min===wMax&&mins.length>1?' <span class="tag red">最高</span>':''}</td>
      <td class="num">${fmt(r.min)}</td><td class="num">${fmt(r.lq)}</td><td class="num">${fmt(r.p7)}</td><td class="num">${fmt(r.dv,1)}</td></tr>`).join('')}</table>
      ${mins.length>1?`<p class="note">最低與最高上架價差 <span class="num up">${fmt((wMax/wMin-1)*100,1)}%</span>。點伺服器可切換範圍。</p>`:''}</div>
  </div>`;
  if(mode==='tick')mountTick($('#kbox'),esScope,s.pP);
  else mountCandles($('#kbox'),buildCandles(kEs,mode,kL?kdays:30),S.kopt);
}

/* ========== 伺服器 ========== */
function renderServers(){
  const ids=allCons();
  const rows=WORLDS.map(([id,n])=>({id,n,ix:indexOf(ids,id),a:worldAgg(id)}));
  const tot=rows.reduce((s,r)=>s+r.a.amt,0)||1;
  const heat=v=>{if(v==null)return 'background:#151a24;color:#555';const a=Math.min(1,Math.abs(v)/15);return `background:${v>=0?`rgba(255,77,85,${.12+a*.6})`:`rgba(34,192,122,${.12+a*.6})`};color:#fff`};
  $('#view').innerHTML=`<h1>伺服器 <span class="muted" style="font-size:13px;font-weight:400">陸行鳥 DC 8 個伺服器・以成分股計算・點列切換範圍</span></h1>
  <div class="panel" style="margin-bottom:14px"><table class="t-srv"><tr><th>伺服器</th><th>伺服器指數</th><th>漲跌幅</th><th>今日成交量</th><th>今日成交額</th><th>前 7 日日均額</th><th>成交額變化</th><th>市佔率</th><th>活躍買家</th><th>資料新鮮度</th><th>稅率</th></tr>
  ${rows.map(r=>{const avg=r.a.pamt/7;return `<tr class="row" data-world="${r.id}"><td><b>${r.n}</b>${S.scope===r.id?' <span class="tag">目前範圍</span>':''}${!S.upload[r.id]?' <span class="tag">近期無人上傳</span>':''}</td>
   <td class="num ${cls(r.ix.chg)}">${fmt(r.ix.v,2)}</td><td>${pct(r.ix.chg)}</td><td class="num">${fmt(r.a.vol)}</td><td class="num">${fmtBig(r.a.amt)}</td><td class="num">${fmtBig(avg)}</td>
   <td>${pct(avg?(r.a.amt/avg-1)*100:null)}</td><td class="num">${fmt(r.a.amt/tot*100,1)}%</td><td class="num">${fmt(r.a.buyers)}</td><td>${ago(S.upload[r.id])}</td><td class="num">${S.tax[r.id]!=null&&S.upload[r.id]?S.tax[r.id]+'%':'—'}</td></tr>`}).join('')}</table>
   <p class="note">成交額變化：今日對比前 7 日日均（熱門物品若達 999 筆上限，以實際涵蓋天數換算）。伺服器指數：只用該伺服器的成交計算成分股「今日／前 7 日」股價。資料新鮮度：成分股中最近一次有人上傳該伺服器市場資料的時間。稅率：該伺服器各城市中最常見的稅率。</p></div>
  <div class="panel"><h2>類股熱力圖<span class="muted">各伺服器類股指數漲跌幅</span></h2><table class="heat"><tr><th class="l">類股</th>${WORLDS.map(([,n])=>`<th style="text-align:center">${n}</th>`).join('')}<th style="text-align:center">全 DC</th></tr>
  ${[{key:null,name:'大盤',ids}].concat(SECTORS.map(s=>({key:s.key,name:s.name,ids:S.cons.sectors[s.key]}))).map(s=>`<tr><td class="l" style="font-family:inherit">${s.name}</td>${WORLDS.map(([wid])=>{const v=indexOf(s.ids,wid).chg;return `<td style="${heat(v)}">${v==null?'—':(v>0?'+':'')+fmt(v,1)+'%'}</td>`}).join('')}
   ${(()=>{const v=indexOf(s.ids,null).chg;return `<td style="${heat(v)}">${v==null?'—':(v>0?'+':'')+fmt(v,1)+'%'}</td>`})()}</tr>`).join('')}</table></div>`;
}

/* ========== 自選股 ========== */
async function renderWatch(tok){
  if(!S.watch.length){$('#view').innerHTML=`<h1>自選股</h1><div class="panel empty">還沒有自選股。在任何列表點 ★ 或在個股頁按「加入自選」。</div>`;return}
  $('#view').innerHTML=`<h1>自選股</h1><div class="panel empty">載入中…</div>`;
  await loadHist(S.watch);if(tok!==TOKEN)return;
  $('#view').innerHTML=`<h1>自選股 <span class="muted" style="font-size:13px;font-weight:400">${scopeName()}・${S.watch.length} 檔</span></h1><div class="panel">${stockTable(S.watch)}</div>`;
}

/* ========== 自訂類股 ========== */
S.custom=lsGet('aex_custom',[]);
const customOf=k=>S.custom.find(c=>c.id===k);
function saveCustom(){lsSet('aex_custom',S.custom)}
function sectorIds(k){if(!k||k==='all')return allCons();if(k.startsWith('c_'))return customOf(k)?.ids||[];return S.cons.sectors[k]||[]}
function sectorName(k){if(!k||k==='all')return '大盤';if(k.startsWith('c_'))return customOf(k)?.name||'自訂類股';return SEC[k]?.name||k}
const customIdsAll=()=>[...new Set(S.custom.flatMap(c=>c.ids))];
let customLoading=false;
function ensureCustomHist(){ // 自訂類股的非成分股需要另外抓資料，抓完重畫
  const need=customIdsAll().filter(id=>!S.hist[id]);
  if(!need.length||customLoading)return;
  customLoading=true;loadHist(need).then(()=>{customLoading=false;route()});
}
function openCustom(id){
  const src=id?customOf(id):null;
  const d={id:src?.id||'c_'+Date.now().toString(36),name:src?.name||'',ids:[...(src?.ids||[])]};
  const draw=()=>{
    $('#clist').innerHTML=d.ids.length?d.ids.map(i=>`<div class="lg" style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #1a2030">${ico(ITEM[i])}<span style="flex:1">${esc(ITEM[i]?.n)}</span><span class="muted" style="font-size:12px">${esc(CATS[ITEM[i]?.cat]||'')}</span><button class="btn sm" data-cdel="${i}">移除</button></div>`).join('')
      :'<div class="empty" style="padding:14px">還沒有股票，用上方搜尋加入</div>';
    $('#ccount').textContent=`${d.ids.length} 檔`;
  };
  $('#mbox').innerHTML=`<h2>${src?'編輯自訂類股':'新增自訂類股'}</h2>
  <div class="form"><div>類股名稱</div><div><input id="cs_name" value="${esc(d.name)}" placeholder="例如：我的料理股、雇員採集股"></div>
    <div>加入股票</div><div class="search" style="flex:none"><input id="cs_q" placeholder="搜尋物品名稱，按 Enter 加入" autocomplete="off"><div class="dropdown" id="cs_dd"></div></div>
    <div>快速加入</div><div class="row2"><button class="btn sm" id="cs_watch">自選股全部</button><button class="btn sm" id="cs_clear">清空</button><span class="muted" id="ccount" style="margin-left:auto"></span></div></div>
  <div id="clist" style="max-height:300px;overflow:auto;margin-top:12px"></div>
  <p class="note">指數算法和內建類股相同：前 7 日 = 1,000，依成交額加權。</p>
  <div style="display:flex;gap:8px;margin-top:10px">${src?'<button class="btn" id="cs_delete" style="color:var(--up)">刪除類股</button>':''}<span style="flex:1"></span><button class="btn" id="cs_cancel">取消</button><button class="btn primary" id="cs_save">儲存</button></div>`;
  $('#modal').style.display='grid';draw();$('#cs_name').focus();
  bindSearch($('#cs_q'),$('#cs_dd'),it=>{if(!d.ids.includes(it.id))d.ids.push(it.id);$('#cs_q').value='';draw()});
  $('#clist').onclick=ev=>{const b=ev.target.closest('[data-cdel]');if(b){d.ids=d.ids.filter(x=>x!==+b.dataset.cdel);draw()}};
  $('#cs_watch').onclick=()=>{S.watch.forEach(i=>{if(!d.ids.includes(i))d.ids.push(i)});draw()};
  $('#cs_clear').onclick=()=>{d.ids=[];draw()};
  $('#cs_cancel').onclick=closeModal;
  if(src)$('#cs_delete').onclick=()=>{if(!confirm(`刪除自訂類股「${src.name}」？`))return;S.custom=S.custom.filter(c=>c.id!==src.id);saveCustom();S.wall=S.wall.filter(t=>t!=='s:'+src.id);saveWall();closeModal();location.hash='#/sector/'};
  $('#cs_save').onclick=()=>{
    d.name=$('#cs_name').value.trim();if(!d.name)return toast('請輸入類股名稱');if(!d.ids.length)return toast('至少加入一檔股票');
    if(src)Object.assign(src,d);else S.custom.push(d);saveCustom();closeModal();toast('已儲存');
    if(location.hash==='#/sector/'+d.id)route();else location.hash='#/sector/'+d.id;
  };
}
function openAddToCustom(itemId){
  $('#mbox').innerHTML=`<h2>加入自訂類股<span class="muted">${esc(ITEM[itemId].n)}</span></h2>
  ${S.custom.length?S.custom.map(c=>`<label style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid #1a2030"><input type="checkbox" data-cid="${c.id}" ${c.ids.includes(itemId)?'checked':''}> ${esc(c.name)} <span class="muted">${c.ids.length} 檔</span></label>`).join(''):'<div class="empty">還沒有自訂類股</div>'}
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="ac_new">＋ 新增類股</button><span style="flex:1"></span><button class="btn" id="ac_cancel">取消</button><button class="btn primary" id="ac_save">儲存</button></div>`;
  $('#modal').style.display='grid';
  $('#ac_cancel').onclick=closeModal;
  $('#ac_new').onclick=()=>{openCustom();bindLater(()=>{})};
  $('#ac_save').onclick=()=>{document.querySelectorAll('[data-cid]').forEach(cb=>{const c=customOf(cb.dataset.cid);const has=c.ids.includes(itemId);
    if(cb.checked&&!has)c.ids.push(itemId);if(!cb.checked&&has)c.ids=c.ids.filter(x=>x!==itemId)});saveCustom();closeModal();toast('已更新自訂類股')};
}
function bindLater(f){setTimeout(f,0)}

/* ========== 多圖看盤 ========== */
const LAYOUTS={'1x1':[1,1],'2x1':[2,1],'2x2':[2,2],'3x2':[3,2],'4x2':[4,2],'3x3':[3,3]};
S.multi=Object.assign({layout:'3x2',mode:'day',slots:[]},lsGet('aex_multi',{}));
function saveMulti(){lsSet('aex_multi',S.multi)}
function fillMulti(ids){const [c,r]=LAYOUTS[S.multi.layout];const n=c*r;S.multi.slots=ids.slice(0,n);saveMulti();route()}
async function renderMulti(tok){
  const M=S.multi;const [c,r]=LAYOUTS[M.layout]||[3,2];const n=c*r;
  const slots=Array.from({length:n},(_,i)=>M.slots[i]&&ITEM[M.slots[i]]?M.slots[i]:null);
  const ids=slots.filter(Boolean);
  if(ids.some(id=>!S.hist30[id])){$('#view').innerHTML=`<div class="empty">載入 ${ids.length} 檔 K 線…</div>`;await loadHist(ids,{within:30*DAY,store:S.hist30,size:5});if(tok!==TOKEN)return}
  const avail=window.innerHeight-56-34-150;const ch=Math.max(150,Math.floor(avail/r)-58);
  const opts=[['watch','自選股'],['wall','看盤牆'],['gain','今日漲幅前'],['loss','今日跌幅前'],['amt','成交額前']];
  $('#view').innerHTML=`<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
    <h1 style="margin:0">多圖看盤 <span class="muted" style="font-size:13px;font-weight:400">${scopeName()}・${M.mode==='day'?'日 K・近 30 日':'小時 K・近 72 小時'}</span></h1>
    <span class="seg">${Object.keys(LAYOUTS).map(k=>`<button data-mlayout="${k}" class="${M.layout===k?'on':''}" title="${LAYOUTS[k][0]*LAYOUTS[k][1]} 格">${k.replace('x','×')}</button>`).join('')}</span>
    <span class="seg"><button data-mmode="day" class="${M.mode==='day'?'on':''}">日 K</button><button data-mmode="hour" class="${M.mode==='hour'?'on':''}">小時 K</button></span>
    <span class="muted">快速帶入</span>${opts.map(([k,t])=>`<button class="btn sm" data-mfill="${k}">${t}${['gain','loss','amt'].includes(k)?' '+n:''}</button>`).join('')}
    <select class="scope" id="mfillsec" style="padding:3px 8px"><option value="">類股…</option>${[...SECTORS.map(s=>[s.key,s.name]),...S.custom.map(c=>[c.id,'★ '+c.name])].map(([k,t])=>`<option value="${k}">${esc(t)}</option>`).join('')}</select>
    <button class="btn sm" data-mfill="clear">清空</button>
  </div>
  <div class="grid" style="grid-template-columns:repeat(${c},minmax(0,1fr));gap:10px">
  ${slots.map((id,i)=>{
    if(!id)return `<div class="panel mslot empty-slot" style="height:${ch+58}px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px">
      <div class="muted">第 ${i+1} 格</div><div class="search" style="width:80%;flex:none"><input id="ms_${i}" placeholder="＋ 選擇股票" autocomplete="off"><div class="dropdown" id="msd_${i}"></div></div></div>`;
    const it=ITEM[id];const q=mainQ(id);const s=statsOf(S.hist30[id]?.e||[],q,S.scope);
    return `<div class="panel mslot" style="padding:8px 10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">${ico(it)}<a href="#/item/${id}" style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.n)}</a>${q?'<span class="hq">HQ</span>':''}
        ${(S.hist30[id]?.raw||0)>=999?`<span class="tag" title="熱門物品受 999 筆上限影響，只涵蓋最近一段時間">資料僅 ${fmt(Math.max(1,(nowS()-Math.min(...(S.hist30[id].e.map(x=>x.t)||[nowS()])))/DAY),1)} 天</span>`:''}
        <span class="num ${cls(s.chg)}" style="margin-left:auto;font-weight:700">${fmt(s.price)}</span>${pct(s.chg)}
        <b class="star ${S.watch.includes(id)?'on':''}" data-star="${id}" title="自選股">★</b><b class="muted" style="cursor:pointer;padding:0 2px" data-mslot="${i}" title="換股票">✕</b></div>
      <div class="chartbox" id="mbox_${i}"><canvas style="height:${ch}px"></canvas><div class="tip"></div></div></div>`}).join('')}
  </div>`;
  slots.forEach((id,i)=>{
    if(id){const q=mainQ(id);const es=(S.hist30[id]?.e||[]).filter(x=>x.hq===q&&(!S.scope||x.w===S.scope));mountCandles($('#mbox_'+i),buildCandles(es,M.mode),{ov:S.kopt.ov})}
    else bindSearch($('#ms_'+i),$('#msd_'+i),it=>{M.slots[i]=it.id;saveMulti();route()});
  });
  $('#mfillsec').onchange=async ev=>{const k=ev.target.value;if(!k)return;const ids=sectorIds(k);await loadHist(ids);
    fillMulti([...ids].sort((a,b)=>stats(b).amt-stats(a).amt))};
}
document.addEventListener('click',ev=>{
  const t=ev.target;let el;
  if(el=t.closest('[data-mlayout]')){S.multi.layout=el.dataset.mlayout;saveMulti();route();return}
  if(el=t.closest('[data-mmode]')){S.multi.mode=el.dataset.mmode;saveMulti();route();return}
  if(el=t.closest('[data-mslot]')){S.multi.slots[+el.dataset.mslot]=null;saveMulti();route();return}
  if(el=t.closest('[data-mfill]')){
    const k=el.dataset.mfill;const [c,r]=LAYOUTS[S.multi.layout];const n=c*r;
    const ranked=f=>allCons().map(id=>({id,s:stats(id)})).filter(x=>x.s.price!=null&&x.s.prev.length>=3&&x.s.today.length>=2).sort(f).map(x=>x.id);
    if(k==='clear')fillMulti([]);
    else if(k==='watch'){if(!S.watch.length)return toast('還沒有自選股');fillMulti(S.watch)}
    else if(k==='wall'){const ids=S.wall.filter(x=>x[0]==='i').map(x=>+x.slice(2));if(!ids.length)return toast('看盤牆上沒有個股');fillMulti(ids)}
    else if(k==='gain')fillMulti(ranked((a,b)=>(b.s.chg??-1e9)-(a.s.chg??-1e9)));
    else if(k==='loss')fillMulti(ranked((a,b)=>(a.s.chg??1e9)-(b.s.chg??1e9)));
    else if(k==='amt')fillMulti(allCons().sort((a,b)=>stats(b).amt-stats(a).amt));
    return;
  }
  if(el=t.closest('[data-custom-new]')){openCustom();return}
  if(el=t.closest('[data-custom-edit]')){openCustom(el.dataset.customEdit);return}
  if(el=t.closest('[data-addcustom]')){openAddToCustom(+el.dataset.addcustom);return}
});

/* ========== 看盤牆 ========== */
const WALL_COLORS=['#f0b429','#22d3ee','#e879f9','#a3e635','#fb923c','#a78bfa','#f1f5f9','#f472b6','#60a5fa','#2dd4bf'];
const WALL_MAX=10;
const WALL_RANGES={day:{label:'24 小時',step:3600,n:24,fmt:t=>tstr(t,false)},week:{label:'7 日',step:6*3600,n:28,fmt:t=>tstr(t)},month:{label:'30 日',step:DAY,n:30,fmt:t=>{const d=new Date(t*1000);return `${d.getMonth()+1}/${d.getDate()}`}}};
S.wall=lsGet('aex_wall',null)||['s:all',...SECTORS.map(s=>'s:'+s.key)];
S.wallRange=lsGet('aex_wallrange','week');
S.wallLast=S.wallLast||{};
function saveWall(){lsSet('aex_wall',S.wall)}
function wallLabel(tok){const [k,v]=tok.split(':');if(k==='s')return v==='all'?'大盤指數':(v.startsWith('c_')?'★ ':'')+sectorName(v)+'指數';return ITEM[+v]?.n||v}
function bucketSeries(es,start,step,n){
  const out=new Array(n).fill(null),vol=new Array(n).fill(0);const bk=Array.from({length:n},()=>[]);
  es.forEach(x=>{const i=Math.floor((x.t-start)/step);if(i>=0&&i<n){bk[i].push(x);vol[i]+=x.q}});
  let last=null;for(let i=0;i<n;i++){const m=wmedian(bk[i]);if(m!=null)last=m;out[i]=last}
  const fi=out.findIndex(v=>v!=null);if(fi<0)return null;
  return {p:out,vol,fi};
}
function wallSeries(tok,rg){
  const R=WALL_RANGES[rg];const end=Math.ceil(nowS()/R.step)*R.step;const start=end-R.n*R.step;
  const [k,v]=tok.split(':');
  if(k==='i'){
    const id=+v;const h=(rg==='month'?S.hist30:S.hist)[id];if(!h)return null;
    const q=mainQ(id);const es=h.e.filter(x=>x.hq===q&&(!S.scope||x.w===S.scope));
    const s=bucketSeries(es,start,R.step,R.n);if(!s)return null;
    return {...s,start,abs:true};
  }
  if(rg==='month')return null; // 類股指數只有 8 天資料
  if(v.startsWith('c_')&&!customOf(v))return null;
  const ids=sectorIds(v);
  let num=new Array(R.n).fill(0),den=0;const vol=new Array(R.n).fill(0);
  ids.forEach(id=>{const st=stats(id);if(!(st.dAmt>0))return;const s=bucketSeries(st.es,start,R.step,R.n);if(!s)return;
    const p=s.p.map(v=>v??s.p[s.fi]);for(let i=0;i<R.n;i++){num[i]+=st.dAmt*p[i]/p[0];vol[i]+=s.vol[i]*p[i]}den+=st.dAmt});
  if(!den)return null;
  return {p:num.map(x=>1000*x/den),vol,start,abs:false,fi:0};
}
function drawCompare(cv,lines,labels,hover){
  const {g,W,H}=setupCanvas(cv);g.clearRect(0,0,W,H);
  const MU=CSSV('--muted');g.font='11px '+CSSV('--mono');
  const valid=lines.filter(l=>l.pct);
  if(!valid.length){g.fillStyle=MU;g.fillText('沒有可比較的資料',W/2-50,H/2);return null}
  const padL=10,padR=64,padT=14,padB=24;const n=labels.length;
  const allv=valid.flatMap(l=>l.pct).filter(v=>v!=null);let mn=Math.min(0,...allv),mx=Math.max(0,...allv);const r=(mx-mn)||1;mn-=r*.08;mx+=r*.08;
  const X=i=>padL+i/(n-1)*(W-padL-padR),Y=v=>padT+(mx-v)/(mx-mn)*(H-padT-padB);
  // 網格
  g.strokeStyle='#18202c';g.fillStyle=MU;
  for(let i=0;i<=6;i++){const v=mn+(mx-mn)*i/6;g.beginPath();g.moveTo(padL,Y(v));g.lineTo(W-padR,Y(v));g.stroke();g.fillText((v>0?'+':'')+v.toFixed(1)+'%',W-padR+6,Y(v)+4)}
  const every=Math.ceil(n/8);for(let i=0;i<n;i+=every){g.beginPath();g.moveTo(X(i),padT);g.lineTo(X(i),H-padB);g.stroke();g.fillText(labels[i],Math.max(padL,X(i)-14),H-6)}
  g.setLineDash([5,4]);g.strokeStyle='#6b7280';g.beginPath();g.moveTo(padL,Y(0));g.lineTo(W-padR,Y(0));g.stroke();g.setLineDash([]);
  valid.forEach(l=>{
    g.strokeStyle=l.color;g.lineWidth=l.focus?2.6:1.6;g.globalAlpha=l.dim?.25:1;g.beginPath();
    let st=false;l.pct.forEach((v,i)=>{if(v==null)return;st?g.lineTo(X(i),Y(v)):g.moveTo(X(i),Y(v));st=true});g.stroke();
    // 末端標籤
    const lv=l.pct[n-1];g.fillStyle=l.color;g.beginPath();g.arc(X(n-1),Y(lv),3,0,7);g.fill();
    g.globalAlpha=1;g.lineWidth=1;
  });
  if(hover!=null){g.strokeStyle='#9aa3b2';g.setLineDash([3,3]);g.beginPath();g.moveTo(X(hover)+.5,padT);g.lineTo(X(hover)+.5,H-padB);g.stroke();g.setLineDash([]);
    valid.forEach(l=>{if(l.pct[hover]==null)return;g.fillStyle=l.color;g.beginPath();g.arc(X(hover),Y(l.pct[hover]),3.5,0,7);g.fill()})}
  return {padL,padR,W,n};
}
function miniSvg(p0,vol,w=240,h=64,fi=0){
  const p=p0.map(v=>v??p0[fi]);const pv=p0.slice(fi);const mn=Math.min(...pv),mx=Math.max(...pv),r=(mx-mn)||1;const vh=14,ph=h-vh-2;
  const X=i=>(i/(p.length-1)*w).toFixed(1),Y=v=>(2+(mx-v)/r*(ph-4)).toFixed(1);
  const up=p[p.length-1]>=p[fi];const c=up?'var(--up)':'var(--down)';const gid='g'+Math.random().toString(36).slice(2,8);
  const line=p.map((v,i)=>i<fi?'':`${i>fi?'L':'M'}${X(i)},${Y(v)}`).join('');
  const vm=Math.max(1,...vol);const bw=Math.max(1,w/p.length-1);
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;height:${h}px">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up?'#ff4d55':'#22c07a'}" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
     <path d="${line}L${w},${ph}L${X(fi)},${ph}Z" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="${c}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    ${vol.map((v,i)=>v?`<rect x="${(i/p.length*w).toFixed(1)}" y="${(h-v/vm*vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${(v/vm*vh).toFixed(1)}" fill="#3b4558"/>`:'').join('')}</svg>`;
}
async function renderWall(tok){
  const rg=S.wallRange;const R=WALL_RANGES[rg];
  const itemIds=S.wall.filter(t=>t[0]==='i').map(t=>+t.slice(2));
  const cIds=S.wall.filter(t=>t.startsWith('s:c_')).flatMap(t=>sectorIds(t.slice(2))).filter(id=>!S.hist[id]);
  if(cIds.length){await loadHist(cIds);if(tok!==TOKEN)return}
  if(itemIds.length){
    $('#view').innerHTML=`<div class="empty">載入看盤牆…</div>`;
    if(rg==='month')await loadHist(itemIds,{within:30*DAY,store:S.hist30,size:5});else await loadHist(itemIds);
    if(tok!==TOKEN)return;
  }
  const end=Math.ceil(nowS()/R.step)*R.step,start=end-R.n*R.step;
  const labels=Array.from({length:R.n},(_,i)=>R.fmt(start+i*R.step));
  const lines=S.wall.map((tok,i)=>{const s=wallSeries(tok,rg);const color=WALL_COLORS[i%WALL_COLORS.length];
    return {tok,label:wallLabel(tok),color,s,pct:s?s.p.map(v=>v==null?null:(v/s.p[s.fi]-1)*100):null}});
  const flash={};lines.forEach(l=>{if(!l.s)return;const last=l.s.p[l.s.p.length-1];const prev=S.wallLast[l.tok+rg];if(prev!=null&&prev!==last)flash[l.tok]=last>prev?'fu':'fd';S.wallLast[l.tok+rg]=last});
  const ups=lines.filter(l=>l.pct&&l.pct[l.pct.length-1]>0.005).length,dns=lines.filter(l=>l.pct&&l.pct[l.pct.length-1]<-0.005).length;
  const best=[...lines].filter(l=>l.pct).sort((a,b)=>b.pct.at(-1)-a.pct.at(-1));
  $('#view').innerHTML=`
  <div class="wall-top">
    <div><div class="wall-title">看盤牆 <span class="live"><i></i>LIVE</span></div><div class="muted" style="font-size:12px">${scopeName()}・${R.label}・${S.wall.length} 檔・漲跌幅以區間起點為基準</div></div>
    <div class="wall-stat"><span class="muted">上漲</span><b class="num up">${ups}</b><span class="muted">下跌</span><b class="num down">${dns}</b>
      ${best.length?`<span class="muted">領漲</span><b>${esc(best[0].label)}</b>${pct(best[0].pct.at(-1))}<span class="muted">領跌</span><b>${esc(best.at(-1).label)}</b>${pct(best.at(-1).pct.at(-1))}`:''}</div>
    <div class="clock num" id="wclock"></div>
  </div>
  <div class="tabs" style="align-items:center;flex-wrap:wrap">
    <span class="seg">${Object.entries(WALL_RANGES).map(([k,v])=>`<button data-wrange="${k}" class="${rg===k?'on':''}">${v.label}</button>`).join('')}</span>
    <div class="search" style="flex:0 0 260px"><input id="wq" placeholder="＋ 加入物品（${S.wall.length}/${WALL_MAX}）" autocomplete="off"><div class="dropdown" id="wdd"></div></div>
    <button class="btn sm" data-wpreset="index">類股指數</button>
    ${S.custom.length?`<select class="scope" id="wcustom" style="padding:3px 8px"><option value="">＋ 自訂類股指數…</option>${S.custom.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`:''}
    <button class="btn sm" data-wpreset="watch">自選股</button>
    <button class="btn sm" data-wpreset="gain">今日漲幅前 5</button>
    <button class="btn sm" data-wpreset="vol">成交額前 5</button>
    <button class="btn sm" data-wpreset="clear">清空</button>
  </div>
  <div class="grid" style="grid-template-columns:1fr 280px;margin-bottom:14px">
    <div class="panel"><div class="chartbox" id="cbox"><canvas style="height:420px"></canvas><div class="tip"></div></div>
      ${(()=>{const late=lines.filter(l=>l.s&&l.s.fi>0).map(l=>l.label);const n=[];if(rg==='month'&&S.wall.some(t=>t[0]==='s'))n.push('類股指數只有近 8 天資料，30 日區間不顯示');
   if(late.length)n.push(`${late.slice(0,3).join('、')}${late.length>3?' 等':''}在區間前段沒有成交紀錄（熱門物品受 999 筆上限影響），線條從有資料處開始，漲跌幅以第一筆為基準`);
   return n.length?`<p class="note">${n.join('；')}。</p>`:''})()}</div>
    <div class="panel legend">${lines.map(l=>`<div class="lg ${l.pct?'':'off'}" data-wfocus="${l.tok}"><i style="background:${l.color}"></i><span class="n" title="${esc(l.label)}">${esc(l.label)}</span>
      <span class="num ${l.pct?cls(l.pct.at(-1)):'flat'}">${l.pct?(l.pct.at(-1)>0?'+':'')+fmt(l.pct.at(-1),2)+'%':'—'}</span><b data-wdel="${l.tok}" title="移除">×</b></div>`).join('')||'<div class="empty">還沒有選股</div>'}
      <p class="note">滑過圖例可以凸顯單一條線。</p></div>
  </div>
  <div class="wall-grid">${lines.map(l=>{const last=l.s?.p.at(-1);const ch=l.pct?.at(-1);const it=l.tok[0]==='i'?ITEM[+l.tok.slice(2)]:null;
    return `<div class="tile ${flash[l.tok]||''}" ${it?`data-go="#/item/${it.id}"`:`data-go="#/sector/${l.tok.slice(2)==='all'?'':l.tok.slice(2)}"`} style="border-top:2px solid ${l.color}">
      <div class="th">${it?ico(it):'<span class="idx">指</span>'}<span class="n">${esc(l.label)}</span>${it&&mainQ(it.id)?'<span class="hq">HQ</span>':''}</div>
      <div class="tp"><span class="num big ${cls(ch)}">${l.s?fmt(last,l.s.abs?0:2):'—'}</span>${pct(ch)}</div>
      ${l.s?miniSvg(l.s.p,l.s.vol,240,64,l.s.fi):'<div class="empty" style="padding:18px">無資料</div>'}
      <div class="tf muted"><span>區間高 <b class="num">${l.s?fmt(Math.max(...l.s.p.filter(v=>v!=null)),l.s.abs?0:2):'—'}</b></span><span>低 <b class="num">${l.s?fmt(Math.min(...l.s.p.filter(v=>v!=null)),l.s.abs?0:2):'—'}</b></span></div>
    </div>`}).join('')}</div>`;
  // 圖表
  const box=$('#cbox'),cv=box.querySelector('canvas'),tip=box.querySelector('.tip');
  let focus=null;const draw=h=>drawCompare(cv,lines.map(l=>({...l,focus:focus===l.tok,dim:focus&&focus!==l.tok})),labels,h);
  let L=draw();
  cv.onmousemove=ev=>{if(!L)return;const rc=cv.getBoundingClientRect();const i=Math.round((ev.clientX-rc.left-L.padL)/(L.W-L.padL-L.padR)*(L.n-1));
    if(i<0||i>=L.n){tip.style.display='none';return}L=draw(i);
    const rows=lines.filter(l=>l.pct&&l.pct[i]!=null).map(l=>({l,v:l.pct[i],p:l.s.p[i]})).sort((a,b)=>b.v-a.v);
    tip.innerHTML=`<b>${labels[i]}</b>`+rows.map(r=>`<div style="display:flex;gap:10px;justify-content:space-between"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${r.l.color};margin-right:6px"></i>${esc(r.l.label)}</span><span class="num ${cls(r.v)}">${r.v>0?'+':''}${fmt(r.v,2)}%</span></div>`).join('');
    tip.style.display='block';let tx=ev.clientX-rc.left+16;if(tx>rc.width-240)tx-=260;tip.style.left=tx+'px';tip.style.top='12px'};
  cv.onmouseleave=()=>{tip.style.display='none';L=draw()};
  document.querySelectorAll('[data-wfocus]').forEach(el=>{el.onmouseenter=()=>{focus=el.dataset.wfocus;L=draw()};el.onmouseleave=()=>{focus=null;L=draw()}});
  if($('#wcustom'))$('#wcustom').onchange=ev=>{const v=ev.target.value;if(!v)return;const t='s:'+v;if(S.wall.includes(t))return toast('已經在看盤牆上');if(S.wall.length>=WALL_MAX)return toast(`最多 ${WALL_MAX} 檔`);S.wall.push(t);saveWall();route()};
  bindSearch($('#wq'),$('#wdd'),it=>{const t='i:'+it.id;if(S.wall.includes(t))return toast('已經在看盤牆上');if(S.wall.length>=WALL_MAX)return toast(`最多 ${WALL_MAX} 檔`);S.wall.push(t);saveWall();route()});
  const tick=()=>{const c=$('#wclock');if(!c){clearInterval(S.wallClock);return}const d=new Date();c.innerHTML=`${d.toLocaleDateString('zh-TW')}<br><b>${d.toLocaleTimeString('zh-TW',{hour12:false})}</b>`};
  clearInterval(S.wallClock);S.wallClock=setInterval(tick,1000);tick();
}
document.addEventListener('click',ev=>{
  const t=ev.target;let el;
  if(el=t.closest('[data-wdel]')){ev.stopPropagation();S.wall=S.wall.filter(x=>x!==el.dataset.wdel);saveWall();route();return}
  if(el=t.closest('[data-wrange]')){S.wallRange=el.dataset.wrange;lsSet('aex_wallrange',S.wallRange);route();return}
  if(el=t.closest('[data-wpreset]')){
    const k=el.dataset.wpreset;
    const top=f=>allCons().map(id=>({id,s:stats(id)})).filter(r=>r.s.price!=null&&r.s.prev.length>=3&&r.s.today.length>=2).sort(f).slice(0,5).map(r=>'i:'+r.id);
    if(k==='index')S.wall=['s:all',...SECTORS.map(s=>'s:'+s.key)];
    else if(k==='watch'){if(!S.watch.length)return toast('還沒有自選股');S.wall=S.watch.slice(0,WALL_MAX).map(id=>'i:'+id)}
    else if(k==='gain')S.wall=['s:all',...top((a,b)=>(b.s.chg??-1e9)-(a.s.chg??-1e9))];
    else if(k==='vol')S.wall=['s:all',...top((a,b)=>b.s.amt-a.s.amt)];
    else if(k==='clear')S.wall=[];
    saveWall();route();
  }
});

