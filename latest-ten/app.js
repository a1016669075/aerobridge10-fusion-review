const D=window.REVIEW, $=id=>document.getElementById(id), fmt=(n,d=2)=>Number(n).toFixed(d);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lookup=new Map(D.cases.map(c=>[c.id,c])), presets=new Map(D.presets.map(p=>[p.case,p]));
const params=new URLSearchParams(location.hash.slice(1));
const state={id:lookup.has(params.get('case'))?params.get('case'):D.cases[0].id, method:D.methods[params.get('method')]?params.get('method'):'CS_CONSISTENT_STATE', mode:params.get('mode')==='SITE'?'SITE':'DAY',zoom:1};
const choices=D.method_order.filter(m=>!['RAW','B_GAUSSIAN',D.recommended].includes(m));
if(!choices.includes(state.method))state.method='CS_CONSISTENT_STATE';
let visible=D.cases, scrollLock=false;
const path=(c,m)=>D.asset_base+'tiles/'+c.id+'/'+(m==='RGB'?'RGB.png':state.mode+'_'+m+'.png');
const methodName=m=>m==='RGB'?'同场真彩':D.methods[m].name;
function panels(){return ['RGB','RAW','B_GAUSSIAN',state.method,D.recommended]}
function zoom(z,center){
 state.zoom=z;document.querySelectorAll('.viewport img').forEach(im=>im.style.width=(100*z)+'%');
 document.querySelectorAll('[data-zoom]').forEach(b=>b.classList.toggle('on',+b.dataset.zoom===z));
 requestAnimationFrame(()=>{document.querySelectorAll('.viewport').forEach(v=>{v.scrollLeft=center?center.cx*v.scrollWidth-v.clientWidth/2:0;v.scrollTop=center?center.cy*v.scrollHeight-v.clientHeight/2:0})});
}
function render(){
 const c=lookup.get(state.id), n=D.cases.indexOf(c)+1, p=presets.get(c.id);
 const previous=document.querySelector('.viewport'), center=previous&&state.zoom>1?{cx:(previous.scrollLeft+previous.clientWidth/2)/previous.scrollWidth,cy:(previous.scrollTop+previous.clientHeight/2)/previous.scrollHeight}:null;
 $('case').value=c.id;$('method').value=state.method;$('mode').value=state.mode;
 $('sceneTitle').textContent=String(n).padStart(2,'0')+' · '+c.title;
 $('sceneMeta').textContent=fmt(c.lon,4)+'°E, '+fmt(c.lat,4)+'°N · 原生10米 · 原有效覆盖 '+fmt(c.valid_fraction*100,1)+'%';
 $('panels').innerHTML=panels().map((m,i)=>{const s=c.stats[m],f=c.focus?.cached_pm_mean[m];return `<div class="panel ${i===4?'recommended':''}"><h3>${esc(methodName(m))}${m==='B_GAUSSIAN'?'<br><span class="subtitle">B-Gaussian · 最初方案</span>':''}${i===4?'<br><span class="tag">当前推荐 · 最新主方案</span>':''}</h3><div class="viewport"><img src="${path(c,m)}" alt="${esc(c.title+' · '+methodName(m))}"></div><div class="stats">${s?'全场均值 '+fmt(s.mean)+' μg/m³'+(m!=='RAW'&&m!=='B_GAUSSIAN'?'<br>较高斯全场均值 '+(s.delta_mean>=0?'+':'')+fmt(s.delta_mean,3):''):'同日地物定位背景'}${f!==undefined?'<br><span class="focus-stat">固定关注位置 '+fmt(f)+' μg/m³</span>':''}</div></div>`}).join('');
 document.querySelectorAll('.viewport').forEach(v=>v.addEventListener('scroll',()=>{if(scrollLock)return;scrollLock=true;document.querySelectorAll('.viewport').forEach(o=>{if(o!==v){o.scrollLeft=v.scrollLeft;o.scrollTop=v.scrollTop}});requestAnimationFrame(()=>scrollLock=false)}));
 $('selectionNote').textContent=D.selection_notes[c.id];
 $('range').innerHTML=c.limits[state.mode].map(x=>'<span>'+fmt(x)+'</span>').join('');
 $('colorbar').style.background='linear-gradient(90deg,'+D.colors.join(',')+')';
 $('gaussianInfo').textContent=D.methods.B_GAUSSIAN.description;
 $('middleName').textContent=methodName(state.method);$('middleInfo').textContent=D.methods[state.method].description;
 $('latestInfo').textContent=D.methods[D.recommended].description;
 $('fullFigure').href=D.asset_base+c.full_figure;
 $('cropFigure').hidden=!c.crop_figure;if(c.crop_figure)$('cropFigure').href=D.asset_base+c.crop_figure;
 $('focus').disabled=p.zoom===1;
 const idx=visible.indexOf(c);$('prev').disabled=idx<=0;$('next').disabled=idx>=visible.length-1;
 document.querySelectorAll('.card').forEach(b=>b.classList.toggle('active',b.dataset.id===c.id));
 history.replaceState(null,'','#'+new URLSearchParams({case:state.id,method:state.method,mode:state.mode}));
 zoom(state.zoom,center);
}
function filter(){
 visible=D.cases.filter(c=>!$('city').value||c.display_city===$('city').value);
 $('case').innerHTML=visible.map(c=>`<option value="${c.id}">${String(D.cases.indexOf(c)+1).padStart(2,'0')} · ${esc(c.title)}</option>`).join('');
 $('cards').innerHTML=visible.map(c=>`<button class="card" data-id="${c.id}"><img src="${path(c,'RGB')}" loading="lazy" alt="${esc(c.title)}真彩"><span class="caption"><strong>${String(D.cases.indexOf(c)+1).padStart(2,'0')} · ${esc(c.title)}</strong><small>${esc(presets.get(c.id).name.replace(/^\d+ /,''))}</small></span></button>`).join('');
 $('count').textContent=visible.length+' / 10 场';
 document.querySelectorAll('.card').forEach(b=>b.onclick=()=>{state.id=b.dataset.id;state.zoom=1;render();$('sceneTitle').scrollIntoView({behavior:'smooth',block:'start'})});
 if(!visible.some(c=>c.id===state.id))state.id=visible[0].id;
 render();
}
$('city').innerHTML+=[...new Set(D.cases.map(c=>c.display_city))].map(c=>`<option>${esc(c)}</option>`).join('');
$('method').innerHTML=choices.map(m=>`<option value="${m}">${esc(methodName(m))}</option>`).join('');
$('city').onchange=()=>{state.zoom=1;filter()};
$('case').onchange=()=>{state.id=$('case').value;state.zoom=1;render()};
$('method').onchange=()=>{state.method=$('method').value;render()};
$('mode').onchange=()=>{state.mode=$('mode').value;render()};
for(const [id,delta]of [['prev',-1],['next',1]])$(id).onclick=()=>{state.id=visible[visible.indexOf(lookup.get(state.id))+delta].id;state.zoom=1;render()};
document.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>zoom(+b.dataset.zoom));
$('focus').onclick=()=>zoom(4,presets.get(state.id));
$('downloadCurrent').onclick=async()=>{
 const c=lookup.get(state.id), ims=[...document.querySelectorAll('.viewport img')];
 await Promise.all(ims.map(im=>im.decode()));
 const canvas=document.createElement('canvas');canvas.width=2700;canvas.height=760;const x=canvas.getContext('2d');
 x.fillStyle='white';x.fillRect(0,0,canvas.width,canvas.height);x.fillStyle='#173043';x.font='bold 32px Microsoft YaHei';x.fillText(c.title+' · 同范围、同色限对比',30,45);
 x.imageSmoothingEnabled=false;
 panels().forEach((m,i)=>{const px=30+i*535;x.font='22px Microsoft YaHei';x.fillText(methodName(m)+(i===4?'（当前推荐）':''),px,100);x.drawImage(ims[i],px,125,500,500)});
 const grad=x.createLinearGradient(700,0,1900,0);D.colors.forEach((col,i)=>grad.addColorStop(i/(D.colors.length-1),col));x.fillStyle=grad;x.fillRect(700,655,1200,20);
 x.fillStyle='#173043';x.font='22px Microsoft YaHei';x.fillText(fmt(c.limits[state.mode][0]),700,704);x.fillText(fmt(c.limits[state.mode][1]),1850,704);x.fillText('PM₂.₅ / μg/m³ · 灰色为原无效像元',1000,737);
 canvas.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=c.id+'_five_method_comparison.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000)});
};
filter();
