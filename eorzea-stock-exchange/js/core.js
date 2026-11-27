"use strict";
/* 艾奧傑亞證券交易所：常數、物品資料、工具、請求節流與快取、狀態 */
/* ========== 常數 ========== */
const API='https://universalis.app/api';
const DC='陸行鳥';
const WORLDS=[[4028,'伊弗利特'],[4029,'迦樓羅'],[4030,'利維坦'],[4031,'鳳凰'],[4032,'奧汀'],[4033,'巴哈姆特'],[4035,'泰坦']];
const CLOSED=new Set([4034]); // 拉姆：已關閉的伺服器
const WN=Object.fromEntries(WORLDS);
const CATS={"1": "武器", "2": "製作工具", "3": "採集工具", "4": "防具", "5": "飾品", "6": "藥品食品", "7": "素材", "8": "其他", "9": "格鬥武器", "10": "劍", "11": "斧", "12": "弓", "13": "長槍", "14": "咒杖", "15": "幻杖", "16": "魔導書", "17": "盾", "18": "投擲武器", "19": "木工工具", "20": "鍛造工具", "21": "甲冑工具", "22": "金工工具", "23": "皮革工具", "24": "裁縫工具", "25": "鍊金工具", "26": "烹調工具", "27": "採掘工具", "28": "園藝工具", "29": "捕魚用具", "30": "釣餌", "31": "頭部防具", "32": "內衣", "33": "身體防具", "34": "內褲", "35": "腿部防具", "36": "手部防具", "37": "腳部防具", "38": "腰部防具", "39": "項鍊", "40": "耳飾", "41": "手鐲", "42": "戒指", "43": "藥品", "44": "食材", "45": "食品", "46": "水產品", "47": "石材", "48": "金屬", "49": "木材", "50": "布料", "51": "皮革", "52": "骨材", "53": "鍊金原料", "54": "染料", "55": "組件", "56": "一般傢俱", "57": "魔晶石", "58": "水晶", "59": "觸媒", "60": "雜貨", "61": "靈魂水晶", "62": "箭", "63": "任務道具", "64": "其他", "65": "室外建材", "66": "室內建材", "67": "庭具", "68": "椅子睡床", "69": "桌台", "70": "桌上", "71": "壁掛", "72": "地毯", "73": "雙劍", "74": "雜貨（季節活動）", "75": "寵物", "76": "雙手劍", "77": "火槍", "78": "天球儀", "79": "飛空艇/潛水艇組件", "80": "管弦樂琴關聯物品", "81": "栽培用品", "82": "繪畫作品", "83": "武士刀", "84": "刺劍", "85": "魔導書（學者專用）", "86": "槍刃", "87": "投擲武器", "88": "雙手鐮刀", "89": "賢具", "90": "雜貨(修得/收錄系)", "91": "二刀流武器", "92": "筆"};
const JOBS=["木工師", "鍛造師", "甲冑師", "金工師", "皮革師", "裁縫師", "鍊金術師", "烹調師"];
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
const SECTORS=[
  {key:'food',name:'料理股',cats:[45]},
  {key:'potion',name:'藥水股',cats:[43]},
  {key:'material',name:'素材股',cats:[44,46,47,48,49,50,51,52,53,54,55,57,58,59]},
  {key:'furniture',name:'家具股',cats:[56,65,66,67,68,69,70,71,72,81,82]},
  {key:'gear',name:'裝備股',cats:[...range(9,29),31,33,35,36,37,39,40,41,42,73,76,77,78,...range(83,89),91,92]},
];
const SEC=Object.fromEntries(SECTORS.map(s=>[s.key,s]));
const CAT2SEC={};SECTORS.forEach(s=>s.cats.forEach(c=>CAT2SEC[c]=s.key));
const PER_SECTOR=30;
// 雲端預先整理的行情（GitHub Actions 每 30 分鐘：00、30 分更新）
const SNAP_BASE='https://raw.githubusercontent.com/seiran-ilai/seiran-ilai.github.io/aex-data/';
const SNAP_URL=SNAP_BASE+'snapshot.json';   // 完整行情（約 340KB gzip）
const META_URL=SNAP_BASE+'meta.json';       // 只有更新時間（幾十 bytes），用來判斷要不要下載完整行情
const SLOT=30*60*1000;                      // 更新週期：每 00、30 分
const SNAP_LAG=2*60*1000;                   // 雲端整理＋發布需要的時間：每個時段過 2 分鐘才去看
const SNAP_MAX_AGE=75*60*1000;              // 雲端資料超過這麼久沒更新（連漏 2 次）→ 改由瀏覽器補抓
const MANUAL_COOLDOWN=10*60*1000;           // 手動重新整理的冷卻時間（重新載入頁面也算）
const TTL=5*60*1000;
const DAY=86400;

/* ========== 物品資料 ========== */
const ITEM={};const ITEMS=[];
ITEMS_TSV.trim().split('\n').forEach(l=>{
  const [id,n,icon,cat,hq,ilvl,npc,stack,jobs]=l.split('\t');const it={id:+id,n,icon:+icon,cat:+cat,canHq:hq==='1',sec:CAT2SEC[+cat]||null,ilvl:+ilvl||0,npc:+npc||0,stack:+stack||0,jobs:+jobs||0};
  ITEM[it.id]=it;ITEMS.push(it);
});

/* ========== 工具 ========== */
const $=s=>document.querySelector(s);
const enc=encodeURIComponent;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowS=()=>Date.now()/1000;
function fmt(n,d=0){if(n==null||!isFinite(n))return '—';return Number(n).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d})}
function fmtBig(n){if(n==null||!isFinite(n))return '—';const a=Math.abs(n);if(a>=1e8)return fmt(n/1e8,2)+' 億';if(a>=1e4)return fmt(n/1e4,1)+' 萬';return fmt(n)}
const cls=x=>x==null?'flat':x>0.005?'up':x<-0.005?'down':'flat';
function pct(x){if(x==null||!isFinite(x))return '<span class="num flat">—</span>';return `<span class="num ${cls(x)}">${x>0.005?'▲':x<-0.005?'▼':''}${fmt(Math.abs(x),2)}%</span>`}
function signed(x,d=0){if(x==null||!isFinite(x))return '<span class="num flat">—</span>';return `<span class="num ${cls(x)}">${x>0?'+':''}${fmt(x,d)}</span>`}
function iconUrl(icon){const f=String(Math.floor(icon/1000)*1000).padStart(6,'0');return `https://xivapi.com/i/${f}/${String(icon).padStart(6,'0')}.png`}
function ico(it,lg){return `<img class="ico${lg?' lg':''}" loading="lazy" src="${iconUrl(it.icon)}" alt="">`}
function ago(ms){if(!ms)return '—';const s=(Date.now()-ms)/1000;if(s<60)return '剛剛';if(s<3600)return Math.floor(s/60)+' 分鐘前';if(s<DAY)return Math.floor(s/3600)+' 小時前';return Math.floor(s/DAY)+' 天前'}
function tstr(t,withDate=true){const d=new Date(t*1000);const p=n=>String(n).padStart(2,'0');return (withDate?`${p(d.getMonth()+1)}/${p(d.getDate())} `:'')+`${p(d.getHours())}:${p(d.getMinutes())}`}
function chunk(a,n){const r=[];for(let i=0;i<a.length;i+=n)r.push(a.slice(i,i+n));return r}
function lsGet(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}}
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}

/* ========== 請求：限流 + 快取 ========== */
const LIM={active:0,queue:[],last:0,MAXC:4,GAP:125,timer:null};
function schedule(fn){return new Promise((res,rej)=>{LIM.queue.push({fn,res,rej});pump()})}
function pump(){
  while(LIM.active<LIM.MAXC&&LIM.queue.length){
    const wait=LIM.last+LIM.GAP-Date.now();
    if(wait>0){if(!LIM.timer)LIM.timer=setTimeout(()=>{LIM.timer=null;pump()},wait);return}
    const job=LIM.queue.shift();LIM.active++;LIM.last=Date.now();
    job.fn().then(job.res,job.rej).finally(()=>{LIM.active--;pump()});
  }
}
const MEM=new Map();const INFLIGHT=new Map();
async function rawFetch(url){
  for(let i=0;i<4;i++){
    let r;try{r=await fetch(url)}catch(e){await new Promise(z=>setTimeout(z,1000*2**i));continue}
    if(r.ok)return r.json();
    if(r.status===404)return null;
    if(r.status===429||r.status>=500){await new Promise(z=>setTimeout(z,800*2**i));continue}
    throw new Error('HTTP '+r.status);
  }
  throw new Error('請求失敗（重試多次）');
}
async function getJSON(url,{ttl=TTL,persist=true}={}){
  const m=MEM.get(url);if(m&&Date.now()-m.t<ttl)return m.d;
  if(persist){const c=lsGet('aex:c:'+url);if(c&&Date.now()-c.t<ttl){MEM.set(url,c);return c.d}}
  if(INFLIGHT.has(url))return INFLIGHT.get(url);
  const p=schedule(()=>rawFetch(url)).then(d=>{
    const rec={t:Date.now(),d};if(ttl>0)MEM.set(url,rec);INFLIGHT.delete(url);
    if(persist){const s=JSON.stringify(rec);if(s.length<250000){try{localStorage.setItem('aex:c:'+url,s)}catch{pruneCache()}}}
    return d;
  },e=>{INFLIGHT.delete(url);throw e});
  INFLIGHT.set(url,p);return p;
}
function pruneCache(all){
  const ks=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('aex:c:'))ks.push(k)}
  ks.forEach(k=>{const c=lsGet(k);if(all||!c||Date.now()-c.t>TTL)localStorage.removeItem(k)});
}

/* ========== 狀態 ========== */
const S={
  scope:(s=>WN[s]?s:null)(lsGet('aex_scope',null)),      // null = 陸行鳥 DC，否則 worldId
  cons:null,                          // {t, sectors:{key:[ids]}}
  hist:{},                            // id -> {t, e:[{t,p,q,hq,w,b}]}（DC、8 天）
  hist30:{},                          // id -> {t, e}
  qual:lsGet('aex_qual',{}),          // 使用者手動切換的品質
  watch:lsGet('aex_watch',[]),
  journal:lsGet('aex_journal',[]),
  tax:{},                             // worldId -> rate
  upload:{},                          // worldId -> ms
  updated:null,
  memo:new Map(),
};
const allCons=()=>S.cons?[...new Set(Object.values(S.cons.sectors).flat())]:[];

