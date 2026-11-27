"use strict";
/* 艾奧傑亞證券交易所：交易紀錄本 */
/* ========== 交易紀錄本 ========== */
// 角色：{id,name,world,rets:[{name,world}]}；紀錄：{id,charId,itemId,side,price,qty,hq,world,tax,time,note,src,ret}
S.chars=lsGet('aex_chars',[]);S.chars.forEach(c=>{if(!Array.isArray(c.rets))c.rets=[]});
S.jview=lsGet('aex_jview','all');            // 'all' | charId | 'none'
S.detect=lsGet('aex_detect',{});             // charId -> {t, found:[買入], ts, sold:[賣出]}
S.rsnap=lsGet('aex_rsnap',{});               // charId -> {t, list:[{itemId,p,q,hq,world,ret,seen}]}：雇員上架快照
S.ignored=new Set(lsGet('aex_ignored',[]));  // 略過的偵測交易 key
function saveJournal(){lsSet('aex_journal',S.journal)}
function saveChars(){lsSet('aex_chars',S.chars)}
const charOf=id=>S.chars.find(c=>c.id===id);
const charLabel=c=>`${c.name}@${WN[c.world]||'?'}`;   // 角色名稱只在同一伺服器內唯一，顯示時一律帶伺服器
const charName=id=>{const c=charOf(id);return c?charLabel(c):'未指定角色'};
const tradeKey=x=>x.side==='sell'?`s|${x.itemId}|${x.t}|${x.p}|${x.q}|${x.world}`:`${x.itemId}|${x.t}|${x.p}|${x.q}`;
const lc=s=>(s||'').trim().toLowerCase();
function jRecords(){
  if(S.jview==='all')return S.journal;
  if(S.jview==='none')return S.journal.filter(r=>!charOf(r.charId));
  return S.journal.filter(r=>r.charId===S.jview);
}
function calcBook(recs){
  const pos={};let realized=0,totalBuy=0,totalSell=0,unmatched=0,noCostAmt=0,usedCost=0;
  [...recs].sort((a,b)=>a.time-b.time).forEach(r=>{
    const k=r.itemId+'|'+(r.hq?1:0);const p=pos[k]=pos[k]||{itemId:r.itemId,hq:!!r.hq,qty:0,cost:0,realized:0,buyCost:0,sold:0};
    if(r.side==='buy'){const c=r.price*r.qty*(1+(r.tax||0)/100);p.qty+=r.qty;p.cost+=c;p.buyCost+=c;totalBuy+=c}
    else if(r.side==='adj'){const avg=p.qty>0?p.cost/p.qty:0;
      if(r.qty<0){const mq=Math.min(-r.qty,p.qty);p.cost-=avg*mq;p.qty-=mq;
        // 用掉／拿去製作：成本轉為支出，計入已實現損益；修正數量（舊紀錄）則不計
        if(r.use){const c=avg*mq;p.realized-=c;realized-=c;usedCost+=c}}
      else{p.cost+=avg*r.qty;p.qty+=r.qty}}
    else{const net=r.price*(1-(r.tax||0)/100);const avg=p.qty>0?p.cost/p.qty:0;const mq=Math.min(r.qty,p.qty);
      // 超過持倉的數量（例如自己製作的成品）沒有買入成本，以實收全額計入
      const extra=r.qty-mq;const rz=(net-avg)*mq+net*extra;
      p.realized+=rz;realized+=rz;p.cost-=avg*mq;p.qty-=mq;p.sold+=net*r.qty;totalSell+=net*r.qty;if(extra>0){unmatched++;noCostAmt+=net*extra}}
  });
  return {pos:Object.values(pos),realized,totalBuy,totalSell,unmatched,noCostAmt,usedCost};
}

/* 掃描：買入看成交紀錄的 buyerName（全 DC 伺服器，可跨服），賣出看雇員上架是否消失且有對應成交 */
/* 減少對 Universalis 的存取：
   1. 沿用全站的請求節流（同時 4 個、每秒最多 8 個），不另外加速
   2. 同一角色 10 分鐘內不重掃（市場資料要有人上傳才會變）
   3. 再次掃描時先查各伺服器「最近更新的物品」（每服 1 個請求），只要涵蓋到上次掃描，就只查這些有變動的物品 */
const SCAN_COOLDOWN=10*60*1000;
const scanAge=c=>Math.min(S.detect[c.id]?.t||0,c.rets?.length?(S.rsnap[c.id]?.t||0):Infinity);
const scanWait=c=>Math.max(0,SCAN_COOLDOWN-(Date.now()-scanAge(c)));
async function changedItemsSince(t){
  // 每服 1 個請求：順便更新「玩家最後上傳時間」；再判斷能不能只查有變動的物品
  const ids=new Set();let full=!t;
  for(const [w] of WORLDS){
    let d;try{d=await getJSON(`${API}/v2/extra/stats/most-recently-updated?world=${w}&entries=200`,{persist:false,ttl:0})}catch{full=true;continue}
    const it=d?.items||[];if(it.length)noteUpload(w,Math.max(...it.map(x=>x.lastUploadTime)));
    if(full)continue;
    if(it.length>=200&&Math.min(...it.map(x=>x.lastUploadTime))>t){full=true;continue}  // 200 筆沒蓋到上次掃描 → 全掃
    it.forEach(x=>{if(x.lastUploadTime>=t&&ITEM[x.itemID])ids.add(x.itemID)});
  }
  return full?null:[...ids];
}
const SCANP={done:0,total:0,msg:''};
async function scanChars(chars){
  Object.assign(SCANP,{done:0,total:0});
  const rc=chars.filter(c=>c.rets?.length);
  showOverlay(`掃描 ${chars.map(charLabel).join('、')} 的交易紀錄`,'檢查哪些物品有更新…');
  try{
    const since=Math.min(...chars.map(scanAge));
    const ids=await changedItemsSince(since?since-120000:0);   // null＝全部物品
    await Promise.all([scanBuys(chars,ids),rc.length?scanRetainers(rc,ids):null]);
  }finally{lsSet('aex_detect',S.detect);lsSet('aex_rsnap',S.rsnap);hideOverlay();renderUpd()}
}
function scanMsg(m){SCANP.msg=m;setProgress(SCANP.total?SCANP.done/SCANP.total:0,`${m}・${SCANP.done} / ${SCANP.total} 批`)}
async function runBatches(tasks){
  SCANP.total+=tasks.length;let fails=0;
  await Promise.all(tasks.map(async([url,onData,onFail])=>{
    try{onData(await getJSON(url,{persist:false,ttl:0}))}catch(e){console.warn('scan',e);fails++;onFail&&onFail()}
    SCANP.done++;scanMsg(SCANP.msg);
  }));
  return fails;
}
async function scanBuys(chars,only){
  // 角色＝名稱＋伺服器。但成交紀錄只有買家名稱、沒有買家所屬伺服器（任何角色都能跨服購買），
  // 所以登記了同名角色（不同伺服器）時無從判斷是誰買的：這筆會列在每個同名角色底下，標「同名待確認」，由使用者選擇歸屬
  const names=new Map();chars.forEach(c=>{const k=lc(c.name);names.set(k,[...(names.get(k)||[]),c])});
  const found={};chars.forEach(c=>found[c.id]=[]);
  // 增量掃描：掃過的角色只抓上次掃描之後（多留 1 小時緩衝）的成交，資料量小很多
  const lastT=Math.min(...chars.map(c=>S.detect[c.id]?.t||0));
  const within=lastT?Math.min(7*DAY,Math.ceil((Date.now()-lastT)/1000)+3600):7*DAY;
  const since=Date.now()/1000-within;const hot=new Set();
  const F='items.itemID,items.entries.buyerName,items.entries.timestamp,items.entries.pricePerUnit,items.entries.quantity,items.entries.hq,items.entries.worldID';
  const take=(id,x,w)=>{const cs=names.get(lc(x.buyerName));if(!cs)return;const world=w??x.worldID;
    const amb=cs.length>1;cs.forEach(ch=>found[ch.id].push({itemId:id,t:x.timestamp,p:x.pricePerUnit,q:x.quantity,hq:!!x.hq,world,...(amb?{amb:true}:{})}))};
  scanMsg(lastT?`買入：上次掃描後的新成交`:'買入：全 DC 近 7 天');
  let fails=await runBatches(chunk(only||ITEMS.map(it=>it.id),100).map(c=>[`${API}/v2/history/${enc(DC)}/${c.join(',')}?entriesToReturn=999&entriesWithin=${within}&fields=${F}`,
    d=>Object.values(itemsOf(d)).forEach(it=>{const e=it.entries||[];
      // 熱門物品在 DC 範圍內 999 筆蓋不到 7 天，之後改逐服掃描
      if(e.length>=999&&e[e.length-1].timestamp>since){hot.add(it.itemID);return}
      e.forEach(x=>take(it.itemID,x))})]));
  if(hot.size){
    scanMsg(`買入：${hot.size} 個熱門物品逐服補掃`);
    const tasks=[];WORLDS.forEach(([w])=>chunk([...hot],100).forEach(c=>tasks.push([`${API}/v2/history/${w}/${c.join(',')}?entriesToReturn=999&entriesWithin=${within}&fields=${F}`,
      d=>Object.values(itemsOf(d)).forEach(it=>(it.entries||[]).forEach(x=>take(it.itemID,x,w)))])));
    fails+=await runBatches(tasks);
  }
  // 新結果併入舊結果（保留 30 天內），有批次失敗就不推進掃描時間，下次會重抓這段
  const keep=Date.now()/1000-30*DAY;
  chars.forEach(c=>{const d=S.detect[c.id]=S.detect[c.id]||{};const m=new Map();
    [...(d.found||[]).filter(x=>x.t>=keep),...found[c.id]].forEach(x=>m.set(tradeKey(x),x));
    d.found=[...m.values()].sort((a,b)=>b.t-a.t);if(!fails||!d.t)d.t=Date.now()});
}
async function scanRetainers(chars,only){
  const rkey=(w,n)=>w+'|'+lc(n);
  const rmap=new Map();chars.forEach(c=>c.rets.forEach(r=>rmap.set(rkey(r.world,r.name),{c,r})));
  const cur={};chars.forEach(c=>cur[c.id]=[]);const failed=new Set();
  // 只查有變動的物品時，其餘物品的上架沿用上次快照（當作沒查，不判定下架）
  if(only){const os=new Set(only);chars.forEach(c=>(S.rsnap[c.id]?.list||[]).forEach(l=>{if(!os.has(l.itemId))failed.add(l.itemId)}))}
  const F='items.itemID,items.worldUploadTimes,items.listings.retainerName,items.listings.worldID,items.listings.pricePerUnit,items.listings.quantity,items.listings.hq';
  scanMsg('雇員上架');
  await runBatches(chunk(only||ITEMS.map(it=>it.id),100).map(c=>[`${API}/v2/${enc(DC)}/${c.join(',')}?listings=999&entries=0&fields=${F}`,
    d=>Object.values(itemsOf(d)).forEach(it=>{(it.listings||[]).forEach(l=>{const m=rmap.get(rkey(l.worldID,l.retainerName));
      if(m)cur[m.c.id].push({itemId:it.itemID,p:l.pricePerUnit,q:l.quantity,hq:!!l.hq,world:l.worldID,ret:m.r.name,seen:it.worldUploadTimes?.[l.worldID]||Date.now()})});
      Object.entries(it.worldUploadTimes||{}).forEach(([w,ts])=>{if(WN[w])noteUpload(+w,ts)})}),
    ()=>c.forEach(id=>failed.add(id))]),'');
  // 上次快照有、這次不見的掛單 → 找同服、同價、同量、同品質、在上次看到之後的成交
  const key=l=>[lc(l.ret),l.world,l.itemId,l.hq?1:0,l.p,l.q].join('|');
  const gone=[];
  chars.forEach(c=>{
    const prev=(S.rsnap[c.id]?.list||[]).filter(l=>rmap.has(rkey(l.world,l.ret)));const now=cur[c.id];
    const cnt=new Map();now.forEach(l=>cnt.set(key(l),(cnt.get(key(l))||0)+1));
    prev.forEach(l=>{if(failed.has(l.itemId)){now.push(l);return}const k=key(l),n=cnt.get(k)||0;if(n>0)cnt.set(k,n-1);else gone.push({c,l})});
  });
  const sold={};chars.forEach(c=>sold[c.id]=[]);
  if(gone.length){
    const ids=[...new Set(gone.map(g=>g.l.itemId))];
    const within=Math.ceil((Date.now()-Math.min(...gone.map(g=>g.l.seen)))/1000)+3600;
    const hist={};
    scanMsg(`比對 ${gone.length} 筆下架的掛單是否賣出`);
    await runBatches(chunk(ids,100).map(c=>[`${API}/v2/history/${enc(DC)}/${c.join(',')}?entriesToReturn=999&entriesWithin=${Math.min(within,30*DAY)}`,
      d=>Object.values(itemsOf(d)).forEach(it=>hist[it.itemID]=it.entries||[])]),'');
    const used=new Set();
    gone.sort((a,b)=>a.l.seen-b.l.seen).forEach(({c,l})=>{
      const e=(hist[l.itemId]||[]).find(x=>!used.has(x)&&x.worldID===l.world&&!!x.hq===l.hq&&x.pricePerUnit===l.p&&x.quantity===l.q&&x.timestamp*1000>=l.seen-300000);
      if(e){used.add(e);sold[c.id].push({side:'sell',itemId:l.itemId,t:e.timestamp,p:l.p,q:l.q,hq:l.hq,world:l.world,ret:l.ret,buyer:e.buyerName})}
    });
  }
  chars.forEach(c=>{const d=S.detect[c.id]=S.detect[c.id]||{};
    const have=new Set((d.sold||[]).map(tradeKey));
    d.sold=[...(d.sold||[]),...sold[c.id].filter(x=>!have.has(tradeKey(x)))].sort((a,b)=>b.t-a.t).slice(0,500);d.ts=Date.now();
    S.rsnap[c.id]={t:Date.now(),list:cur[c.id]};
  });
}
/* 跨服購買確認：角色同一時間只會在一個伺服器，確認一筆「是我」後，
   同角色、同伺服器、彼此間隔 1 小時內連續的待處理買入視為同一趟，一起加入 */
const SESSION_GAP=3600;
function sessionOf(charId,x){
  const have=new Set(S.journal.map(r=>r.src).filter(Boolean));
  const pool=(S.detect[charId]?.found||[]).filter(f=>f.world===x.world&&!have.has(tradeKey(f))&&!S.ignored.has(tradeKey(f)));
  const out=[x];const inSet=new Set([tradeKey(x)]);let grew=true;
  while(grew){grew=false;for(const f of pool){const k=tradeKey(f);if(inSet.has(k))continue;
    if(out.some(o=>Math.abs(o.t-f.t)<=SESSION_GAP)){out.push(f);inSet.add(k);grew=true}}}
  return out;
}
function importTrade(charId,x){
  const ch=charOf(charId);const sell=x.side==='sell';
  S.journal.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),charId,itemId:x.itemId,side:sell?'sell':'buy',price:x.p,qty:x.q,hq:x.hq,
    world:x.world||ch?.world,tax:S.tax[x.world]??5,time:x.t*1000,note:'自動偵測',src:tradeKey(x),ret:sell?x.ret:undefined});
}
function detectedRows(){
  const chars=S.jview==='all'?S.chars:S.chars.filter(c=>c.id===S.jview);
  const have=new Set(S.journal.map(r=>r.src).filter(Boolean));
  const rows=[];const byK=new Map();
  chars.forEach(c=>{const d=S.detect[c.id]||{};[...(d.found||[]),...(d.sold||[])].forEach(x=>{const k=tradeKey(x);
    if(x.amb&&byK.has(k)){byK.get(k).cands.push(c);return}
    const row={c,x,k,cands:[c],added:have.has(k),ign:S.ignored.has(k)};if(x.amb)byK.set(k,row);rows.push(row)})});
  // 同名待確認的候選＝所有登記了這個名稱的角色（不只目前檢視中的）
  rows.forEach(r=>{if(r.x.amb)r.cands=S.chars.filter(c=>lc(c.name)===lc(r.c.name)&&(S.detect[c.id]?.found||[]).some(f=>tradeKey(f)===r.k))});
  return {chars,rows:rows.sort((a,b)=>b.x.t-a.x.t)};
}

function charBar(){
  const chip=(v,label,sub)=>`<button class="btn ${S.jview===v?'on':''}" data-jview="${v}">${label}${sub?` <span class="muted">${sub}</span>`:''}</button>`;
  const hasNone=S.journal.some(r=>!charOf(r.charId));
  return `<div class="tabs" style="flex-wrap:wrap;align-items:center">
    ${chip('all','全部角色（合併）')}
    ${S.chars.map(c=>chip(c.id,esc(charLabel(c)),c.rets?.length?`${c.rets.length} 雇員`:'')).join('')}
    ${hasNone?chip('none','未指定角色'):''}
    <button class="btn" data-charadd="1">＋ 新增角色</button>
    ${charOf(S.jview)?`<button class="btn sm" data-charedit="${S.jview}">編輯角色／雇員</button><button class="btn sm" data-chardel="${S.jview}">刪除角色</button>`:''}
  </div>`;
}
/* 雇員管理：直接在交易紀錄本新增／移除雇員（賣出偵測靠雇員名稱＋伺服器） */
function retPanel(){
  if(!S.chars.length||S.jview==='none')return '';
  const chars=S.jview==='all'?S.chars:S.chars.filter(c=>c.id===S.jview);
  const defC=chars[0];
  return `<div class="panel" style="margin-bottom:14px"><h2>雇員<span class="muted">賣出靠雇員的上架偵測・名稱要和遊戲中完全相同</span></h2>
    <table class="compact">${chars.map(c=>`<tr><td class="l" style="width:1%;white-space:nowrap;padding-right:14px">${esc(charLabel(c))}</td><td class="l">
      ${c.rets.length?c.rets.map((r,i)=>`<span class="tag" style="font-size:12px;padding:2px 4px 2px 8px;margin:2px 6px 2px 0;color:var(--text)">${esc(r.name)}<span class="muted">@${WN[r.world]||''}${(n=>S.rsnap[c.id]?.t?`・上架 ${n}`:'')((S.rsnap[c.id]?.list||[]).filter(l=>l.world===r.world&&lc(l.ret)===lc(r.name)).length)}</span>
        <button class="btn sm" data-retdel="${c.id}|${i}" title="移除雇員" style="padding:0 5px;margin-left:4px;border:0">✕</button></span>`).join(''):'<span class="muted">尚未登記雇員</span>'}
      ${c.rets.length?`<div class="muted" style="font-size:12px;margin-top:2px">${retStatus(c)}</div>`:''}</td></tr>`).join('')}</table>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px">
      ${chars.length>1?`<select id="rchar" class="scope" style="padding:4px 8px">${chars.map(c=>`<option value="${c.id}">${esc(charLabel(c))}</option>`).join('')}</select>`:`<input type="hidden" id="rchar" value="${defC.id}">`}
      <input id="rname" placeholder="雇員名稱" style="background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:5px 9px;width:180px">
      <select id="rworld" class="scope" style="padding:4px 8px">${worldOpts(defC.world)}</select>
      <button class="btn sm primary" data-retadd="1">＋ 新增雇員</button>
      <span class="muted" style="font-size:12px">伺服器選雇員上架的那個伺服器</span>
    </div></div>`;
}
function retStatus(c){
  const snap=S.rsnap[c.id];const sold=(S.detect[c.id]?.sold||[]).length;
  if(!snap?.t)return '<span class="up">還沒有上架快照：按「掃描」建立，之後再掃描才偵測得到賣出</span>';
  const zero=c.rets.filter(r=>!snap.list.some(l=>l.world===r.world&&lc(l.ret)===lc(r.name)));
  return `上架快照 ${ago(snap.t)}・已偵測賣出 ${sold} 筆`+(zero.length?`・<span class="up">${zero.map(r=>esc(r.name)).join('、')} 沒找到上架：雇員名稱或伺服器可能有誤，或目前沒有上架</span>`:'');
}
function addRetainer(){
  const c=charOf($('#rchar').value);const name=$('#rname').value.trim();const world=+$('#rworld').value;
  if(!c)return;if(!name){$('#rname').focus();return toast('請輸入雇員名稱')}
  const owner=S.chars.find(x=>x.rets.some(r=>r.world===world&&lc(r.name)===lc(name)));
  if(owner)return toast(owner===c?'這個雇員已經登記過了':`這個雇員已登記在「${charLabel(owner)}」底下`);
  c.rets.push({name,world});if(S.rsnap[c.id])S.rsnap[c.id].t=0;lsSet('aex_rsnap',S.rsnap);saveChars();toast(`已新增雇員 ${name}@${WN[world]}，按「掃描」開始記錄上架`);route();
}
function listingPanel(chars){
  const ls=[];chars.forEach(c=>(S.rsnap[c.id]?.list||[]).forEach(l=>ls.push({c,l})));
  if(!chars.some(c=>c.rets?.length))return '';
  const multi=chars.length>1;
  return `<details style="margin-top:10px"><summary class="muted" style="cursor:pointer">雇員上架中（${ls.length} 筆・上次掃描時的快照）</summary>
    ${ls.length?`<div style="max-height:300px;overflow:auto;margin-top:6px"><table class="compact"><tr>${multi?'<th class="l">角色</th>':''}<th class="l">雇員</th><th class="l">伺服器</th><th class="l">物品</th><th>單價</th><th>數量</th><th>小計</th></tr>
    ${ls.sort((a,b)=>a.l.ret.localeCompare(b.l.ret)||b.l.p*b.l.q-a.l.p*a.l.q).map(({c,l})=>`<tr>${multi?`<td class="l">${esc(charLabel(c))}</td>`:''}<td class="l">${esc(l.ret)}</td><td class="l">${WN[l.world]||''}</td>
      <td class="l"><a href="#/item/${l.itemId}">${esc(ITEM[l.itemId]?.n||l.itemId)}</a>${l.hq?'<span class="hq">HQ</span>':''}</td><td class="num">${fmt(l.p)}</td><td class="num">${fmt(l.q)}</td><td class="num">${fmt(l.p*l.q)}</td></tr>`).join('')}</table></div>`
    :'<div class="empty">目前沒有找到雇員的上架。請確認雇員名稱與伺服器正確，且該物品的市場資料有人上傳過。</div>'}</details>`;
}
function detectPanel(){
  if(!S.chars.length)return `<div class="panel" style="margin-bottom:14px"><h2>自動偵測交易</h2><div class="empty">先按「＋ 新增角色」輸入角色名稱、伺服器和雇員，就能掃描這個角色最近 7 天在市場板買過的東西，以及雇員賣出的東西。</div></div>`;
  if(S.jview==='none')return '';
  const {chars,rows}=detectedRows();
  const last=Math.min(...chars.map(c=>S.detect[c.id]?.t||0));
  const pending=rows.filter(r=>!r.added&&!r.ign&&!r.x.amb);const ambN=rows.filter(r=>!r.added&&!r.ign&&r.x.amb).length;
  const showAll=S.showDetAll;const list=showAll?rows:pending;
  const noRet=chars.filter(c=>!c.rets?.length);
  return `<div class="panel" style="margin-bottom:14px"><h2>自動偵測交易<span class="muted">${chars.length>1?chars.length+' 個角色・':''}買入近 7 天・${last?'上次掃描 '+ago(last):'尚未掃描'}${(ws=>ws.length?'・玩家上傳：'+ws.map(w=>`${WN[w]} ${ago(S.upload[w])}`).join('、'):'')([...new Set(chars.flatMap(c=>[c.world,...(c.rets||[]).map(r=>r.world)]))].filter(w=>S.upload[w]))}</span>
    <span style="margin-left:auto;display:flex;gap:6px">
      ${rows.length?`<button class="btn sm" data-detall="1">${showAll?'只看未處理':'顯示全部（含已加入／略過）'}</button>`:''}
      ${pending.length?`<button class="btn sm" data-detimport="all" ${ambN?`title="${ambN} 筆同名待確認不會自動加入"`:''}>全部加入（${pending.length}）</button>`:''}
      ${(w=>w?`<button class="btn sm" data-scan="1" title="同一角色 10 分鐘內不重掃，減少對 Universalis 的存取">${Math.ceil(w/60000)} 分鐘後可再掃</button>`:'<button class="btn sm primary" data-scan="1">掃描</button>')(Math.min(...chars.map(scanWait)))}</span></h2>
    ${list.length?`<div style="max-height:360px;overflow:auto"><table class="compact"><tr><th class="l">時間</th>${chars.length>1?'<th class="l">角色</th>':''}<th class="l">買賣</th><th class="l">物品</th><th class="l">伺服器</th><th class="l hm">雇員</th><th class="hm">單價</th><th>數量</th><th>金額</th><th></th></tr>
    ${list.map(r=>{const sell=r.x.side==='sell';const amt=r.x.p*r.x.q*(sell?1-(S.tax[r.x.world]??5)/100:1+(S.tax[r.x.world]??5)/100);
      return `<tr class="${vsRow(vsNow(r.x.itemId,r.x.hq,r.x.p))}"><td class="l num muted">${tstr(r.x.t)}</td>${chars.length>1?`<td class="l">${esc(charLabel(r.c))}</td>`:''}<td class="l ${sell?'down':'up'}">${sell?'賣出':'買入'}</td>
      <td class="l"><a href="#/item/${r.x.itemId}">${esc(ITEM[r.x.itemId]?.n||r.x.itemId)}</a>${r.x.hq?'<span class="hq">HQ</span>':''}</td>
      <td class="l">${WN[r.x.world]||''}${!sell&&r.x.world!==r.c.world?' <span class="tag">跨服</span>':''}${r.x.amb?' <span class="tag" title="成交紀錄只有買家名稱、沒有伺服器，你登記的同名角色都可能是買家">同名待確認</span>':''}</td><td class="l hm">${sell?esc(r.x.ret):'<span class="muted">—</span>'}</td>
      ${(d=>`<td class="num hm" title="${vsTitle(r.x.itemId,r.x.hq,d)}">${fmt(r.x.p)}${vsTag(d)}</td><td class="num">${fmt(r.x.q)}</td><td class="num">${fmt(amt)}</td>`)(vsNow(r.x.itemId,r.x.hq,r.x.p))}
      <td style="white-space:nowrap">${r.added?'<span class="tag green">已加入</span>':r.ign?`<span class="tag">已略過</span> <button class="btn sm" data-detunign="${r.k}">復原</button>`:
        (r.x.amb?r.cands.map(c=>{const n=sessionOf(c.id,r.x).length;return `<button class="btn sm" data-detsess="${c.id}::${r.k}" title="同伺服器、前後 1 小時內連續的買入一起歸給這個角色">是 ${esc(charLabel(c))}${n>1?`（同時段 ${n} 筆）`:''}</button> `}).join(''):!sell&&r.x.world!==r.c.world?(n=>`<button class="btn sm" data-detsess="${r.c.id}::${r.k}" title="同伺服器、前後 1 小時內連續的買入一起加入">是我${n>1?`（同時段 ${n} 筆）`:''}</button> `)(sessionOf(r.c.id,r.x).length):`<button class="btn sm" data-detimport="${r.c.id}::${r.k}">加入紀錄</button> `)+`<button class="btn sm" data-detign="${r.k}">略過</button>`}</td></tr>`}).join('')}</table></div>`
      :`<div class="empty">${last?'沒有待處理的交易紀錄。':'按「掃描」開始。第一次約需 30–60 秒。'}</div>`}
    ${listingPanel(chars)}
    <p class="note"><b>買入</b>：比對 Universalis 成交紀錄的買家名稱，掃描陸行鳥 DC 全部伺服器，所以跨服購買也抓得到（金額含稅）。成交紀錄只有買家名稱、沒有買家所屬伺服器，所以同名的其他伺服器玩家也會被比對到，標「跨服」的請自行確認：按「是我」會把同伺服器、前後 1 小時內連續的買入當成同一趟一起加入，不是你買的就按「略過」；如果你登記了同名的角色（例如 伊萊諾斯@巴哈姆特 和 伊萊諾斯@利維坦），這類交易會標「同名待確認」，由你選擇歸給哪個角色。
    <b>賣出</b>：成交紀錄不含賣家，改為記錄雇員的上架；下次掃描時，消失的掛單若在同伺服器找得到同價、同量的成交，就判定為賣出（金額為成交價，不含稅）。所以<b>要定期掃描</b>，第一次掃描只會建立上架快照。
    ${noRet.length?`<br><span class="up">${noRet.map(c=>esc(charLabel(c))).join('、')} 還沒有登記雇員，到「編輯角色／雇員」登記才能偵測賣出。</span>`:''}
    只有被其他玩家上傳過的市場資料才查得到，可能有遺漏。</p></div>`;
}
async function renderJournal(tok){
  if(S.jview!=='all'&&S.jview!=='none'&&!charOf(S.jview))S.jview='all';
  const recs=jRecords();
  const ids=[...new Set([...recs.map(r=>r.itemId),...detectedRows().rows.filter(r=>!r.added&&!r.ign).slice(0,100).map(r=>r.x.itemId)])].filter(id=>ITEM[id]);
  if(ids.length){await loadHist(ids);if(tok!==TOKEN)return}
  const b=calcBook(recs);let mv=0,unr=0;
  const hold=b.pos.filter(p=>p.qty>0).map(p=>{const st=statsOf(S.hist[p.itemId]?.e||[],p.hq,null);const price=st.price;const v=price!=null?price*p.qty:null;
    if(v!=null){mv+=v;unr+=v-p.cost}return {...p,price,v,u:v!=null?v-p.cost:null}});
  const net=b.totalSell-b.totalBuy;
  const cost=hold.reduce((s,p)=>s+p.cost,0);
  const merged=S.jview==='all';
  const viewName=merged?'全部角色（合併）':S.jview==='none'?'未指定角色':esc(charName(S.jview));
  $('#view').innerHTML=`<h1>交易紀錄本 <span class="muted" style="font-size:13px;font-weight:400">${viewName}・只記錄遊戲中實際完成的交易・現價以陸行鳥 DC 股價估算</span></h1>
  ${charBar()}
  ${retPanel()}
  ${detectPanel()}
  <div class="tabs" style="flex-wrap:wrap"><button class="btn primary" data-log="">＋ 手動新增</button><button class="btn" data-batch="1" title="一次輸入多筆，例如對照雇員的出售歷史補登">批次登記</button><button class="btn" id="jexp">匯出 JSON</button><label class="btn">匯入 JSON<input type="file" id="jimp" accept=".json" hidden></label></div>
  <div class="grid" style="grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:14px">
    <div class="card"><div class="t">累計買入（支出，含稅）</div><div class="v num up">${fmt(b.totalBuy)}</div></div>
    <div class="card"><div class="t">已實現收益（賣出實收）</div><div class="v num down">${fmt(b.totalSell)}</div></div>
    <div class="card"><div class="t">淨收支（賣出－買入）</div><div class="v">${signed(net)}</div></div>
    <div class="card"><div class="t">持倉市值</div><div class="v num">${fmt(mv)}</div><div class="note">持倉成本 ${fmt(cost)}</div></div>
    <div class="card main"><div class="t">總計（淨收支＋持倉市值）</div><div class="v">${signed(net+mv)}</div><div class="note">把手上的東西照現價算進去</div></div>
  </div>
  ${holdPanel(hold,merged,mv,unr)}
  <div class="panel"><h2>交易紀錄<span class="muted">${recs.length} 筆</span>
    <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-weight:400">
      <span class="seg sm">${[[7,'7 天'],[30,'30 天'],[90,'90 天'],[0,'全部']].map(([v,n])=>`<button class="${S.jf.days===v?'on':''}" data-jfdays="${v}">${n}</button>`).join('')}</span>
      <span class="seg sm">${[['all','全部'],['buy','買入'],['sell','賣出'],['adj','調整']].map(([v,n])=>`<button class="${S.jf.side===v?'on':''}" data-jfside="${v}">${n}</button>`).join('')}</span>
      <input id="jfq" placeholder="搜尋物品" value="${esc(S.jf.q)}" autocomplete="off" style="background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:4px 9px;width:140px">
    </span></h2>
  <div id="jtable"></div>
  <p class="note">買入金額＝單價 × 數量 ×（1＋稅率），遊戲中市場稅由買方支付；買入伺服器可以和角色所在伺服器不同（跨服購買）。賣出金額＝單價 × 數量 ×（1－稅率），和遊戲「出售記錄」的實收金額一致（舊紀錄稅率為 0 則不扣）；伺服器欄顯示上架的雇員。損益採平均成本法${merged?'，合併檢視時同一物品跨角色合併計算':''}；已實現收益就是賣出的實收金額（自製成品也算）；賣得好不好看整列底色：比目前股價貴是紅底、便宜是綠底。</p></div>`;
  if($('#holdsort'))$('#holdsort').onchange=ev=>setHoldOpt({sort:ev.target.value});
  drawJT();let jfT;$('#jfq').oninput=ev=>{clearTimeout(jfT);jfT=setTimeout(()=>setJF({q:ev.target.value}),200)};
  if($('#rname')){$('#rname').onkeydown=ev=>{if(ev.key==='Enter'&&!ev.isComposing)addRetainer()};
    const rc=$('#rchar');if(rc.tagName==='SELECT')rc.onchange=()=>{const c=charOf(rc.value);if(c)$('#rworld').value=c.world}}
  $('#jexp').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({version:3,chars:S.chars,journal:S.journal},null,1)],{type:'application/json'}));a.download='aex-journal.json';a.click()};
  $('#jimp').onchange=async ev=>{const f=ev.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text());const j=Array.isArray(d)?d:d.journal;if(!Array.isArray(j))throw 0;
    if(!confirm(`匯入會取代目前的 ${S.journal.length} 筆紀錄${d.chars?'與角色清單':''}，確定嗎？`))return;S.journal=j;saveJournal();if(Array.isArray(d.chars)){S.chars=d.chars;S.chars.forEach(c=>{if(!Array.isArray(c.rets))c.rets=[]});saveChars()}toast(`已匯入 ${j.length} 筆`);route()}catch{toast('檔案格式不正確')}};
}

/* 復原：會改動紀錄的動作先存一份快照（最多 10 步，存在本機） */
S.undo=lsGet('aex_undo',[]);
function pushUndo(label){S.undo.push({label,journal:JSON.parse(JSON.stringify(S.journal))});if(S.undo.length>10)S.undo.shift();try{localStorage.setItem('aex_undo',JSON.stringify(S.undo))}catch{S.undo=S.undo.slice(-2);lsSet('aex_undo',S.undo)}}
function undo(){const u=S.undo.pop();if(!u)return;S.journal=u.journal;saveJournal();lsSet('aex_undo',S.undo);toast('已復原：'+u.label);route()}
/* 持倉調整：把目前檢視中某物品的數量改成 target。合併檢視時，減少量從持有最多的角色依序扣 */
function holdingByChar(itemId,hq){
  const recs=jRecords();const ids=[...new Set(recs.map(r=>r.charId??null))];
  return ids.map(cid=>{const p=calcBook(recs.filter(r=>(r.charId??null)===cid)).pos.find(x=>x.itemId===itemId&&x.hq===hq);return {cid,qty:p?.qty||0}}).filter(x=>x.qty>0);
}
function adjustHolding(itemId,hq,target,now=Date.now(),use=false){
  const by=holdingByChar(itemId,hq);const cur=by.reduce((s,x)=>s+x.qty,0);let d=target-cur;if(!d)return 0;
  const mk=(cid,q)=>S.journal.push({id:now.toString(36)+Math.random().toString(36).slice(2,6),charId:cid,itemId,side:'adj',price:0,qty:q,hq,world:charOf(cid)?.world||null,tax:0,time:now,
    ...(q<0&&use?{use:true}:{}),note:q<0?'手動減少持倉':'手動增加持倉'});
  if(d<0){for(const x of by.sort((a,b)=>b.qty-a.qty)){if(!d)break;const take=Math.min(x.qty,-d);mk(x.cid,-take);d+=take}}
  else mk(charOf(S.jview)?S.jview:(by.sort((a,b)=>b.qty-a.qty)[0]?.cid??S.chars[0]?.id??null),d);
  return 1;
}
document.addEventListener('click',async ev=>{
  const t=ev.target;let el;
  if(t.closest('[data-undo]')){undo();return}
  if(t.closest('[data-holdall]')){setHoldOpt({all:!S.holdOpt.all});return}
  if(t.closest('[data-holdfold]')&&!t.closest('[data-nofold]')){setHoldOpt({fold:!S.holdOpt.fold});return}
  if(el=t.closest('[data-holdset]')){const [id,h]=el.dataset.holdset.split('|');const itemId=+id,hq=h==='1';
    const cur=holdingByChar(itemId,hq).reduce((s,x)=>s+x.qty,0);const name=(ITEM[itemId]?.n||itemId)+(hq?' HQ':'');
    const v=prompt(`「${name}」目前持有 ${fmt(cur)}，要改成多少？`,cur);if(v==null)return;const n=Math.round(+v);
    if(!(n>=0))return toast('請輸入 0 以上的數字');if(n===cur)return;
    pushUndo(`${name} 數量 ${fmt(cur)} → ${fmt(n)}`);adjustHolding(itemId,hq,n);saveJournal();toast('已調整持倉');route();return}
  if(el=t.closest('[data-holddel]')){const [id,h]=el.dataset.holddel.split('|');const itemId=+id,hq=h==='1';const name=(ITEM[itemId]?.n||itemId)+(hq?' HQ':'');
    pushUndo(`刪除持倉 ${name}`);adjustHolding(itemId,hq,0);saveJournal();toast(`已刪除持倉 ${name}，可按「復原」`);route();return}
  if(t.closest('[data-holdclear]')){const pos=calcBook(jRecords()).pos.filter(p=>p.qty>0);
    if(!confirm(`把目前檢視中的 ${pos.length} 項持倉全部歸零？\n交易紀錄會保留，之後可以按「復原」。`))return;
    pushUndo(`全部刪除持倉（${pos.length} 項）`);const now=Date.now();pos.forEach(p=>adjustHolding(p.itemId,p.hq,0,now));saveJournal();toast('已清空持倉，可按「復原」');route();return}
});
/* 交易紀錄表：期間／買賣／物品篩選，按日分組，一次顯示 JT_PAGE 筆 */
S.jf=Object.assign({days:30,side:'all',q:''},lsGet('aex_jfilter',{}));S.jlimit=50;
const JT_PAGE=50;const WD='日一二三四五六';
/* 成交價對比目前股價：高於＝紅、低於＝綠、±1% 內＝灰（手機版單價欄隱藏時改為金額上色） */
function vsNow(itemId,hq,p){const h=S.hist[itemId];if(!h||!p)return null;const st=statsOf(h.e,!!hq,null);return st.price?(p/st.price-1)*100:null}
const vsCls=d=>d==null?'':d>1?'up':d<-1?'down':'flat';
const vsRow=d=>d==null||Math.abs(d)<=1?'':d>0?'vsr-up':'vsr-down';
const vsTag=d=>d==null?'':`<span class="vs">${Math.abs(d)<=1?'≈':(d>0?'▲':'▼')+fmt(Math.min(999,Math.abs(d)),0)+'%'}</span>`;
const vsTitle=(itemId,hq,d)=>{if(d==null)return '沒有目前股價可比較';const st=statsOf(S.hist[itemId].e,!!hq,null);return `目前股價 ${fmt(st.price)}，這筆${Math.abs(d)<=1?'和股價差不多':(d>0?'高於':'低於')+'股價 '+fmt(Math.abs(d),1)+'%'}`};
const recAmt=r=>r.side==='adj'?0:r.side==='buy'?r.price*r.qty*(1+(r.tax||0)/100):r.price*r.qty*(1-(r.tax||0)/100);
function journalTable(){
  const merged=S.jview==='all';const cols=merged?10:9;
  const all=jRecords();const q=S.jf.q.trim();
  const from=S.jf.days?Date.now()-S.jf.days*DAY*1000:0;
  const list=all.filter(r=>r.time>=from&&(S.jf.side==='all'||r.side===S.jf.side)&&(!q||(ITEM[r.itemId]?.n||'').includes(q))).sort((a,b)=>b.time-a.time);
  const sum=side=>list.filter(r=>r.side===side).reduce((s,r)=>s+recAmt(r),0);const nb=list.filter(r=>r.side==='buy').length,ns=list.filter(r=>r.side==='sell').length;
  if(!list.length)return `<div class="empty">${all.length?'這個期間沒有符合條件的紀錄。':'還沒有紀錄。可以掃描自動偵測，或按「手動新增」。'}</div>`;
  const shown=list.slice(0,S.jlimit);
  const dayKey=t=>{const d=new Date(t);return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate()};
  const daySum={};list.forEach(r=>{const k=dayKey(r.time);const o=daySum[k]=daySum[k]||{b:0,s:0,n:0};o.n++;if(r.side==='buy')o.b+=recAmt(r);else if(r.side==='sell')o.s+=recAmt(r)});
  let lastDay='';
  const rows=shown.map(r=>{const k=dayKey(r.time);let head='';
    if(k!==lastDay){lastDay=k;const d=new Date(r.time);const o=daySum[k];
      head=`<tr><td colspan=${cols} class="l" style="background:var(--panel2);font-weight:600;padding-top:7px">${d.getMonth()+1}/${d.getDate()}（${WD[d.getDay()]}）
        <span class="muted" style="font-weight:400;margin-left:10px">${o.n} 筆${o.b?`・買入 <span class="up">${fmt(o.b)}</span>`:''}${o.s?`・賣出 <span class="down">${fmt(o.s)}</span>`:''}</span></td></tr>`}
    const tm=new Date(r.time);const hh=String(tm.getHours()).padStart(2,'0')+':'+String(tm.getMinutes()).padStart(2,'0');
    return head+`<tr class="${r.side==='adj'?'':vsRow(vsNow(r.itemId,r.hq,r.price))}"><td class="num l muted">${hh}</td>${merged?`<td class="l hm">${esc(charName(r.charId))}</td>`:''}<td class="l ${r.side==='buy'?'up':r.side==='sell'?'down':'muted'}">${r.side==='buy'?'買入':r.side==='sell'?'賣出':'調整'}</td>
      <td class="l"><a href="#/item/${r.itemId}">${esc(ITEM[r.itemId]?.n||r.itemId)}</a>${r.hq?'<span class="hq">HQ</span>':''}</td><td class="l hm">${WN[r.world]||'—'}${r.side==='sell'&&r.ret?`<span class="muted">・${esc(r.ret)}</span>`:''}</td>
      ${r.side==='adj'?`<td class="num muted hm">—</td><td class="num">${r.qty>0?'+':''}${fmt(r.qty)}</td><td class="num muted">—`:(d=>`<td class="num hm" title="${vsTitle(r.itemId,r.hq,d)}">${fmt(r.price)}${vsTag(d)}</td><td class="num">${fmt(r.qty)}</td><td class="num" title="${vsTitle(r.itemId,r.hq,d)}">${fmt(recAmt(r))}`)(vsNow(r.itemId,r.hq,r.price))}${r.side!=='adj'&&r.tax?`<span class="muted" style="font-size:11px">（稅 ${r.tax}%）</span>`:''}</td><td class="l muted hm">${esc(r.note)}</td>
      <td style="white-space:nowrap">${r.side==='adj'?'':`<button class="btn sm" data-edit="${r.id}">編輯</button> `}<button class="btn sm" data-del="${r.id}">刪除</button></td></tr>`}).join('');
  return `<div class="note" style="margin:0 0 4px">整列底色＝成交單價對比目前股價：<span class="vs-key up">紅底＝高於股價</span> <span class="vs-key down">綠底＝低於股價</span> ±1% 內不上色（買入綠底、賣出紅底代表比現在划算）</div><div class="note" style="margin:0 0 8px">${S.jf.days?`近 ${S.jf.days} 天`:'全部期間'}：${list.length} 筆${nb?`・買入 <span class="up">${fmt(sum('buy'))}</span>（${nb} 筆）`:''}${ns?`・賣出 <span class="down">${fmt(sum('sell'))}</span>（${ns} 筆）`:''}${nb&&ns?`・淨收支 ${signed(sum('sell')-sum('buy'))}`:''}</div>
    <table class="t-jr"><tr><th class="l">時間</th>${merged?'<th class="l hm">角色</th>':''}<th class="l">買賣</th><th class="l">物品</th><th class="l hm">伺服器</th><th class="hm">單價</th><th>數量</th><th>金額</th><th class="l hm">備註</th><th></th></tr>${rows}</table>
    ${list.length>shown.length?`<div style="text-align:center;margin-top:10px"><button class="btn" data-jfmore="1">再顯示 ${Math.min(JT_PAGE,list.length-shown.length)} 筆（還有 ${list.length-shown.length} 筆）</button></div>`:''}`;
}
function drawJT(){const el=$('#jtable');if(el)el.innerHTML=journalTable();
  $('[data-jfdays]')&&document.querySelectorAll('[data-jfdays]').forEach(b=>b.classList.toggle('on',+b.dataset.jfdays===S.jf.days));
  document.querySelectorAll('[data-jfside]').forEach(b=>b.classList.toggle('on',b.dataset.jfside===S.jf.side))}
function setJF(o){Object.assign(S.jf,o);S.jlimit=JT_PAGE;lsSet('aex_jfilter',S.jf);drawJT()}
/* 持倉：預設只列前 10 項，可排序、展開全部、整塊摺疊（設定會記住） */
S.holdOpt=Object.assign({sort:'v',all:false,fold:false},lsGet('aex_holdopt',{}));
const HOLD_N=10;
const HOLD_SORTS=[['v','市值'],['u','未實現損益'],['r','報酬率'],['q','數量'],['n','名稱']];
function holdPanel(hold,merged,mv,unr){
  const o=S.holdOpt;const key={v:p=>p.v??-Infinity,u:p=>p.u??-Infinity,r:p=>p.u!=null&&p.cost?p.u/p.cost:-Infinity,q:p=>p.qty}[o.sort];
  const list=[...hold].sort(o.sort==='n'?(a,b)=>(ITEM[a.itemId]?.n||'').localeCompare(ITEM[b.itemId]?.n||'','zh-Hant'):(a,b)=>key(b)-key(a));
  const shown=o.all?list:list.slice(0,HOLD_N);
  const head=`<h2 style="cursor:pointer" data-holdfold="1" title="點標題摺疊／展開"><span style="display:inline-block;width:14px;color:var(--muted)">${o.fold?'▸':'▾'}</span>持倉<span class="muted">${hold.length} 項・市值 ${fmt(mv)}・未實現 </span>${signed(unr)}${merged&&S.chars.length>1?'<span class="muted">・合併所有角色</span>':''}
    <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-weight:400" data-nofold="1">
      ${!o.fold&&hold.length>1?`<select class="scope" id="holdsort" style="padding:3px 8px;font-size:12px" title="排序">${HOLD_SORTS.map(([k,n])=>`<option value="${k}" ${o.sort===k?'selected':''}>依${n}${k==='n'?'':'（高→低）'}</option>`).join('')}</select>`:''}
      ${S.undo.length?`<button class="btn sm" data-undo="1" title="可連續復原最近 ${S.undo.length} 個動作">↶ 復原：${esc(S.undo[S.undo.length-1].label)}</button>`:''}
      ${!o.fold&&hold.length?'<button class="btn sm" data-holdclear="1">全部刪除持倉</button>':''}</span></h2>`;
  if(o.fold)return `<div class="panel" style="margin-bottom:14px;padding-bottom:4px">${head}</div>`;
  return `<div class="panel" style="margin-bottom:14px">${head}<table class="t-hold"><tr><th>名稱</th><th>數量</th><th>平均成本</th><th>現價</th><th>市值</th><th>未實現損益</th><th>報酬率</th><th>已賣出</th><th></th></tr>
  ${shown.map(p=>`<tr><td><div class="name">${ico(ITEM[p.itemId])}<a href="#/item/${p.itemId}">${esc(ITEM[p.itemId]?.n)}</a>${p.hq?'<span class="hq">HQ</span>':''}</div></td><td class="num">${fmt(p.qty)}</td><td class="num">${fmt(p.cost/p.qty,1)}</td><td class="num">${fmt(p.price)}</td><td class="num">${fmt(p.v)}</td><td>${signed(p.u)}</td><td>${pct(p.u!=null&&p.cost?p.u/p.cost*100:null)}</td><td class="num">${p.sold?fmt(p.sold):'—'}</td><td style="white-space:nowrap"><button class="btn sm" data-holdset="${p.itemId}|${p.hq?1:0}">改數量</button> <button class="btn sm" data-holddel="${p.itemId}|${p.hq?1:0}">刪除</button></td></tr>`).join('')||'<tr><td colspan=9 class="empty">目前沒有持倉</td></tr>'}</table>
  ${list.length>HOLD_N?`<div style="text-align:center;margin-top:10px"><button class="btn sm" data-holdall="1">${o.all?'收合，只看前 '+HOLD_N+' 項':`顯示全部 ${list.length} 項（還有 ${list.length-HOLD_N} 項）`}</button></div>`:''}
  <p class="note">自己用掉、拿去製作或記錯時，按「改數量」或「刪除」調整持倉，不影響收益。未實現損益＝市值－平均成本。調整紀錄可以在下方交易紀錄中刪除。</p></div>`;
}
function setHoldOpt(o){Object.assign(S.holdOpt,o);lsSet('aex_holdopt',S.holdOpt);route()}
const worldOpts=sel=>WORLDS.map(([id,n])=>`<option value="${id}" ${sel==id?'selected':''}>${n}</option>`).join('');
function openChar(editId){
  const c=editId?charOf(editId):null;
  const rets=(c?.rets||[]).map(r=>({...r}));
  $('#mbox').innerHTML=`<h2>${c?'編輯角色／雇員':'新增角色'}</h2>
  <div class="form">
    <div>角色名稱</div><div><input id="cname" value="${esc(c?.name||'')}" placeholder="和遊戲中完全相同"></div>
    <div>伺服器</div><div><select id="cworld">${worldOpts(c?.world||S.scope||4031)}</select></div>
    <div style="align-self:start;padding-top:6px">雇員</div><div><div id="crets"></div><button class="btn sm" id="cretadd">＋ 新增雇員</button></div>
  </div>
  <p class="note">角色名稱用來比對市場成交紀錄裡的買家（會掃描全 DC，跨服購買也算）。雇員名稱用來比對市場上架，以偵測賣出；雇員可以在不同伺服器上架，請選擇它上架的伺服器。名稱都要和遊戲中完全相同。</p>
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" id="ccancel">取消</button><button class="btn primary" id="csave">${c?'儲存':'新增並掃描'}</button></div>`;
  const sync=()=>$('#crets').querySelectorAll('[data-ri]').forEach(row=>{const r=rets[+row.dataset.ri];r.name=row.querySelector('input').value;r.world=+row.querySelector('select').value});
  const draw=()=>{$('#crets').innerHTML=rets.map((r,i)=>`<div class="row2" data-ri="${i}" style="display:flex;gap:6px;margin-bottom:6px"><input value="${esc(r.name)}" placeholder="雇員名稱" style="flex:1"><select style="width:110px">${worldOpts(r.world)}</select><button class="btn sm" data-rx="${i}" title="移除">✕</button></div>`).join('')||'<div class="muted" style="margin-bottom:6px">尚未登記雇員</div>'};
  draw();
  $('#cretadd').onclick=()=>{sync();rets.push({name:'',world:+$('#cworld').value});draw();$('#crets').querySelector(`[data-ri="${rets.length-1}"] input`).focus()};
  $('#crets').onclick=ev=>{const x=ev.target.closest('[data-rx]');if(!x)return;sync();rets.splice(+x.dataset.rx,1);draw()};
  $('#modal').style.display='grid';$('#cname').focus();
  $('#ccancel').onclick=closeModal;
  $('#csave').onclick=async()=>{
    sync();
    const name=$('#cname').value.trim(),world=+$('#cworld').value;if(!name)return toast('請輸入角色名稱');
    if(S.chars.some(x=>x.id!==c?.id&&x.name===name&&x.world===world))return toast('這個角色已經存在');
    const seen=new Set();const rs=[];
    for(const r of rets){const n=r.name.trim();if(!n)continue;const k=r.world+'|'+lc(n);if(seen.has(k))continue;seen.add(k);rs.push({name:n,world:r.world})}
    const owner=S.chars.find(x=>x.id!==c?.id&&x.rets?.some(a=>rs.some(b=>a.world===b.world&&lc(a.name)===lc(b.name))));
    if(owner)return toast(`有雇員已登記在角色「${charLabel(owner)}」底下`);
    let ch,needScan;
    if(c){const changed=c.name!==name||c.world!==world;const oldR=new Set(c.rets.map(r=>r.world+'|'+lc(r.name)));
      needScan=changed||rs.some(r=>!oldR.has(r.world+'|'+lc(r.name)));
      c.name=name;c.world=world;c.rets=rs;if(changed&&S.detect[c.id]){delete S.detect[c.id].found;S.detect[c.id].t=0}if(needScan&&S.rsnap[c.id])S.rsnap[c.id].t=0;ch=c}
    else{ch={id:'c'+Date.now().toString(36),name,world,rets:rs};S.chars.push(ch);needScan=true;
      // 第一個角色：沒有角色的舊紀錄一併歸到這個角色
      if(S.chars.length===1)S.journal.forEach(r=>{if(!r.charId)r.charId=ch.id});saveJournal()}
    saveChars();lsSet('aex_detect',S.detect);S.jview=ch.id;lsSet('aex_jview',S.jview);closeModal();
    if(location.hash!=='#/journal')location.hash='#/journal';
    if(needScan||!S.detect[ch.id]?.found){await scanChars([ch])}
    route();
  };
}

function openLog(itemId,editId){
  const r=editId?S.journal.find(x=>x.id===editId):null;
  const st={itemId:r?.itemId??itemId??null,side:r?.side||'buy',hq:r?.hq??(itemId?mainQ(itemId):false)};
  const defChar=r?r.charId:(charOf(S.jview)?S.jview:(S.chars[0]?.id||''));
  const defW=r?.world||charOf(defChar)?.world||S.scope||+lsGet('aex_lastworld',4031);
  const dt=new Date((r?.time)||Date.now());dt.setMinutes(dt.getMinutes()-dt.getTimezoneOffset());
  $('#mbox').innerHTML=`<h2>${r?'編輯紀錄':'手動新增交易紀錄'}<span class="muted">遊戲內已完成的交易</span></h2>
  <div class="form">
    <div>角色</div><div><select id="fchar">${S.chars.map(c=>`<option value="${c.id}" ${defChar===c.id?'selected':''}>${esc(charLabel(c))}</option>`).join('')}<option value="" ${!charOf(defChar)?'selected':''}>未指定角色</option></select></div>
    <div>物品</div><div class="search" style="flex:none"><input id="fitem" placeholder="輸入名稱搜尋" value="${st.itemId?esc(ITEM[st.itemId].n):''}" autocomplete="off"><div class="dropdown" id="fdd"></div></div>
    <div>買賣</div><div class="row2"><div class="seg" id="fside"><button data-s="buy" class="buy ${st.side==='buy'?'on':''}">買入</button><button data-s="sell" class="sell ${st.side==='sell'?'on':''}">賣出</button></div>
      <label id="fhqw" style="margin-left:12px"><input type="checkbox" id="fhq" ${st.hq?'checked':''} style="width:auto"> HQ</label></div>
    <div>單價</div><div class="row2"><input id="fprice" type="number" min="0" value="${r?.price??''}"><span class="muted" id="fref" style="white-space:nowrap"></span></div>
    <div>數量</div><div><input id="fqty" type="number" min="1" value="${r?.qty??1}"></div>
    <div id="fretl">雇員</div><div id="fretw"><select id="fret"></select></div>
    <div id="fworldl">伺服器</div><div><select id="fworld">${worldOpts(defW)}</select></div>
    <div id="ftaxl">稅率 %</div><div><input id="ftax" type="number" min="0" max="10" step="0.5" value="${r?.tax??S.tax[defW]??5}"></div>
    <div>時間</div><div><input id="ftime" type="datetime-local" value="${dt.toISOString().slice(0,16)}"></div>
    <div>備註</div><div><input id="fnote" value="${esc(r?.note||'')}"></div>
    <div></div><div class="num" id="ftotal" style="font-size:16px"></div>
  </div>
  <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><button class="btn sm" id="flook">查成交紀錄帶入</button>
      <span class="note" id="flookn">選好物品和伺服器後，列出該伺服器近 30 天的成交，點一筆自動填入單價、數量、時間。</span></div>
    <div id="flist"></div>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button class="btn" id="fcancel">取消</button><button class="btn primary" id="fsave">儲存</button></div>`;
  $('#modal').style.display='grid';
  // 賣出看雇員：選雇員時帶入它上架的伺服器
  // 查成交紀錄：列出所選伺服器近 30 天的成交，點選帶入（同時記下來源，之後自動偵測不會重複）
  st.pick=null;
  const toLocal=ms=>{const d=new Date(ms);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};
  $('#flook').onclick=async()=>{
    if(!st.itemId)return toast('請先選擇物品');const w=+$('#fworld').value,id=st.itemId;
    $('#flist').innerHTML='<div class="empty" style="padding:12px">讀取中…</div>';
    let es;try{const d=await getJSON(`${API}/v2/history/${w}/${id}?entriesToReturn=999&entriesWithin=${30*DAY}&fields=entries.hq,entries.pricePerUnit,entries.quantity,entries.timestamp,entries.buyerName`,{persist:false,ttl:60000});es=(d?.entries||[]).sort((a,b)=>b.timestamp-a.timestamp)}
    catch(e){$('#flist').innerHTML='<div class="empty" style="padding:12px">讀取失敗，請稍後再試</div>';return}
    if(st.itemId!==id||+$('#fworld').value!==w)return;
    const me=lc(charOf($('#fchar').value)?.name);const wantHq=ITEM[id]?.canHq&&$('#fhq').checked;
    const done=new Set(S.journal.filter(x=>x.itemId===id).map(x=>x.price+'|'+x.qty+'|'+Math.floor(x.time/60000)));
    st.looked=es;
    $('#flookn').textContent=`${WN[w]}・${ITEM[id].n}・近 30 天 ${es.length} 筆${es.length>=999?'（達上限，只顯示最近的）':''}`;
    $('#flist').innerHTML=es.length?`<div style="max-height:240px;overflow:auto;margin-top:8px"><table class="compact"><tr><th class="l">時間</th><th>單價</th><th>數量</th><th class="l">買家</th><th></th></tr>
      ${es.map((x,i)=>{const mine=st.side==='buy'&&me&&lc(x.buyerName)===me;const dup=done.has(x.pricePerUnit+'|'+x.quantity+'|'+Math.floor(x.timestamp/60));
        return `<tr class="row" data-pick="${i}" style="${!!x.hq!==!!wantHq?'opacity:.55':''}"><td class="l num muted">${tstr(x.timestamp)}</td><td class="num">${fmt(x.pricePerUnit)}${x.hq?'<span class="hq">HQ</span>':''}</td><td class="num">${fmt(x.quantity)}</td>
        <td class="l ${mine?'up':'muted'}">${esc(x.buyerName||'')}${mine?' ★':''}</td><td>${dup?'<span class="tag green">已登記</span>':''}</td></tr>`}).join('')}</table></div>
      <p class="note" style="margin:6px 0 0">${st.side==='sell'?'對照遊戲中雇員的「出售歷史」，找同時間、同價、同量的那筆。':'★＝買家名稱和角色相同。'}淡色＝品質和目前勾選的 HQ 不同。</p>`
      :'<div class="empty" style="padding:12px">這個伺服器近 30 天沒有成交紀錄（或沒有人上傳過）</div>';
  };
  $('#flist').onclick=ev=>{const tr=ev.target.closest('[data-pick]');if(!tr)return;const x=st.looked?.[+tr.dataset.pick];if(!x)return;
    $('#fprice').value=x.pricePerUnit;$('#fqty').value=x.quantity;if(ITEM[st.itemId]?.canHq)$('#fhq').checked=!!x.hq;$('#ftime').value=toLocal(x.timestamp*1000);
    st.pick={itemId:st.itemId,t:x.timestamp,p:x.pricePerUnit,q:x.quantity,hq:!!x.hq,world:+$('#fworld').value,tv:$('#ftime').value};
    $('#flist').querySelectorAll('tr').forEach(t=>t.style.outline='');tr.style.outline='1px solid var(--gold)';upd()};
  $('#fworld').addEventListener('change',()=>{$('#flist').innerHTML='';st.looked=null});
  const fillRets=sel=>{const c=charOf($('#fchar').value);const rs=c?.rets||[];
    $('#fret').innerHTML=rs.map((x,i)=>`<option value="${i}" ${sel!=null&&lc(x.name)===lc(sel)?'selected':''}>${esc(x.name)}（${WN[x.world]||''}）</option>`).join('')
      +(sel&&!rs.some(x=>lc(x.name)===lc(sel))?`<option value="keep" selected>${esc(sel)}</option>`:'')+`<option value="" ${!rs.length||(r&&!sel)?'selected':''}>${rs.length?'不指定':'這個角色尚未登記雇員'}</option>`};
  const retPicked=()=>{const c=charOf($('#fchar').value);const v=$('#fret').value;return v==='keep'?{name:r?.ret}:v!==''?c?.rets?.[+v]:null};
  const applyRet=()=>{const x=retPicked();if(x?.world){$('#fworld').value=x.world;$('#fworld').onchange()}};
  fillRets(r?.side==='sell'?(r.ret||null):null);
  const upd=()=>{const it=ITEM[st.itemId];$('#fhqw').style.visibility=it?.canHq?'visible':'hidden';
    const buy=st.side==='buy';$('#ftaxl').textContent=buy?'稅率 %（買方付）':'稅率 %（賣方扣）';
    $('#fretl').style.display=$('#fretw').style.display=buy?'none':'';$('#fworldl').textContent=buy?'購買伺服器':'上架伺服器';
    const p=+$('#fprice').value,q=+$('#fqty').value,t=+$('#ftax').value;const amt=buy?p*q*(1+t/100):p*q*(1-t/100);
    $('#ftotal').innerHTML=p&&q?`${buy?'支出':'收入'} <span class="${buy?'up':'down'}">${fmt(amt)}</span> 金幣`:'';
    if(it&&S.hist[st.itemId]){const s=statsOf(S.hist[st.itemId].e,$('#fhq').checked,null);$('#fref').textContent=s.price!=null?'參考股價 '+fmt(s.price):''}else $('#fref').textContent=''};
  bindSearch($('#fitem'),$('#fdd'),it=>{st.itemId=it.id;$('#fitem').value=it.n;$('#flist').innerHTML='';st.looked=null;$('#fhq').checked=mainQ(it.id);loadHist([it.id]).then(upd);upd()});
  $('#fside').onclick=ev=>{const s=ev.target.dataset.s;if(!s)return;st.side=s;$('#fside').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.s===s));if(s==='sell')applyRet();upd()};
  $('#fchar').onchange=()=>{const c=charOf($('#fchar').value);fillRets(null);if(c){if(st.side==='sell'&&retPicked())applyRet();else{$('#fworld').value=c.world;$('#fworld').onchange()}}};
  $('#fret').onchange=applyRet;
  $('#fworld').onchange=()=>{const w=+$('#fworld').value;if(S.tax[w]!=null)$('#ftax').value=S.tax[w];upd()};
  ['#fprice','#fqty','#ftax','#fhq'].forEach(s=>$(s).oninput=upd);
  $('#fcancel').onclick=closeModal;
  $('#fsave').onclick=()=>{
    const p=+$('#fprice').value,q=+$('#fqty').value;
    if(!st.itemId||!ITEM[st.itemId])return toast('請先選擇物品');if(!(p>0))return toast('請輸入單價');if(!(q>0))return toast('請輸入數量');
    const pk=st.pick&&st.pick.itemId===st.itemId&&st.pick.p===p&&st.pick.q===q&&st.pick.world===+$('#fworld').value&&st.pick.tv===$('#ftime').value?st.pick:null;
    const rec={id:r?.id||Date.now().toString(36)+Math.random().toString(36).slice(2,6),charId:$('#fchar').value||null,itemId:st.itemId,side:st.side,price:p,qty:q,hq:ITEM[st.itemId].canHq&&$('#fhq').checked,
      world:+$('#fworld').value,tax:+$('#ftax').value||0,time:pk?pk.t*1000:(new Date($('#ftime').value).getTime()||Date.now()),note:$('#fnote').value.trim(),src:pk?tradeKey({...pk,side:st.side}):r?.src,ret:st.side==='sell'?(retPicked()?.name||undefined):undefined};
    if(r)S.journal[S.journal.findIndex(x=>x.id===r.id)]=rec;else S.journal.push(rec);
    lsSet('aex_lastworld',rec.world);saveJournal();closeModal();toast('已儲存');if(location.hash.startsWith('#/journal'))route();else location.hash='#/journal';
  };
  if(st.itemId)loadHist([st.itemId]).then(upd);upd();
}
/* 批次登記：一次輸入多筆。賣出照遊戲「出售記錄」畫面輸入（數量、實收總價、購買人、交易時間），
   儲存時到 Universalis 比對同伺服器、同數量、同時間（、同購買人）的成交，對到就用精確單價、時間與實際稅率 */
function parseGameTime(str){
  str=(str||'').trim();if(!str)return Date.now();
  const m=str.match(/^(?:(\d{4})[\/\-.])?(\d{1,2})[\/\-.](\d{1,2})\s+(\d{1,2}):(\d{2})$/);if(!m)return null;
  const now=new Date();let y=m[1]?+m[1]:now.getFullYear();
  let d=new Date(y,+m[2]-1,+m[3],+m[4],+m[5]);if(!m[1]&&d.getTime()>Date.now()+DAY*1000)d=new Date(y-1,+m[2]-1,+m[3],+m[4],+m[5]);
  return isNaN(d)?null:d.getTime();
}
// 稅率依城市不同（0%～5%）：從實收總價找出能還原成整數單價、且乘回去等於實收的稅率
function inferTax(net,q,def){
  for(const t of [...new Set([def,5,3,0,4,2,1])]){
    const unit=Math.round(net/q/(1-t/100));if(unit<=0)continue;
    const g=unit*q*(1-t/100);if(Math.floor(g+1e-6)===net||Math.round(g)===net)return {t,unit,exact:true};
  }
  return {t:def,unit:net/q/(1-def/100),exact:false};
}
const fmtGameTime=ms=>{const d=new Date(ms);const p=n=>String(n).padStart(2,'0');return `${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`};
function openBatch(){
  const defChar=charOf(S.jview)?S.jview:(S.chars[0]?.id||'');
  const st={side:'sell',rows:[]};
  $('#mbox').style.width='min(940px,100%)';
  $('#mbox').innerHTML=`<h2>批次登記<span class="muted">一次輸入多筆遊戲內已完成的交易</span></h2>
  <div class="form">
    <div>角色</div><div><select id="bchar">${S.chars.map(c=>`<option value="${c.id}" ${defChar===c.id?'selected':''}>${esc(charLabel(c))}</option>`).join('')}<option value="" ${!charOf(defChar)?'selected':''}>未指定角色</option></select></div>
    <div>買賣</div><div><div class="seg" id="bside"><button data-s="buy" class="buy">買入</button><button data-s="sell" class="sell on">賣出</button></div></div>
    <div id="bretl">雇員</div><div id="bretw"><select id="bret"></select></div>
    <div id="bworldl">上架伺服器</div><div><select id="bworld"></select></div>
    <div id="btaxl">預設稅率 %</div><div class="row2"><input id="btax" type="number" min="0" max="10" step="0.5" value="5" style="width:90px"><span class="note" id="btaxn"></span></div>
  </div>
  <div class="note" id="bhelp" style="margin:12px 0 6px"></div>
  <div class="brow bhead"><div>道具名</div><div></div><div>數量</div><div id="bph"></div><div>交易時間</div><div style="grid-column:span 3">複製幾列</div></div>
  <div id="brows"></div>
  <div class="bactions"><button class="btn sm" id="badd">＋ 再加 5 列</button><span class="num" id="btotal" style="margin-left:auto"></span>
    <button class="btn" id="bcancel">取消</button><button class="btn primary" id="bsave">全部儲存</button></div>`;
  $('#modal').style.display='grid';
  const sell=()=>st.side==='sell';
  const fillRets=()=>{const c=charOf($('#bchar').value);const rs=c?.rets||[];
    $('#bret').innerHTML=rs.map((x,i)=>`<option value="${i}">${esc(x.name)}（${WN[x.world]||''}）</option>`).join('')+`<option value="">${rs.length?'不指定':'這個角色尚未登記雇員'}</option>`;
    const x=rs[0];$('#bworld').innerHTML=worldOpts(x?.world||c?.world||S.scope||4031)};
  const applyRet=()=>{const c=charOf($('#bchar').value);const v=$('#bret').value;const x=v!==''?c?.rets?.[+v]:null;if(x)$('#bworld').value=x.world;applyTax()};
  const applyTax=()=>{const w=+$('#bworld').value;if(S.tax[w]!=null)$('#btax').value=S.tax[w];tot()};
  const sideUI=()=>{const s=sell();
    $('#bretl').style.display=$('#bretw').style.display=s?'':'none';$('#bworldl').textContent=s?'上架伺服器':'購買伺服器';
    $('#btaxn').textContent=s?'稅率依城市不同（0%／3%／5%），每列會從實收總價自動判斷；判斷不出來才用這個':'買方另外支付';
    $('#bph').textContent=s?'實收總價':'單價';
    $('#bhelp').innerHTML=s?'對照遊戲中雇員的「出售記錄」照抄：<b>數量、價格（實收總價）、交易時間</b>（例：11/22 15:41）。儲存時會到 Universalis 比對，對到的會用精確單價與時間。'
      :'每列一筆，填數量、單價、交易時間（例：11/22 15:41，留空＝現在）。';
    st.rows.forEach(r=>{r.el.querySelector('.bp').placeholder=s?'實收總價':'單價'});tot()};
  const rowCalc=r=>{const el=r.el;const q=+el.querySelector('.bq').value,v=+el.querySelector('.bp').value,t=+$('#btax').value||0;
    if(!r.itemId||!(q>0)||!(v>0))return null;
    if(sell()){const x=inferTax(v,q,t);return {unit:x.unit,amt:v,tax:x.t,exact:x.exact}}
    return {unit:v,amt:v*q*(1+t/100),tax:t}};
  const tot=()=>{let n=0,a=0;st.rows.forEach(r=>{const c=rowCalc(r);const hint=r.el.querySelector('.bs');
      if(c){n++;a+=c.amt;hint.textContent=sell()?(c.exact?`單價 ${fmt(c.unit)}・稅 ${c.tax}%`:`單價約 ${fmt(c.unit,1)}・稅率推不出來，用預設 ${c.tax}%`):`支出 ${fmt(c.amt)}`}else hint.textContent=''});
    $('#btotal').innerHTML=n?`${n} 筆・${sell()?'實收':'支出'} <span class="${sell()?'down':'up'}">${fmt(a)}</span> 金幣`:''};
  // after：插在哪一列後面；src：要複製的列（一鍵複製整列）
  const addRows=(k,after,src)=>{for(let i=0;i<k;i++){
    const el=document.createElement('div');el.className='brow';
    el.innerHTML=`<div class="search" style="flex:none"><input class="bi" placeholder="道具名" autocomplete="off"><div class="dropdown"></div></div>
      <label class="bhqw" style="visibility:hidden;white-space:nowrap"><input type="checkbox" class="bhq" style="width:auto"> HQ</label>
      <input class="bq" type="number" min="1" placeholder="數量"><input class="bp" type="number" min="0" placeholder="${sell()?'實收總價':'單價'}">
      <input class="bt" placeholder="11/22 15:41" inputmode="numeric">
      <input class="bn" type="number" min="1" max="99" value="1" title="要複製幾列"><button class="btn sm bc" title="把這一列複製到下面（相同道具、數量、價格大量賣出時用），左邊填要複製幾列">⧉ 複製</button><button class="btn sm bx" title="清除這列">✕</button><div class="bs note"></div>`;
    const row={el,itemId:null};el._row=row;st.rows.push(row);if(after)after.after(el);else $('#brows').appendChild(el);
    bindSearch(el.querySelector('.bi'),el.querySelector('.dropdown'),it=>{row.itemId=it.id;el.querySelector('.bi').value=it.n;el.querySelector('.bhqw').style.visibility=it.canHq?'visible':'hidden';el.querySelector('.bhq').checked=mainQ(it.id);el.querySelector('.bq').focus();tot()});
    el.querySelector('.bi').addEventListener('input',()=>{row.itemId=null;tot()});
    el.querySelectorAll('.bq,.bp').forEach(x=>x.oninput=tot);
    el.querySelector('.bt').onchange=()=>{const t=el.querySelector('.bt');t.style.borderColor=t.value.trim()&&parseGameTime(t.value)==null?'var(--up)':''};
    el.querySelector('.bc').onclick=()=>{const k=Math.max(1,Math.min(99,Math.round(+el.querySelector('.bn').value)||1));let a=el;const made=[];
      for(let j=0;j<k;j++){addRows(1,a,row);a=a.nextElementSibling;made.push(a)}
      made.forEach(n=>{n.classList.add('flash');setTimeout(()=>n.classList.remove('flash'),600)});toast(`已複製 ${k} 列`);tot()};
    if(src){const se=src.el;row.itemId=src.itemId;
      ['.bi','.bq','.bp','.bt'].forEach(q=>el.querySelector(q).value=se.querySelector(q).value);
      el.querySelector('.bhq').checked=se.querySelector('.bhq').checked;el.querySelector('.bhqw').style.visibility=se.querySelector('.bhqw').style.visibility;tot()}
    el.querySelector('.bx').onclick=()=>{row.itemId=null;el.querySelectorAll('input').forEach(x=>{if(x.type==='checkbox')x.checked=false;else x.value=''});el.querySelector('.bhqw').style.visibility='hidden';tot()};
  }};
  fillRets();applyTax();addRows(5);sideUI();
  $('#bchar').onchange=()=>{fillRets();if(!sell()){const c=charOf($('#bchar').value);if(c)$('#bworld').value=c.world}applyTax()};
  $('#bret').onchange=applyRet;$('#bworld').onchange=applyTax;$('#btax').oninput=tot;
  $('#bside').onclick=ev=>{const s=ev.target.dataset.s;if(!s)return;st.side=s;$('#bside').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.s===s));
    if(s==='sell')applyRet();else{const c=charOf($('#bchar').value);if(c)$('#bworld').value=c.world;applyTax()}sideUI()};
  $('#badd').onclick=()=>addRows(5);
  $('#bcancel').onclick=closeModal;
  $('#bsave').onclick=async()=>{
    const c=charOf($('#bchar').value);const v=$('#bret').value;const ret=sell()&&v!==''?c?.rets?.[+v]?.name:undefined;
    const world=+$('#bworld').value,tax=+$('#btax').value||0;const rows=[];const bad=[];
    [...$('#brows').children].map(x=>x._row).forEach((r,i)=>{const el=r.el;const name=el.querySelector('.bi').value.trim();const any=name||el.querySelector('.bp').value||el.querySelector('.bq').value;
      if(!any)return;const cc=rowCalc(r);const t=parseGameTime(el.querySelector('.bt').value);
      if(!cc||t==null){bad.push(i+1);return}
      rows.push({i,itemId:r.itemId,hq:!!(ITEM[r.itemId].canHq&&el.querySelector('.bhq').checked),q:Math.round(+el.querySelector('.bq').value),v:+el.querySelector('.bp').value,
        buyer:sell()?'':(c?.name||''),t,unit:cc.unit,tax:cc.tax})});
    if(bad.length)return toast(`第 ${bad.join('、')} 列不完整：要從清單選道具，填數量、${sell()?'實收總價':'單價'}，時間格式像 11/22 15:41`);
    if(!rows.length)return toast('還沒有填任何一列');
    // 到 Universalis 比對成交紀錄
    const btn=$('#bsave');btn.disabled=true;btn.textContent='比對成交紀錄中…';
    const hist={};const ids=[...new Set(rows.map(r=>r.itemId))];
    const within=Math.min(365*DAY,Math.ceil((Date.now()-Math.min(...rows.map(r=>r.t)))/1000)+2*DAY);
    try{await Promise.all(chunk(ids,100).map(async cs=>{const d=await getJSON(`${API}/v2/history/${world}/${cs.join(',')}?entriesToReturn=9999&entriesWithin=${within}`,{persist:false,ttl:60000});
      Object.values(itemsOf(d)).forEach(it=>hist[it.itemID]=it.entries||[])}))}catch(e){console.warn('batch match',e)}
    const used=new Set(S.journal.map(x=>x.src).filter(Boolean));let matched=0;
    const recs=rows.map(r=>{
      const cands=(hist[r.itemId]||[]).filter(e=>!!e.hq===r.hq&&e.quantity===r.q&&Math.abs(e.timestamp*1000-r.t)<=150000
        &&(!r.buyer||lc(e.buyerName)===lc(r.buyer))&&!used.has(tradeKey({side:st.side,itemId:r.itemId,t:e.timestamp,p:e.pricePerUnit,q:e.quantity,world}))
        &&(sell()?Math.abs(e.pricePerUnit*e.quantity-r.v)/r.v<0.12:Math.abs(e.pricePerUnit-r.v)/r.v<0.01));
      const e=cands.sort((a,b)=>Math.abs(a.timestamp*1000-r.t)-Math.abs(b.timestamp*1000-r.t))[0];
      const base={id:Date.now().toString(36)+r.i+Math.random().toString(36).slice(2,6),charId:c?.id||null,itemId:r.itemId,side:st.side,qty:r.q,hq:r.hq,world,note:'批次登記',ret};
      if(e){matched++;const src=tradeKey({side:st.side,itemId:r.itemId,t:e.timestamp,p:e.pricePerUnit,q:e.quantity,world});used.add(src);
        // 賣出：用實收總價反推實際稅率
        const tx=sell()?Math.max(0,Math.min(10,Math.round((1-r.v/(e.pricePerUnit*e.quantity))*1000)/10)):tax;
        return {...base,price:e.pricePerUnit,tax:tx,time:e.timestamp*1000,src,note:'批次登記・已比對'}}
      return {...base,price:Math.round(r.unit*100)/100,tax:r.tax??tax,time:r.t};
    });
    pushUndo(`批次登記 ${recs.length} 筆`);S.journal.push(...recs);lsSet('aex_lastworld',world);saveJournal();closeModal();
    toast(`已登記 ${recs.length} 筆${matched?`，其中 ${matched} 筆對到成交紀錄（精確單價與時間）`:''}，可按「復原」`);
    if(location.hash.startsWith('#/journal'))route();else location.hash='#/journal';
  };
}
function closeModal(){$('#modal').style.display='none';$('#mbox').innerHTML='';$('#mbox').style.width=''}

/* 交易紀錄本的按鈕事件 */
document.addEventListener('click',async ev=>{
  const t=ev.target;let el;
  if(el=t.closest('[data-jview]')){S.jview=el.dataset.jview;lsSet('aex_jview',S.jview);route();return}
  if(t.closest('[data-charadd]')){openChar();return}
  if(t.closest('[data-retadd]')){addRetainer();return}
  if(t.closest('[data-batch]')){openBatch();return}
  if(el=t.closest('[data-jfdays]')){setJF({days:+el.dataset.jfdays});return}
  if(el=t.closest('[data-jfside]')){setJF({side:el.dataset.jfside});return}
  if(t.closest('[data-jfmore]')){S.jlimit+=JT_PAGE;drawJT();return}
  if(el=t.closest('[data-retdel]')){const [cid,i]=el.dataset.retdel.split('|');const c=charOf(cid);const r=c?.rets[+i];if(!r)return;
    if(!confirm(`移除雇員「${r.name}@${WN[r.world]||''}」？
已加入的交易紀錄會保留。`))return;
    c.rets.splice(+i,1);if(S.rsnap[c.id])S.rsnap[c.id].list=S.rsnap[c.id].list.filter(l=>!(l.world===r.world&&lc(l.ret)===lc(r.name)));
    saveChars();lsSet('aex_rsnap',S.rsnap);route();return}
  if(el=t.closest('[data-charedit]')){openChar(el.dataset.charedit);return}
  if(el=t.closest('[data-chardel]')){const c=charOf(el.dataset.chardel);const n=S.journal.filter(r=>r.charId===c.id).length;
    if(!confirm(`刪除角色「${charLabel(c)}」？${n?`\n這個角色的 ${n} 筆紀錄會保留，改為「未指定角色」。`:''}`))return;
    S.chars=S.chars.filter(x=>x.id!==c.id);S.journal.forEach(r=>{if(r.charId===c.id)r.charId=null});delete S.detect[c.id];
    delete S.rsnap[c.id];saveChars();saveJournal();lsSet('aex_detect',S.detect);lsSet('aex_rsnap',S.rsnap);S.jview='all';lsSet('aex_jview','all');route();return}
  if(t.closest('[data-scan]')){const all=S.jview==='all'?S.chars:S.chars.filter(c=>c.id===S.jview);const chars=all.filter(c=>!scanWait(c));
    if(!chars.length){const m=Math.ceil(Math.min(...all.map(scanWait))/60000);return toast(`剛掃描過，市場資料要有人上傳才會更新，${m} 分鐘後再掃`)}
    await scanChars(chars);route();return}
  if(t.closest('[data-detall]')){S.showDetAll=!S.showDetAll;route();return}
  if(el=t.closest('[data-detimport]')){
    const v=el.dataset.detimport;
    if(v==='all'){const {rows}=detectedRows();const p=rows.filter(r=>!r.added&&!r.ign&&!r.x.amb);p.forEach(r=>importTrade(r.c.id,r.x));const a=rows.length&&rows.filter(r=>!r.added&&!r.ign&&r.x.amb).length;toast(`已加入 ${p.length} 筆${a?`，${a} 筆同名待確認請手動選擇角色`:''}`)}
    else{const [cid,k]=v.split('::');const d=S.detect[cid]||{};const x=[...(d.found||[]),...(d.sold||[])].find(f=>tradeKey(f)===k);if(x){importTrade(cid,x);toast('已加入紀錄')}}
    saveJournal();route();return}
  if(el=t.closest('[data-detsess]')){const [cid,k]=el.dataset.detsess.split('::');const x=(S.detect[cid]?.found||[]).find(f=>tradeKey(f)===k);
    if(x){const list=sessionOf(cid,x);list.forEach(f=>importTrade(cid,f));saveJournal();toast(`已加入 ${list.length} 筆（${WN[x.world]||''} 同時段）`);route()}return}
  if(el=t.closest('[data-detign]')){S.ignored.add(el.dataset.detign);lsSet('aex_ignored',[...S.ignored]);route();return}
  if(el=t.closest('[data-detunign]')){S.ignored.delete(el.dataset.detunign);lsSet('aex_ignored',[...S.ignored]);route();return}
});

