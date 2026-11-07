'use strict';
const D=window.PAPER150, $=id=>document.getElementById(id), fmt=(v,n=2)=>Number(v).toFixed(n);
const methods=['RGB','RAW','B_GAUSSIAN','CS_NATIVE_CONTEXT_UNION'];
const labels=['同场真彩','原始反演','高斯材料校正','本日＋历史联合校正'];
const subtitles=['地物定位','RAW','B-Gaussian · 最初方案','UNION · 当前采用方案'];
const seasons={spring:'春季',summer:'夏季',autumn:'秋季',winter:'冬季'};
const cases=new Map(D.cases.map(c=>[c.id,c])), paper=new Map(D.selected.map((id,i)=>[id,i+1]));
const query=new URLSearchParams(location.hash.slice(1));
const state={id:cases.has(query.get('case'))?query.get('case'):(D.selected[0]||D.cases[0].id),mode:query.get('mode')==='SITE'?'SITE':'DAY',zoom:1};
let visible=D.cases, sync=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const image=(c,m)=>m==='RGB'?c.images.RGB:c.images[state.mode][m];
function zoom(value,center){
 state.zoom=Number(value);$('zoom').value=state.zoom;$('zoomLabel').textContent=fmt(state.zoom,2).replace(/\.?0+$/,'')+'×';
 document.querySelectorAll('.viewport img').forEach(im=>im.style.width=100*state.zoom+'%');
 requestAnimationFrame(()=>document.querySelectorAll('.viewport').forEach(v=>{v.scrollLeft=center?center.x*v.scrollWidth-v.clientWidth/2:0;v.scrollTop=center?center.y*v.scrollHeight-v.clientHeight/2:0}));
}
function center(){const v=document.querySelector('.viewport');return v?{x:(v.scrollLeft+v.clientWidth/2)/v.scrollWidth,y:(v.scrollTop+v.clientHeight/2)/v.scrollHeight}:null}
function render(){
 const c=cases.get(state.id), keep=state.zoom>1?center():null;
 $('case').value=c.id;$('sceneIndex').textContent=c.figure_id+(paper.has(c.id)?' · 正文图 '+paper.get(c.id):'')+' · '+(c.group==='SEASONAL120'?'季节案例':'历史案例');
 $('sceneTitle').textContent=c.label+' · '+c.date+' · '+seasons[c.season];
 $('sceneMeta').textContent=c.site_id+' · '+fmt(c.lon,4)+'°E, '+fmt(c.lat,4)+'°N · 原有效覆盖 '+fmt(c.valid_fraction*100,1)+'%';
 $('panels').innerHTML=methods.map((m,i)=>{const s=c.stats[m],delta=s?s.mean-c.stats.B_GAUSSIAN.mean:0;return `<article class="panel ${i===3?'recommended':''}"><h3>${labels[i]}<span class="subtitle">${subtitles[i]}</span></h3><div class="viewport"><img src="${image(c,m)}" width="${c.width}" height="${c.height}" alt="${esc(c.label+' '+c.date+' '+labels[i])}"></div><div class="stats">${s?'全场均值 '+fmt(s.mean)+' μg/m³'+(i===3?'<br>较高斯 '+(delta>=0?'+':'')+fmt(delta,3)+' μg/m³':''):'同日地物定位背景<br>灰色为原无效像元'}</div></article>`}).join('');
 document.querySelectorAll('.viewport').forEach(v=>v.addEventListener('scroll',()=>{if(sync)return;sync=true;document.querySelectorAll('.viewport').forEach(o=>{if(o!==v){o.scrollLeft=v.scrollLeft;o.scrollTop=v.scrollTop}});requestAnimationFrame(()=>sync=false)}));
 $('colorbar').style.background='linear-gradient(90deg,'+D.colors.join(',')+')';$('range').innerHTML=c.limits[state.mode].map(n=>'<span>'+fmt(n)+'</span>').join('');
 for(const [id,key]of [['downloadPng','png'],['downloadPdf','pdf']]){$(id).hidden=!c.downloads[key];if(c.downloads[key])$(id).href=c.downloads[key]}
 const metricSpecs=[['small_mean_drop_B_to_UNION','小亮对象平均降低','μg/m³'],['nonbright_MAE_B_to_UNION','非亮区平均绝对变化','μg/m³'],['road_drop_p95_B_to_UNION','道路候选像元降低 P95','μg/m³'],['road_drop_max_B_to_UNION','道路候选像元最大降低','μg/m³']];
 const metricRows=metricSpecs.filter(([key])=>Number.isFinite(c.metrics[key]));$('metrics').hidden=!metricRows.length;
 $('metrics').innerHTML=metricRows.map(([key,label,unit])=>'<div class="metric"><span>'+label+'</span><b>'+fmt(c.metrics[key],3)+' <small>'+unit+'</small></b></div>').join('');
 $('rankNote').hidden=!c.priority_rank;$('rankNote').textContent=c.priority_rank?'正文候选顺序 '+c.priority_rank+' / 150；只用于选图，不是实测精度排名。小亮对象为地物代理；道路候选来自地图交格或锁定外观位置，不是道路PM真值。P95为0不代表所有道路候选像元均未改变。':'';
 const at=visible.indexOf(c);$('prev').disabled=at<=0;$('next').disabled=at>=visible.length-1;
 document.querySelectorAll('.card').forEach(b=>b.classList.toggle('active',b.dataset.id===c.id));
 history.replaceState(null,'','#'+new URLSearchParams({case:c.id,mode:state.mode}));zoom(state.zoom,keep);
}
function filter(){
 visible=D.cases.filter(c=>(!$('city').value||c.city===$('city').value)&&(!$('season').value||c.season===$('season').value)&&($('scope').value==='ALL'||($('scope').value==='PAPER5'?paper.has(c.id):c.group===$('scope').value)));
 if($('sort').value==='candidate')visible.sort((a,b)=>(a.priority_rank||999)-(b.priority_rank||999));
 $('count').textContent=visible.length+' / 150 场';$('viewer').hidden=!visible.length;$('empty').hidden=!!visible.length;$('case').disabled=!visible.length;
 $('case').innerHTML=visible.map(c=>`<option value="${c.id}">${c.figure_id} · ${esc(c.label)} · ${c.date}${paper.has(c.id)?' · 正文'+paper.get(c.id):''}</option>`).join('');
 $('cards').innerHTML=visible.map(c=>`<button class="card" data-id="${c.id}">${paper.has(c.id)?'<span class="paperbadge">正文图 '+paper.get(c.id)+'</span>':''}<img loading="lazy" src="${c.images.RGB}" width="${c.width}" height="${c.height}" alt="${esc(c.label+' '+c.date+' 真彩')}"><span class="caption"><strong>${c.figure_id} · ${esc(c.label)}</strong><small>${c.date} · ${seasons[c.season]}</small><small>${esc(c.site_id)}</small></span></button>`).join('');
 document.querySelectorAll('.card').forEach(b=>b.onclick=()=>{state.id=b.dataset.id;state.zoom=1;render();$('viewer').scrollIntoView({behavior:'smooth',block:'start'})});
 if(!visible.length){$('prev').disabled=$('next').disabled=true;return}
 if(!visible.some(c=>c.id===state.id))state.id=visible[0].id;render();
}
function clear(){for(const id of ['city','season'])$(id).value='';$('scope').value='ALL';state.zoom=1;filter()}
$('city').innerHTML+=[...new Set(D.cases.map(c=>c.city))].sort((a,b)=>a.localeCompare(b,'zh-CN')).map(city=>'<option>'+esc(city)+'</option>').join('');
$('mode').value=state.mode;
for(const id of ['city','season','scope','sort'])$(id).onchange=()=>{state.zoom=1;filter()};
$('clear').onclick=clear;$('case').onchange=()=>{state.id=$('case').value;state.zoom=1;render()};
$('mode').onchange=()=>{state.mode=$('mode').value;render()};
$('zoom').oninput=e=>zoom(e.target.value,center());$('reset').onclick=()=>zoom(1);
for(const [id,step]of [['prev',-1],['next',1]])$(id).onclick=()=>{state.id=visible[visible.indexOf(cases.get(state.id))+step].id;state.zoom=1;render()};
$('paperSection').hidden=!D.selected.length;$('paperOption').hidden=!D.selected.length;
$('candidateOption').hidden=!D.cases.some(c=>c.priority_rank);
$('paperCases').innerHTML=D.selected.map((id,i)=>'<button data-case="'+id+'">'+(i+1)+' · '+esc(cases.get(id).label)+' · '+cases.get(id).date+'</button>').join('');
document.querySelectorAll('#paperCases button').forEach(b=>b.onclick=()=>{state.id=b.dataset.case;clear();$('viewer').scrollIntoView({behavior:'smooth',block:'start'})});
filter();
