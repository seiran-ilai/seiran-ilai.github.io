"use strict";
/* 艾奧傑亞證券交易所：圖表 */
/* ========== 圖表 ========== */
function sparkline(pts,w=110,h=34){
  if(pts.length<2)return '';
  const vs=pts.map(p=>p.v);const mn=Math.min(...vs),mx=Math.max(...vs),r=mx-mn||1;
  const d=pts.map((p,i)=>`${i?'L':'M'}${(i/(pts.length-1)*w).toFixed(1)},${(h-2-(p.v-mn)/r*(h-4)).toFixed(1)}`).join('');
  const c=vs[vs.length-1]>=vs[0]?'var(--up)':'var(--down)';
  return `<svg width="${w}" height="${h}"><path d="${d}" fill="none" stroke="${c}" stroke-width="1.6"/></svg>`;
}
function setupCanvas(cv){const dpr=window.devicePixelRatio||1;const W=cv.clientWidth,H=cv.clientHeight;cv.width=W*dpr;cv.height=H*dpr;const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);return {g,W,H}}
const CSSV=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function drawLine(cv,pts){
  const {g,W,H}=setupCanvas(cv);g.clearRect(0,0,W,H);
  if(pts.length<2){g.fillStyle=CSSV('--muted');g.fillText('資料不足',W/2-24,H/2);return}
  const padL=10,padR=64,padT=12,padB=24;const vs=pts.map(p=>p.v);
  let mn=Math.min(...vs,1000),mx=Math.max(...vs,1000);const r=(mx-mn)||1;mn-=r*.1;mx+=r*.1;
  const x=i=>padL+i/(pts.length-1)*(W-padL-padR),y=v=>padT+(mx-v)/(mx-mn)*(H-padT-padB);
  g.font='11px '+CSSV('--mono');g.strokeStyle='#1d2431';g.fillStyle=CSSV('--muted');
  for(let i=0;i<=4;i++){const v=mn+(mx-mn)*i/4;g.beginPath();g.moveTo(padL,y(v));g.lineTo(W-padR,y(v));g.stroke();g.fillText(fmt(v,1),W-padR+6,y(v)+4)}
  g.setLineDash([4,4]);g.strokeStyle='#5a6070';g.beginPath();g.moveTo(padL,y(1000));g.lineTo(W-padR,y(1000));g.stroke();g.setLineDash([]);
  const up=vs[vs.length-1]>=1000;const col=up?CSSV('--up'):CSSV('--down');
  const grad=g.createLinearGradient(0,padT,0,H-padB);grad.addColorStop(0,up?'#ff4d5540':'#22c07a40');grad.addColorStop(1,'#0000');
  g.beginPath();pts.forEach((p,i)=>i?g.lineTo(x(i),y(p.v)):g.moveTo(x(i),y(p.v)));g.lineTo(x(pts.length-1),H-padB);g.lineTo(x(0),H-padB);g.fillStyle=grad;g.fill();
  g.beginPath();pts.forEach((p,i)=>i?g.lineTo(x(i),y(p.v)):g.moveTo(x(i),y(p.v)));g.strokeStyle=col;g.lineWidth=2;g.stroke();g.lineWidth=1;
  g.fillStyle=CSSV('--muted');pts.forEach((p,i)=>{g.fillText(p.label,x(i)-12,H-6)});
  pts.forEach((p,i)=>{g.beginPath();g.arc(x(i),y(p.v),2.5,0,7);g.fillStyle=col;g.fill()});
}

function buildCandles(es,mode,days=30){
  const now=nowS();const out=[];
  let n,start,step;
  if(mode==='hour'){step=3600;n=72;start=Math.floor(now/3600)*3600-(n-1)*3600}
  else{
    // 日 K：一根一天；週 K：一根一週（週一開始），近 1 年
    const d=new Date();d.setHours(0,0,0,0);if(mode==='week')d.setDate(d.getDate()-((d.getDay()+6)%7));
    step=mode==='week'?7*DAY:DAY;const last=d.getTime()/1000;n=mode==='week'?53:days;start=last-(n-1)*step;
    const first=es.length?Math.min(...es.map(x=>x.t)):now;const fs=Math.max(start,Math.floor((first-last)/step)*step+last);n=Math.round((last-fs)/step)+1;start=fs}
  const a=[...es].sort((x,y)=>x.t-y.t);let prevC=null,j=0;
  for(let i=0;i<n;i++){
    const t0=start+i*step,t1=t0+step;const b=[];while(j<a.length&&a[j].t<t1){if(a[j].t>=t0)b.push(a[j]);j++}
    const lab=mode==='hour'?tstr(t0,false):(()=>{const d=new Date(t0*1000);return (mode==='week'&&d.getMonth()===0&&d.getDate()<=7?d.getFullYear()+'/':'')+`${d.getMonth()+1}/${d.getDate()}`})();
    if(b.length){const ps=b.map(x=>x.p);const c={t:t0,lab,o:b[0].p,c:b[b.length-1].p,h:Math.max(...ps),l:Math.min(...ps),v:b.reduce((s,x)=>s+x.q,0),n:b.length};out.push(c);prevC=c.c}
    else out.push(prevC==null?{t:t0,lab,empty:true,none:true}:{t:t0,lab,o:prevC,c:prevC,h:prevC,l:prevC,v:0,empty:true});
  }
  return out;
}
/* ---------- 技術指標 ---------- */
function calcInd(cs){
  const n=cs.length,A=()=>new Array(n).fill(null);
  const idx=[];cs.forEach((c,i)=>{if(!c.none&&!c.empty)idx.push(i)});
  const C=idx.map(i=>cs[i].c),Hh=idx.map(i=>cs[i].h),Ll=idx.map(i=>cs[i].l);
  const put=a=>{const o=A();a.forEach((v,k)=>o[idx[k]]=v);return o};
  const sma=p=>C.map((_,k)=>k<p-1?null:C.slice(k-p+1,k+1).reduce((a,b)=>a+b,0)/p);
  const ema=(arr,p)=>{const a=2/(p+1);let e=null;return arr.map(v=>v==null?null:(e=e==null?v:e+a*(v-e)))};
  const ma20=sma(20);
  const sd=C.map((_,k)=>k<19?null:Math.sqrt(C.slice(k-19,k+1).reduce((a,v)=>a+(v-ma20[k])**2,0)/20));
  let K=50,D=50;const Ks=[],Ds=[];
  C.forEach((c,k)=>{const lo=Math.min(...Ll.slice(Math.max(0,k-8),k+1)),hi=Math.max(...Hh.slice(Math.max(0,k-8),k+1));
    const rsv=hi===lo?50:(c-lo)/(hi-lo)*100;K=K*2/3+rsv/3;D=D*2/3+K/3;Ks.push(K);Ds.push(D)});
  let ag=0,al=0;const R=[];
  C.forEach((c,k)=>{if(!k){R.push(null);return}const d=c-C[k-1],gn=Math.max(d,0),ls=Math.max(-d,0);
    if(k<=14){ag+=gn/14;al+=ls/14;R.push(k<14?null:(al===0?100:100-100/(1+ag/al)))}
    else{ag=(ag*13+gn)/14;al=(al*13+ls)/14;R.push(al===0?100:100-100/(1+ag/al))}});
  const e12=ema(C,12),e26=ema(C,26);const dif=C.map((_,k)=>e12[k]-e26[k]);const dea=ema(dif,9);const osc=dif.map((v,k)=>v-dea[k]);
  return {ma5:put(sma(5)),ma10:put(sma(10)),ma20:put(ma20),bu:put(ma20.map((m,k)=>m==null?null:m+2*sd[k])),bm:put(ma20),bl:put(ma20.map((m,k)=>m==null?null:m-2*sd[k])),
    K:put(Ks),D:put(Ds),rsi:put(R),dif:put(dif),dea:put(dea),osc:put(osc)};
}
const IND_COL={ma5:'#f0b429',ma10:'#22d3ee',ma20:'#e879f9',boll:'#60a5fa',K:'#f0b429',D:'#22d3ee',rsi:'#e879f9',dif:'#f0b429',dea:'#22d3ee'};
function drawCandles(cv,cs,hover,opt={}){
  const {g,W,H}=setupCanvas(cv);g.clearRect(0,0,W,H);
  const UP=CSSV('--up'),DN=CSSV('--down'),MU=CSSV('--muted');const MONO=CSSV('--mono');g.font='11px '+MONO;
  const valid=cs.filter(c=>!c.none);
  if(!valid.length){g.fillStyle=MU;g.fillText('此範圍沒有成交紀錄',W/2-50,H/2);return null}
  const ov=opt.ov||'ma',sub=opt.sub&&opt.sub!=='vol'?opt.sub:null;const I=calcInd(cs);
  const padL=8,padR=72,padT=22,labH=20,gap=12;
  const volH=Math.round(H*(sub?.12:.2)),subH=sub?Math.round(H*.2):0;
  const priceH=H-padT-labH-volH-gap-(sub?subH+gap:0);
  let hi=Math.max(...valid.map(c=>c.h)),lo=Math.min(...valid.map(c=>c.l));
  if(ov==='boll'){I.bu.forEach(v=>{if(v!=null)hi=Math.max(hi,v)});I.bl.forEach(v=>{if(v!=null)lo=Math.min(lo,v)})}
  const r=(hi-lo)||hi*.1||1;hi+=r*.08;lo=Math.max(0,lo-r*.08);
  const vmax=Math.max(1,...valid.map(c=>c.v));
  const cw=(W-padL-padR)/cs.length;const X=i=>padL+cw*i+cw/2;const Y=p=>padT+(hi-p)/(hi-lo)*priceH;
  const vTop=padT+priceH+gap;const VY=v=>vTop+volH-(v/vmax)*volH;const sTop=vTop+volH+gap;
  g.strokeStyle='#1a212d';g.fillStyle=MU;
  for(let i=0;i<=4;i++){const p=lo+(hi-lo)*i/4;g.beginPath();g.moveTo(padL,Y(p));g.lineTo(W-padR,Y(p));g.stroke();g.fillText(fmt(p),W-padR+6,Y(p)+4)}
  g.fillText('量 '+fmtBig(vmax),W-padR+6,vTop+10);
  g.beginPath();g.moveTo(padL,vTop+volH+.5);g.lineTo(W-padR,vTop+volH+.5);g.stroke();
  const bw=Math.max(1,Math.min(14,cw*.62));
  if(ov==='boll'){ // 布林通道底色
    g.fillStyle='#60a5fa14';g.beginPath();let st=false;
    cs.forEach((c,i)=>{const v=I.bu[i];if(v==null)return;st?g.lineTo(X(i),Y(v)):g.moveTo(X(i),Y(v));st=true});
    for(let i=cs.length-1;i>=0;i--){const v=I.bl[i];if(v!=null)g.lineTo(X(i),Y(v))}
    if(st)g.fill();
  }
  cs.forEach((c,i)=>{
    if(c.none)return;const x=X(i);
    if(c.empty){g.strokeStyle='#3a4252';g.beginPath();g.moveTo(x-bw/2,Y(c.c)+.5);g.lineTo(x+bw/2,Y(c.c)+.5);g.stroke();return}
    const col=c.c>=c.o?UP:DN;g.strokeStyle=col;g.fillStyle=col;
    g.beginPath();g.moveTo(x+.5,Y(c.h));g.lineTo(x+.5,Y(c.l));g.stroke();
    const y1=Y(Math.max(c.o,c.c)),y2=Y(Math.min(c.o,c.c));g.fillRect(x-bw/2,y1,bw,Math.max(1,y2-y1));
    g.globalAlpha=.75;g.fillRect(x-bw/2,VY(c.v),bw,vTop+volH-VY(c.v));g.globalAlpha=1;
  });
  const line=(arr,col,Yf=Y,w=1.2)=>{g.strokeStyle=col;g.lineWidth=w;g.beginPath();let st=false;arr.forEach((v,i)=>{if(v==null)return;st?g.lineTo(X(i),Yf(v)):g.moveTo(X(i),Yf(v));st=true});g.stroke();g.lineWidth=1};
  if(ov==='ma'){line(I.ma5,IND_COL.ma5);line(I.ma10,IND_COL.ma10);line(I.ma20,IND_COL.ma20)}
  else if(ov==='boll'){line(I.bu,IND_COL.boll);line(I.bm,IND_COL.ma5);line(I.bl,IND_COL.boll)}
  // 指標數值（滑鼠所在或最後一根）
  let li=hover!=null&&!cs[hover]?.none?hover:cs.length-1;
  const legend=(y,parts)=>{let x=padL;parts.forEach(([t,c])=>{g.fillStyle=c;g.fillText(t,x,y);x+=g.measureText(t).width+12})};
  const v2=(a)=>{for(let i=li;i>=0;i--)if(a[i]!=null)return a[i];return null};
  if(ov==='ma')legend(14,[['MA5 '+fmt(v2(I.ma5),1),IND_COL.ma5],['MA10 '+fmt(v2(I.ma10),1),IND_COL.ma10],['MA20 '+fmt(v2(I.ma20),1),IND_COL.ma20]]);
  else if(ov==='boll')legend(14,[['BOLL(20,2)',MU],['上 '+fmt(v2(I.bu),1),IND_COL.boll],['中 '+fmt(v2(I.bm),1),IND_COL.ma5],['下 '+fmt(v2(I.bl),1),IND_COL.boll]]);
  if(sub){
    g.strokeStyle='#1a212d';g.beginPath();g.moveTo(padL,sTop+subH+.5);g.lineTo(W-padR,sTop+subH+.5);g.stroke();
    let smin=0,smax=100;
    if(sub==='macd'){const m=Math.max(1e-9,...[...I.dif,...I.dea,...I.osc].filter(v=>v!=null).map(Math.abs));smin=-m*1.1;smax=m*1.1}
    const SY=v=>sTop+(smax-v)/(smax-smin)*subH;
    const hl=(v,dash)=>{g.strokeStyle='#2a3242';if(dash)g.setLineDash([3,3]);g.beginPath();g.moveTo(padL,SY(v));g.lineTo(W-padR,SY(v));g.stroke();g.setLineDash([]);g.fillStyle=MU;g.fillText(fmt(v,sub==='macd'?1:0),W-padR+6,SY(v)+4)};
    if(sub==='kd'){hl(80,1);hl(20,1);line(I.K,IND_COL.K,SY);line(I.D,IND_COL.D,SY);legend(sTop-2,[['KD(9,3,3)',MU],['K '+fmt(v2(I.K),1),IND_COL.K],['D '+fmt(v2(I.D),1),IND_COL.D]])}
    else if(sub==='rsi'){hl(70,1);hl(30,1);line(I.rsi,IND_COL.rsi,SY);legend(sTop-2,[['RSI(14)',MU],[fmt(v2(I.rsi),1),IND_COL.rsi]])}
    else if(sub==='macd'){hl(0);cs.forEach((c,i)=>{const v=I.osc[i];if(v==null)return;g.fillStyle=v>=0?UP:DN;const y0=SY(0),y1=SY(v);g.globalAlpha=.7;g.fillRect(X(i)-bw/2,Math.min(y0,y1),bw,Math.abs(y1-y0)||1);g.globalAlpha=1});
      line(I.dif,IND_COL.dif,SY);line(I.dea,IND_COL.dea,SY);legend(sTop-2,[['MACD(12,26,9)',MU],['DIF '+fmt(v2(I.dif),1),IND_COL.dif],['DEA '+fmt(v2(I.dea),1),IND_COL.dea],['OSC '+fmt(v2(I.osc),1),v2(I.osc)>=0?UP:DN]])}
  }
  g.fillStyle=MU;const every=Math.ceil(cs.length/10);let lastX=-1e9;cs.forEach((c,i)=>{if(i%every)return;const x=Math.max(padL,X(i)-14);if(x<lastX+g.measureText(c.lab).width+8)return;g.fillText(c.lab,x,H-5);lastX=x});
  if(hover!=null&&cs[hover]){const x=X(hover);g.strokeStyle='#8890a0';g.setLineDash([3,3]);g.beginPath();g.moveTo(x+.5,padT);g.lineTo(x+.5,sub?sTop+subH:vTop+volH);g.stroke();g.setLineDash([])}
  return {X,cw,padL};
}
function mountCandles(box,cs,opt={}){
  const cv=box.querySelector('canvas'),tip=box.querySelector('.tip');let L=drawCandles(cv,cs,null,opt);
  cv.onmousemove=ev=>{if(!L)return;const rc=cv.getBoundingClientRect();const i=Math.floor((ev.clientX-rc.left-L.padL)/L.cw);
    if(i<0||i>=cs.length||cs[i].none){tip.style.display='none';return}
    L=drawCandles(cv,cs,i,opt);const c=cs[i];const pv=cs.slice(0,i).reverse().find(z=>!z.none&&!z.empty);
    const ch=pv&&!c.empty?(c.c/pv.c-1)*100:null;
    tip.innerHTML=c.empty?`<b>${c.lab}</b><br><span class="muted">無成交</span>`:
      `<b>${c.lab}</b> ${ch!=null?pct(ch):''}<br>開 <span class="num">${fmt(c.o)}</span>　高 <span class="num up">${fmt(c.h)}</span><br>低 <span class="num down">${fmt(c.l)}</span>　收 <span class="num">${fmt(c.c)}</span><br>量 <span class="num">${fmt(c.v)}</span>（${c.n} 筆）`;
    tip.style.display='block';let tx=ev.clientX-rc.left+14;if(tx>rc.width-180)tx-=200;tip.style.left=tx+'px';tip.style.top='24px'};
  cv.onmouseleave=()=>{tip.style.display='none';L=drawCandles(cv,cs,null,opt)};
}
/* ---------- 分時走勢 ---------- */
function buildTick(es,ref){
  const now=nowS(),step=600;const start=Math.ceil((now-DAY)/step)*step;const n=Math.max(1,Math.ceil((now-start)/step));
  const a=es.filter(x=>x.t>=start).sort((x,y)=>x.t-y.t);
  const pts=[];let j=0,last=null,cq=0,ca=0;
  for(let i=0;i<n;i++){const t0=start+i*step,t1=t0+step;let v=0,amt=0,has=false;
    while(j<a.length&&a[j].t<t1){last=a[j].p;v+=a[j].q;amt+=a[j].p*a[j].q;has=true;j++}
    cq+=v;ca+=amt;pts.push({t:t0,p:last,v,has,avg:cq?ca/cq:null})}
  const first=a[0]?.p;return {pts,ref:ref??first??null};
}
function drawTick(cv,T,hover){
  const {g,W,H}=setupCanvas(cv);g.clearRect(0,0,W,H);
  const UP=CSSV('--up'),DN=CSSV('--down'),MU=CSSV('--muted'),GOLD=CSSV('--gold');g.font='11px '+CSSV('--mono');
  const P=T.pts;const ps=P.filter(p=>p.p!=null);
  if(!ps.length||T.ref==null){g.fillStyle=MU;g.fillText('近 24 小時沒有成交',W/2-50,H/2);return null}
  const ref=T.ref;const padL=62,padR=62,padT=12,labH=20,gap=10;const volH=Math.round(H*.2);const priceH=H-padT-labH-volH-gap;
  const vals=[ref,...ps.map(p=>p.p),...ps.map(p=>p.avg).filter(v=>v!=null)];
  let span=Math.max(...vals.map(v=>Math.abs(v-ref)))*1.15||ref*.02||1;const hi=ref+span,lo=ref-span;
  const n=P.length;const X=i=>padL+(i+.5)/n*(W-padL-padR);const Y=p=>padT+(hi-p)/(hi-lo)*priceH;
  const vTop=padT+priceH+gap;const vmax=Math.max(1,...P.map(p=>p.v));
  // 座標
  for(let k=-2;k<=2;k++){const v=ref+span/1.15*k/2;if(v<0)continue;g.strokeStyle=k?'#1a212d':'#555c6a';if(!k)g.setLineDash([4,4]);g.beginPath();g.moveTo(padL,Y(v));g.lineTo(W-padR,Y(v));g.stroke();g.setLineDash([]);
    g.fillStyle=k>0?UP:k<0?DN:MU;const tx=fmt(v);g.fillText(tx,padL-6-g.measureText(tx).width,Y(v)+4);const pc=((v/ref-1)*100);g.fillText((pc>0?'+':'')+pc.toFixed(2)+'%',W-padR+6,Y(v)+4)}
  // 漲跌區塊填色
  const path=()=>{g.beginPath();let st=false;P.forEach((p,i)=>{if(p.p==null)return;st?g.lineTo(X(i),Y(p.p)):g.moveTo(X(i),Y(p.p));st=true});};
  const fi=P.findIndex(p=>p.p!=null);
  const fillZone=(top,col)=>{g.save();g.beginPath();top?g.rect(padL,padT,W-padL-padR,Y(ref)-padT):g.rect(padL,Y(ref),W-padL-padR,padT+priceH-Y(ref));g.clip();
    path();g.lineTo(X(n-1),Y(ref));g.lineTo(X(fi),Y(ref));g.closePath();g.fillStyle=col;g.fill();g.restore()};
  fillZone(true,'#ff4d5530');fillZone(false,'#22c07a30');
  path();g.strokeStyle='#e5e7eb';g.lineWidth=1.4;g.stroke();g.lineWidth=1;
  g.beginPath();let st=false;P.forEach((p,i)=>{if(p.avg==null)return;st?g.lineTo(X(i),Y(p.avg)):g.moveTo(X(i),Y(p.avg));st=true});g.strokeStyle=GOLD;g.stroke();
  // 量
  const bw=Math.max(1,(W-padL-padR)/n-1);
  P.forEach((p,i)=>{if(!p.v)return;g.fillStyle=p.p>=ref?UP:DN;g.globalAlpha=.75;const h=p.v/vmax*volH;g.fillRect(X(i)-bw/2,vTop+volH-h,bw,h);g.globalAlpha=1});
  g.fillStyle=MU;g.fillText('量 '+fmtBig(vmax),W-padR+6,vTop+10);
  P.forEach((p,i)=>{if(i%18)return;g.fillText(tstr(p.t,false),Math.max(padL,X(i)-14),H-5)});
  g.fillStyle=MU;g.fillText('— 成交價',padL+4,padT+12);g.fillStyle=GOLD;g.fillText('— 均價',padL+70,padT+12);g.fillStyle=MU;g.fillText('--- 參考價 '+fmt(ref),padL+124,padT+12);
  if(hover!=null){const x=X(hover);g.strokeStyle='#8890a0';g.setLineDash([3,3]);g.beginPath();g.moveTo(x,padT);g.lineTo(x,vTop+volH);g.stroke();g.setLineDash([])}
  return {padL,padR,W,n};
}
function mountTick(box,es,ref){
  const cv=box.querySelector('canvas'),tip=box.querySelector('.tip');const T=buildTick(es,ref);let L=drawTick(cv,T);
  cv.onmousemove=ev=>{if(!L)return;const rc=cv.getBoundingClientRect();const i=Math.floor((ev.clientX-rc.left-L.padL)/(L.W-L.padL-L.padR)*L.n);
    const p=T.pts[i];if(!p||p.p==null){tip.style.display='none';return}L=drawTick(cv,T,i);
    tip.innerHTML=`<b>${tstr(p.t)}</b><br>成交 <span class="num ${cls(p.p-T.ref)}">${fmt(p.p)}</span> ${pct((p.p/T.ref-1)*100)}<br>均價 <span class="num" style="color:var(--gold)">${fmt(p.avg,1)}</span><br>量 <span class="num">${fmt(p.v)}</span>${p.has?'':' <span class="muted">（無成交）</span>'}`;
    tip.style.display='block';let tx=ev.clientX-rc.left+14;if(tx>rc.width-180)tx-=200;tip.style.left=tx+'px';tip.style.top='24px'};
  cv.onmouseleave=()=>{tip.style.display='none';L=drawTick(cv,T)};
}

