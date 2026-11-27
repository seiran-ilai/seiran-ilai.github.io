"use strict";
/* 艾奧傑亞證券交易所：路由、事件與啟動 */
/* ========== 路由與事件 ========== */
let TOKEN=0;
async function route(){
  const tok=++TOKEN;renderShell();
  const h=location.hash||'#/';const [,p,arg]=h.split('/');
  try{
    if(!p)renderHome();
    else if(p==='sector')await renderSector(arg&&(SEC[arg]||arg.startsWith('c_'))?arg:null,tok);
    else if(p==='multi')await renderMulti(tok);
    else if(p==='ranks')renderRanks(arg);
    else if(p==='heatmap')renderHeatmap();
    else if(p==='news')renderNews();
    else if(p==='item')await renderItem(+arg,tok);
    else if(p==='servers')renderServers();
    else if(p==='wall')await renderWall(tok);
    else if(p==='watch')await renderWatch(tok);
    else if(p==='journal')await renderJournal(tok);
    else renderHome();
  }catch(e){console.error(e);$('#view').innerHTML=`<div class="empty">發生錯誤：${esc(e.message)}</div>`}
}
document.addEventListener('click',ev=>{
  const t=ev.target;
  const s=t.closest('[data-star]');if(s){ev.stopPropagation();const id=+s.dataset.star;const i=S.watch.indexOf(id);i>=0?S.watch.splice(i,1):S.watch.push(id);lsSet('aex_watch',S.watch);
    if(s.classList.contains('star'))s.classList.toggle('on');else route();toast(i>=0?'已移出自選股':'已加入自選股');return}
  const lg=t.closest('[data-log]');if(lg){openLog(lg.dataset.log?+lg.dataset.log:null);return}
  const ed=t.closest('[data-edit]');if(ed){openLog(null,ed.dataset.edit);return}
  const dl=t.closest('[data-del]');if(dl){if(confirm('確定刪除這筆紀錄？')){const r=S.journal.find(x=>x.id===dl.dataset.del);pushUndo(`刪除紀錄 ${ITEM[r?.itemId]?.n||''}`);S.journal=S.journal.filter(x=>x.id!==dl.dataset.del);saveJournal();route()}return}
  const so=t.closest('[data-sort]');if(so){const k=so.dataset.sort;if(SORT.key===k)SORT.dir*=-1;else{SORT.key=k;SORT.dir=k==='name'?1:-1}route();return}
  const md=t.closest('[data-mode]');if(md){ITEMV.mode=md.dataset.mode;route();return}
  const qb=t.closest('[data-q]');if(qb){const id=+location.hash.split('/')[2];S.qual[id]=qb.dataset.q==='1';lsSet('aex_qual',S.qual);S.memo.clear();route();return}
  const wr=t.closest('[data-world]');if(wr&&wr.classList.contains('row')){setScope(+wr.dataset.world);if(location.hash.startsWith('#/servers'))location.hash='#/';return}
  const go=t.closest('[data-go]');if(go){location.hash=go.dataset.go;return}
});
$('#modal').addEventListener('mousedown',ev=>{if(ev.target.id==='modal')closeModal()});
function setScope(v){S.scope=v||null;lsSet('aex_scope',S.scope);S.memo.clear();loadTicker();route()}
$('#scope').onchange=ev=>setScope(+ev.target.value);
window.addEventListener('hashchange',()=>{$('#view').scrollTop=0;document.querySelector('main').scrollTop=0;if(window.scrollY)window.scrollTo(0,0);route()});
// 只有寬度改變才重畫（手機捲動時網址列伸縮只改高度，不必整頁重畫）
let rsz,lastW=innerWidth;window.addEventListener('resize',()=>{clearTimeout(rsz);rsz=setTimeout(()=>{if(innerWidth!==lastW){lastW=innerWidth;route()}},200)});
bindSearch($('#q'),$('#dd'),it=>{$('#q').value='';location.hash='#/item/'+it.id});
$('#refresh').onclick=manualRefresh;

/* ========== 啟動 ========== */
(async function init(){
  pruneCache();
  setInterval(tickET,1000);
  renderShell();
  // 優先讀取雲端整理好的行情；雲端資料過舊就以它為底稿，只向 Universalis 補抓差額
  showOverlay('載入行情','讀取雲端整理好的資料（每 00、30 分更新）');setProgress(.3);
  S.busy=true;
  try{
    const fresh=await checkCloud();
    if(!fresh){
      if(!S.cons){   // 雲端完全讀不到：用瀏覽器存的成分股，沒有才全掃
        S.cons=lsGet('aex_cons',null);
        if(!S.cons||Date.now()-S.cons.t>24*3600*1000||!S.cons.sectors)await scanConstituents();
      }
      S.directT=Date.now();
      await topUp(true);
      if(!Object.keys(S.tax).length)loadTax().then(()=>{if(location.hash.startsWith('#/servers'))route()});
      loadUpload().then(renderUpd);
    }
  }finally{S.busy=false;hideOverlay()}
  route();
  loadTicker();
  planRefresh();
})();
