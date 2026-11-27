"use strict";
/* 艾奧傑亞證券交易所：資料載入、自動更新排程、計算 */
/* ========== 資料載入 ========== */
function normEntries(arr){return (arr||[]).filter(x=>!CLOSED.has(x.worldID)).map(x=>({t:x.timestamp,p:x.pricePerUnit,q:x.quantity,hq:!!x.hq,w:x.worldID,b:x.buyerName||''}))}
const EXT=3;
function cleanEntries(e){
  const out=[];let removed=0;
  for(const q of [false,true]){
    const g=e.filter(x=>x.hq===q).sort((a,b)=>a.t-b.t);
    if(g.length<5){out.push(...g);continue}
    g.forEach((x,i)=>{const win=g.slice(Math.max(0,i-10),i+11);const m=wmedian(win);
      if(m&&(x.p>m*EXT||x.p<m/EXT))removed++;else out.push(x)});
  }
  return {e:out,removed};
}
function itemsOf(d){if(!d)return {};if(d.items)return d.items;if(d.itemID!=null)return {[d.itemID]:d};return {}}

async function loadHist(ids,{within=8*DAY,store=S.hist,size=10,onProg}={}){
  const need=ids.filter(id=>!store[id]||(!store[id].snap&&Date.now()-store[id].t>TTL));
  const cs=chunk(need,size);let done=0;
  await Promise.all(cs.map(async c=>{
    try{
      const d=await getJSON(`${API}/v2/history/${enc(DC)}/${c.join(',')}?entriesToReturn=999&entriesWithin=${within}`,{persist:false});
      const its=itemsOf(d);
      c.forEach(id=>{const raw=its[id]?.entries||[];const cl=cleanEntries(normEntries(raw));store[id]={t:Date.now(),e:cl.e,removed:cl.removed,raw:raw.length}});
    }catch(e){console.warn('history',e)}
    done++;onProg&&onProg(done,cs.length);
  }));
  S.memo.clear();
}

async function scanConstituents(){
  const ids=ITEMS.filter(it=>it.sec).map(it=>it.id);
  const cs=chunk(ids,100);let done=0;const score={};
  showOverlay('建立成分股','首次使用：掃描全部可交易物品的日銷量與成交均價（結果快取 24 小時）');
  await Promise.all(cs.map(async c=>{
    try{
      const d=await getJSON(`${API}/v2/aggregated/${enc(DC)}/${c.join(',')}`,{persist:false});
      (d?.results||[]).forEach(r=>{
        let t=0;for(const q of ['nq','hq']){const v=r[q]?.dailySaleVelocity?.dc?.quantity||0,p=r[q]?.averageSalePrice?.dc?.price||0;t+=v*p}
        score[r.itemId]=t;
      });
    }catch(e){console.warn('scan',e)}
    done++;setProgress(done/cs.length,`${done} / ${cs.length} 批`);
  }));
  const sectors={};
  SECTORS.forEach(s=>{sectors[s.key]=ITEMS.filter(it=>it.sec===s.key&&score[it.id]>0).sort((a,b)=>score[b.id]-score[a.id]).slice(0,PER_SECTOR).map(it=>it.id)});
  S.cons={t:Date.now(),sectors};lsSet('aex_cons',S.cons);
}

/* 向 Universalis 補抓成分股成交：只抓「手上資料之後」的新成交，併進現有資料
   （只在雲端資料延誤、或手動重新整理時才會用到）
   手上沒資料時抓近 8 天、每批 10 檔；補抓幾小時內的新成交資料量小，每批 50 檔（150 檔＝3 個請求） */
const HIST_F='items.itemID,items.entries.hq,items.entries.pricePerUnit,items.entries.quantity,items.entries.timestamp,items.entries.worldID,items.entries.buyerName';
const entKey=x=>x.t+'|'+x.w+'|'+x.p+'|'+x.q+'|'+(x.hq?1:0)+'|'+x.b;
async function topUp(withOverlay){
  const ids=allCons();if(!ids.length)return;
  const since=S.dataT||0;
  const within=since?Math.min(8*DAY,Math.ceil((Date.now()-since)/1000)+600):8*DAY;
  const cs=chunk(ids,within>DAY?10:50);let done=0,fails=0;const cut=nowS()-8*DAY;
  if(withOverlay)showOverlay('載入成交資料',since?`向 Universalis 補抓 ${hm(since)} 之後的新成交`:'抓取成分股近 8 天成交紀錄');
  await Promise.all(cs.map(async c=>{
    try{
      // fields 只在多檔查詢時有效（單檔時回傳格式不同）
      const d=await getJSON(`${API}/v2/history/${enc(DC)}/${c.join(',')}?entriesToReturn=999&entriesWithin=${within}${c.length>1?'&fields='+HIST_F:''}`,{persist:false,ttl:0});
      const its=itemsOf(d);
      c.forEach(id=>{
        const raw=its[id]?.entries||[];const old=S.hist[id];const oe=(old?.e||[]).filter(x=>x.t>=cut);
        const have=new Set(oe.map(entKey));const add=normEntries(raw).filter(x=>!have.has(entKey(x)));
        const cl=cleanEntries(oe.concat(add));
        // snap:true＝由更新排程維護，loadHist 不會因 TTL 到期再重抓
        S.hist[id]={t:Date.now(),snap:true,e:cl.e,removed:(old?.removed||0)+cl.removed,raw:(old?.raw||0)+add.length};
      });
    }catch(e){console.warn('history',e);fails++}
    done++;withOverlay&&setProgress(done/cs.length,`${done} / ${cs.length} 批`);
  }));
  // 有批次失敗就不推進資料時間，下次會重抓這段
  if(!fails||!since){S.dataT=Date.now();S.dataSrc='direct'}
  S.updated=S.dataT;S.memo.clear();
  if(withOverlay)hideOverlay();
}

const hm=ms=>new Date(ms).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false});
const lastUpload=()=>Math.max(0,...Object.values(S.upload||{}).filter(Number.isFinite));
function noteUpload(w,ts){if(ts>(S.upload[w]||0))S.upload[w]=ts}
function renderUpd(){
  const el=$('#upd');if(!el)return;
  const src={cloud:'自動更新',direct:'即時補抓',manual:'手動刷新'}[S.dataSrc]||'更新';
  const up=lastUpload();
  el.innerHTML=S.dataT?`${src} ${hm(S.dataT)}${up?`<span style="margin:0 6px;opacity:.5">・</span>玩家上傳 ${hm(up)}`:''}`:'—';
  el.title=[`雲端每 30 分鐘（00、30 分）整理一次行情${S.cloudT?`，最近一次 ${hm(S.cloudT)}`:''}`,
    S.dataSrc==='direct'?'雲端資料延誤：暫時改由瀏覽器每 30 分鐘向 Universalis 補抓一次新成交':'',
    S.dataSrc==='manual'?'手動刷新：向 Universalis 補抓新成交（10 分鐘內只能按一次）':'',
    S.refreshAt?`下次自動更新 ${hm(S.refreshAt)}`:'',
    up?`玩家上傳 ${hm(up)}：玩家最後一次把市場資料上傳到 Universalis 的時間（${ago(up)}）`:'',
    '個股頁每次打開都會即時讀取最新資料'].filter(Boolean).join('\n');
}

/* ========== 自動更新排程 ==========
   目標：每個 00、30 分更新一次，而且盡量不直接打 Universalis。
   1. 雲端（GitHub Actions）每 00、30 分整理一次成分股行情 → snapshot.json，另附只有時間的 meta.json
   2. 瀏覽器在每個時段過 2 分鐘先看 meta.json（幾十 bytes，GitHub CDN，不經過 Universalis），
      有新資料才下載 snapshot.json；雲端還沒出來就每 5 分鐘再看一次 meta
   3. 雲端資料超過 SNAP_MAX_AGE 沒更新（GitHub 排程延誤）→ 每個時段由瀏覽器向 Universalis 補抓一次「上次之後」的新成交
   4. 分頁在背景時不更新，切回來再補
   5. 手動「重新整理」先看雲端；雲端沒有新的才向 Universalis 補抓，10 分鐘內只能按一次 */
const slotStart=(t=Date.now())=>Math.floor(t/SLOT)*SLOT;
const cloudOK=()=>!!S.cloudT&&Date.now()-S.cloudT<SNAP_MAX_AGE;
async function fetchSnapshot(v){
  const r=await fetch(SNAP_URL+'?v='+(v||Math.floor(Date.now()/60000)),{cache:'no-cache'});
  if(!r.ok)throw new Error('snapshot HTTP '+r.status);
  return r.json();
}
async function fetchMeta(){
  try{const r=await fetch(META_URL+'?v='+Math.floor(Date.now()/60000),{cache:'no-store'});return r.ok?((await r.json()).t||null):null}
  catch{return null}
}
function applySnapshot(d,fresh){
  S.snapMode=fresh;S.snapT=d.t;S.cons=d.cons;
  const nowMs=Date.now();
  Object.entries(d.hist).forEach(([id,h])=>{
    S.hist[id]={t:nowMs,snap:true,raw:h.raw,removed:h.removed,e:h.e.map(r=>({t:d.now-r[0],p:r[1],q:r[2],hq:!!r[3],w:r[4],b:d.buyers[r[5]]}))};
  });
  S.tax={};Object.entries(d.tax||{}).forEach(([w,v])=>S.tax[w]=v);
  Object.entries(d.upload||{}).forEach(([w,v])=>noteUpload(w,v));
  S.snapTicker=d.ticker||[];S.dataT=S.updated=d.t;S.dataSrc='cloud';S.memo.clear();
}
// 看雲端有沒有比手上新的行情；回傳 true＝套用了較新、未過期的雲端資料
// 雲端資料過期但手上什麼都沒有（剛開站）時，仍先套用當作底稿（成分股、稅率），之後只補抓差額
async function checkCloud(){
  try{
    const t=await fetchMeta();
    if(t){S.cloudT=Math.max(S.cloudT||0,t);if(S.cons&&t<=Math.max(S.snapT||0,S.dataT||0))return false}
    else{const sl=slotStart();if(S.cons&&S.snapTry===sl)return false;S.snapTry=sl}   // 讀不到 meta：每個時段最多下載一次完整行情
    const d=await fetchSnapshot(t);
    if(!d||d.v!==1||!d.hist)return false;
    S.cloudT=Math.max(S.cloudT||0,d.t);
    const fresh=Date.now()-d.t<SNAP_MAX_AGE;
    if(!S.cons||(fresh&&d.t>(S.dataT||0))){applySnapshot(d,fresh);return fresh}
  }catch(e){console.warn('snapshot',e)}
  return false;
}
async function autoRefresh(){
  if(document.hidden)return;                     // 背景分頁：等切回來（visibilitychange）再更新
  if(S.busy)return planRefresh();
  S.busy=true;let changed=false;
  try{
    changed=await checkCloud();
    // 雲端延誤：這個時段還沒更新過，且 10 分鐘內沒試過 → 向 Universalis 補抓
    if(!cloudOK()&&(S.dataT||0)<slotStart()&&Date.now()-(S.directT||0)>10*60*1000){
      S.directT=Date.now();await topUp(false);await loadUpload();changed=true;
    }
  }finally{S.busy=false}
  if(changed){loadTicker();if(!$('#modal').style.display.includes('grid'))route()}
  planRefresh();
}
function planRefresh(){
  clearTimeout(S.refreshTimer);
  const now=Date.now(),cur=slotStart(now);
  // 手上資料已涵蓋這個時段 → 下個 00/30 過 2 分鐘；否則（雲端還沒出來）5 分鐘後再看
  const at=(S.dataT||0)>=cur?cur+SLOT+SNAP_LAG:Math.max(cur+SNAP_LAG,now+5*60*1000);
  S.refreshAt=at;S.refreshTimer=setTimeout(autoRefresh,at-now);renderUpd();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.refreshAt&&Date.now()>=S.refreshAt)autoRefresh()});
async function manualRefresh(){
  const wait=MANUAL_COOLDOWN-(Date.now()-lsGet('aex_manualT',0));
  if(wait>0)return toast(`為了減少對 Universalis 的存取，${Math.ceil(wait/60000)} 分鐘後才能再手動重新整理`);
  if(S.busy)return toast('正在更新中，請稍候');
  S.busy=true;
  try{
    showOverlay('重新整理','檢查雲端是否有新的行情');setProgress(.2);
    if(await checkCloud())toast('已載入雲端最新行情');
    else{
      lsSet('aex_manualT',Date.now());
      await topUp(true);
      showOverlay('重新整理','讀取玩家上傳時間與最新成交');
      await loadUpload();S.dataSrc='manual';
      pruneCache(true);MEM.clear();
      const sm=S.snapMode;S.snapMode=false;try{await loadTicker()}finally{S.snapMode=sm}
      toast('已向 Universalis 補抓最新成交');
    }
    S.hist30={};S.histL={};   // 個股、K 線頁下次打開時重新讀取
  }finally{S.busy=false;hideOverlay()}
  route();planRefresh();
}
async function loadTax(){
  await Promise.all(WORLDS.map(async([id,name])=>{
    try{
      const d=await getJSON(`${API}/tax-rates?world=${enc(name)}`,{ttl:60*60*1000});
      const vals=Object.values(d||{});const cnt={};vals.forEach(v=>cnt[v]=(cnt[v]||0)+1);
      S.tax[id]=+Object.entries(cnt).sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0]?.[0];
    }catch(e){}
  }));
}
async function loadUpload(){
  const ids=allCons();const up={};
  await Promise.all(chunk(ids,100).map(async c=>{
    try{const d=await getJSON(`${API}/v2/aggregated/${enc(DC)}/${c.join(',')}`,{persist:false});
      (d?.results||[]).forEach(r=>(r.worldUploadTimes||[]).forEach(u=>{up[u.worldId]=Math.max(up[u.worldId]||0,u.timestamp)}))}catch(e){}
  }));
  Object.entries(up).forEach(([w,t])=>noteUpload(w,t));
}

/* ========== 計算 ========== */
function wmedian(es){
  if(!es.length)return null;
  const a=[...es].sort((x,y)=>x.p-y.p);let tot=0;a.forEach(x=>tot+=x.q);
  let c=0;for(const x of a){c+=x.q;if(c>=tot/2)return x.p}
  return a[a.length-1].p;
}
function mainQ(id){
  if(S.qual[id]!=null)return S.qual[id];
  const it=ITEM[id];if(!it?.canHq)return false;
  const e=(S.hist30[id]||S.hist[id])?.e||[];
  let h=0,n=0;e.forEach(x=>x.hq?h+=x.q:n+=x.q);
  return h>n;
}
function statsOf(e,q,world){
  const now=nowS();
  const es=e.filter(x=>x.hq===q&&(!world||x.w===world));
  const today=es.filter(x=>x.t>=now-DAY),prev=es.filter(x=>x.t<now-DAY&&x.t>=now-8*DAY);
  const pT=wmedian(today),pP=wmedian(prev);
  const sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);
  // 999 筆上限：若資料被截斷，前 7 日只涵蓋部分天數，改用實際涵蓋天數換算日均
  let cov=7;
  if(e.length>=999||e._cap){let old=Infinity;for(const x of e)if(x.t<old)old=x.t;cov=Math.max(0,Math.min(7,(now-DAY-old)/DAY))}
  const prevVol=sum(prev,x=>x.q),prevAmt=sum(prev,x=>x.q*x.p);
  const td=[...today].sort((a,b)=>a.t-b.t);const tp=td.map(x=>x.p),pp=prev.map(x=>x.p);
  const open=td.length?td[0].p:null,high=tp.length?Math.max(...tp):null,low=tp.length?Math.min(...tp):null;
  const prevHigh=pp.length?Math.max(...pp):null,prevLow=pp.length?Math.min(...pp):null;
  const dVol0=cov>=0.5?prevVol/cov:null;
  return {pT,pP,price:pT??pP,chg:(pT!=null&&pP!=null)?(pT/pP-1)*100:null,cov,truncated:cov<7,
    open,high,low,prevHigh,prevLow,diff:(pT!=null&&pP!=null)?pT-pP:null,amp:(high!=null&&pP)?(high-low)/pP*100:null,
    vr:dVol0>0?td.reduce((a,x)=>a+x.q,0)/dVol0:null,
    vol:sum(today,x=>x.q),amt:sum(today,x=>x.q*x.p),prevVol,prevAmt,
    dVol:cov>=0.5?prevVol/cov:null,dAmt:cov>=0.5?prevAmt/cov:null,es,today,prev};
}
function stats(id,world=S.scope){
  const k=id+'|'+world;if(S.memo.has(k))return S.memo.get(k);
  const h=S.hist[id];const s=statsOf(h?(h.raw>=999?Object.assign(h.e,{_cap:true}):h.e):[],mainQ(id),world);S.memo.set(k,s);return s;
}
function indexOf(ids,world=S.scope){
  let num=0,den=0,n=0;
  ids.forEach(id=>{const s=stats(id,world);if(s.pT!=null&&s.pP!=null&&s.dAmt>0){num+=s.dAmt*s.pT/s.pP;den+=s.dAmt;n++}});
  return den?{v:1000*num/den,chg:(num/den-1)*100,n}:{v:null,chg:null,n:0};
}
function indexSeries(ids,world=S.scope){
  const now=nowS();const pts=[];const base={},w={},last={};
  ids.forEach(id=>{const s=stats(id,world);if(s.pP!=null&&s.dAmt>0){base[id]=s.pP;w[id]=s.dAmt;last[id]=s.pP}});
  const keys=Object.keys(base);if(!keys.length)return [];
  for(let k=7;k>=0;k--){
    const a=now-(k+1)*DAY,b=now-k*DAY;let num=0,den=0;
    keys.forEach(id=>{const es=stats(id,world).es.filter(x=>x.t>=a&&x.t<b);const p=wmedian(es);if(p!=null)last[id]=p;num+=w[id]*last[id]/base[id];den+=w[id]});
    pts.push({label:k===0?'今日':`-${k}日`,v:1000*num/den});
  }
  return pts;
}

