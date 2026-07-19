const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const DEFAULT_CATS=['红茶','绿茶','乌龙茶','白茶','黄茶','黑茶','花茶','茶叶通用'];
const TERMS={
aroma:['高香','高强','鲜爽','嫩香','鲜嫩','馥郁','浓郁','清香','清高','甜香','花香','花蜜香','果香','木香','地域香','松烟香','陈香','板栗香','奶香','酵香','桂圆香','祁门香','麦芽香','焦糖香','青气'],
taste:['厚度','浓度','涩','苦','浓','厚','醇','滑','回甘','浓厚','醇厚','浓醇','甘醇','甜醇','鲜醇','醇爽','清醇','醇正','平和','淡薄','青涩','青味','熟闷味','淡水味','高山韵','陈醇','岩韵','音韵','浓强','浓甜','浓涩','桂圆汤味']
};
let db,currentBatch=null,currentSample=null,photoData='';
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open('TeaSampleLogDB',1);r.onupgradeneeded=e=>{const d=e.target.result;d.createObjectStore('batches',{keyPath:'id'});d.createObjectStore('samples',{keyPath:'id'});d.createObjectStore('settings',{keyPath:'key'})};r.onsuccess=()=>{db=r.result;res(db)};r.onerror=()=>rej(r.error)})}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function put(store,obj){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(obj);r.onsuccess=()=>res(obj);r.onerror=()=>rej(r.error)})}
function getAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function del(store,id){return new Promise((res,rej)=>{const r=tx(store,'readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function dateText(ts){return new Date(ts).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function normalizeTerm(v=''){const map={'蜂蜜香':'蜜香','蜜糖香':'蜜香','蜂蜜味':'蜜香','蜜甜香':'蜜香','花果香':'花果香','果花香':'花果香','桂圆味':'桂圆香','龙眼香':'桂圆香','龙眼味':'桂圆香','桂圆汤':'桂圆香','甜润':'甜醇','入口甜':'甜醇','甘甜':'甜醇','醇滑':'顺滑','丝滑':'顺滑','收敛感':'涩','涩感':'涩','苦感':'苦','鲜甜':'鲜爽','鲜醇':'鲜爽'};let x=String(v).trim().replace(/^(明显|具有|带有|带|呈现|略有|微有|较|很)/,'').replace(/(明显|突出|浓郁|较强|持久|纯正|显著|较弱|轻微)$/,'').trim();return map[x]||x}
function extractTerms(text,type){const vocab=[...TERMS[type],...(type==='aroma'?['花果香','兰花香','玫瑰香','熟果香','柑橘香','松烟香','陈香','火香','烘焙香','青气','陈气','酸馊气']:['甘甜','甜润','收敛感','鲜甜','鲜醇','饱满','柔和','爽口','浓强','淡薄','粗涩','酸','咸'])];const raw=String(text||'').replace(/[。！？!?：:\n]/g,'、');const found=[];for(const term of vocab){if(raw.includes(term))found.push(normalizeTerm(term))}for(const part of raw.split(/[，,、；;\/|\s]+/)){const n=normalizeTerm(part);if(n&&n.length<=8&&!/^(香气|滋味|口感|汤感|明显|一般|无|没有)$/.test(n))found.push(n)}return [...new Set(found)]}
function compareFields(mine,other,type){const m=extractTerms(mine,type),o=extractTerms(other,type);return {common:m.filter(x=>o.includes(x)),missing:o.filter(x=>!m.includes(x))}}

// V1.2 全意见凝练版
// 规则：
// 1. 香气与滋味分开分析。
// 2. 有重复术语时，显示所有并列最高频术语。
// 3. 所有术语频率都为1时，不只显示第一个，而是基于全部意见进行凝练。
// 4. 凝练会统一同义词、去掉重复和被更具体词包含的泛化词。
// 5. 与“我的品评”一致显示绿色，否则显示红色。
function splitOpinionTexts(text=''){
  return String(text||'')
    .split(/[\n；;。！？!?]+/)
    .map(x=>x.trim())
    .filter(Boolean);
}

const featureSynonyms={
  '蜜糖香':'蜜香','蜂蜜香':'蜜香','蜂蜜味':'蜜香',
  '桂圆味':'桂圆香','龙眼香':'桂圆香','龙眼味':'桂圆香',
  '木质香':'木香','木头香':'木香',
  '焦糖味':'焦糖香','焦香味':'焦香',
  '果味':'果香','花味':'花香',
  '甜润':'甜醇','入口甜':'甜醇','甜味':'甜醇',
  '清爽':'鲜爽','鲜活':'鲜爽',
  '涩感':'涩','收敛感':'涩',
  '苦味':'苦','酸味':'酸',
  '回甜':'回甘'
};

function normalizeFeatureTerm(term){
  const raw=String(term||'').trim();
  if(!raw) return '';
  return featureSynonyms[raw]||raw;
}

// 以全部提示词为基础凝练：
// - 同义词归一
// - 去重
// - 若存在“花果香”等更具体复合词，避免同时保留完全被其涵盖的“花香/果香”
// - 保留所有互不重复、互不包含的代表词，而不是只取第一个
function condenseAllTerms(terms){
  const normalized=[];
  const seen=new Set();

  terms.forEach(term=>{
    const t=normalizeFeatureTerm(term);
    if(t&&!seen.has(t)){
      seen.add(t);
      normalized.push(t);
    }
  });

  const compounds=[
    ['花果香',['花香','果香']],
    ['蜜果香',['蜜香','果香']],
    ['甜花香',['甜香','花香']],
    ['烟熏香',['烟香','熏香']]
  ];

  const result=[...normalized];
  compounds.forEach(([compound,parts])=>{
    if(result.includes(compound)){
      parts.forEach(part=>{
        const i=result.indexOf(part);
        if(i>=0) result.splice(i,1);
      });
    }
  });

  return result;
}

function consensusFeature(texts,type){
  const counts=new Map();
  const firstOrder=new Map();
  let order=0;
  const allTerms=[];

  texts.forEach(text=>{
    const opinions=splitOpinionTexts(text);
    opinions.forEach(opinion=>{
      const terms=[...new Set(extractTerms(opinion,type).map(normalizeFeatureTerm).filter(Boolean))];
      terms.forEach(term=>{
        allTerms.push(term);
        if(!firstOrder.has(term)) firstOrder.set(term,order++);
        counts.set(term,(counts.get(term)||0)+1);
      });
    });
  });

  if(!counts.size) return [];

  const ranked=[...counts.entries()]
    .map(([term,count])=>({term,count,order:firstOrder.get(term)}))
    .sort((a,b)=>b.count-a.count||a.order-b.order);

  const max=ranked[0].count;

  // 存在真正的高频词：显示全部并列最高频词
  if(max>1){
    return ranked
      .filter(x=>x.count===max)
      .sort((a,b)=>a.order-b.order)
      .map(x=>x.term);
  }

  // 没有重复词：使用全部提示词凝练，而不是只显示第一个
  return condenseAllTerms(allTerms);
}

function myFeatureSet(myText,type){
  return new Set(
    extractTerms(myText,type)
      .map(normalizeFeatureTerm)
      .filter(Boolean)
  );
}

function featureColor(term,myText,type){
  return myFeatureSet(myText,type).has(normalizeFeatureTerm(term))
    ?'featureMatch'
    :'featureMiss';
}

function featureTags(terms,myText,type){
  if(!terms.length) return '<span class="featureEmpty">暂无</span>';
  return terms
    .map(t=>`<span class="featureTag ${featureColor(t,myText,type)}">${esc(t)}</span>`)
    .join('');
}

function renderResultTags(id,items,missing=false){const el=$('#'+id);el.innerHTML=items.length?items.map(x=>`<span class="resultTag${missing?' missing':''}">${esc(x)}</span>`).join(''):'<span class="resultEmpty">无</span>'}
function showComparison(sample){const a=compareFields(sample.myAroma,sample.otherAroma,'aroma'),t=compareFields(sample.myTaste,sample.otherTaste,'taste');renderResultTags('commonAroma',a.common);renderResultTags('missingAroma',a.missing,true);renderResultTags('commonTaste',t.common);renderResultTags('missingTaste',t.missing,true);$('#compareModal').classList.remove('hidden')}
function hideComparison(){$('#compareModal').classList.add('hidden')}
async function getCats(){const all=await getAll('settings');const s=all.find(x=>x.key==='categories');return s?.value||DEFAULT_CATS}
async function renderCats(){const cats=await getCats();$('#teaCategory').innerHTML=cats.map(c=>`<option>${esc(c)}</option>`).join('');$('#categoryList').innerHTML=cats.map(c=>`<span class="tag">${esc(c)} ${DEFAULT_CATS.includes(c)?'':`<button data-delcat="${esc(c)}">×</button>`}</span>`).join('');$$('[data-delcat]').forEach(b=>b.onclick=async()=>{const n=b.dataset.delcat;await put('settings',{key:'categories',value:cats.filter(x=>x!==n)});renderCats()})}
function go(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('nav button').forEach(b=>b.classList.toggle('active',b.dataset.go===id));if(id==='home')renderHome();if(id==='history')renderHistory();if(id==='settings')renderCats();scrollTo(0,0)}
$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
async function renderHome(){const bs=(await getAll('batches')).sort((a,b)=>b.createdAt-a.createdAt), ss=await getAll('samples');$('#batchCount').textContent=bs.length;$('#sampleCount').textContent=ss.length;const t=new Date().toDateString();$('#todayCount').textContent=ss.filter(s=>new Date(s.createdAt).toDateString()===t).length;const box=$('#recentBatches');if(!bs.length){box.className='cards empty';box.textContent='暂无记录';return}box.className='cards';box.innerHTML=bs.slice(0,8).map(b=>{const n=ss.filter(s=>s.batchId===b.id).length;return `<article class="card" data-batch="${b.id}"><div class="grow"><h3>${esc(b.name)}</h3><p>${esc(b.category)} · ${dateText(b.createdAt)} · ${n}个样品</p></div><b>›</b></article>`}).join('');$$('[data-batch]').forEach(x=>x.onclick=()=>openBatch(x.dataset.batch))}
$('#batchForm').onsubmit=async e=>{e.preventDefault();const b={id:uid(),name:$('#batchName').value.trim(),category:$('#teaCategory').value,place:$('#batchPlace').value.trim(),note:$('#batchNote').value.trim(),createdAt:Date.now()};await put('batches',b);e.target.reset();openBatch(b.id)};
async function openBatch(id){const bs=await getAll('batches');currentBatch=bs.find(b=>b.id===id);if(!currentBatch)return;$('#detailTitle').textContent=currentBatch.name;$('#detailMeta').textContent=`${currentBatch.category} · ${dateText(currentBatch.createdAt)}${currentBatch.place?' · '+currentBatch.place:''}`;await renderSamples();go('batchDetail')}
async function renderSamples(){
const all=(await getAll('samples')).filter(s=>s.batchId===currentBatch.id).sort((a,b)=>a.order-b.order);
const box=$('#sampleList');
if(!all.length){box.className='cards empty';box.textContent='暂无样品';return}
box.className='cards sortable';
box.innerHTML=all.map(s=>{
const aroma=(s.scores?.aroma||[]).filter(x=>x.score>5).map(x=>x.type);
const taste=(s.scores?.taste||[]).filter(x=>x.score>5).map(x=>x.type);
return `<article class="card draggable" draggable="true" data-sample="${s.id}">
${s.photo?`<img src="${s.photo}">`:'<div class="placeholder"></div>'}
<div class="grow"><h3>${String(s.order).padStart(2,'0')}号 ${esc(s.name||'未命名样品')}</h3>
<p>${esc(s.code||'无编号')}</p>
<p class="featureTitle">香气：${aroma.map(x=>`<span class="featureTag featureMatch">${esc(x)}</span>`).join(' ')||'—'}</p>
<p class="featureTitle">滋味：${taste.map(x=>`<span class="featureTag featureMatch">${esc(x)}</span>`).join(' ')||'—'}</p>
</div><b>›</b></article>`
}).join('');
let drag=null, touchStartY=0, touchTarget=null;
async function reorderFromDOM(){
 const ids=[...box.children].map(x=>x.dataset.sample);
 await saveOrder(ids.map((id,i)=>({id,order:i+1})));
 await renderSamples();
}
$$('.draggable').forEach(el=>{
 el.ondragstart=()=>drag=el;
 el.ondragover=e=>e.preventDefault();
 el.ondrop=async()=>{if(drag&&drag!==el){const arr=[...box.children];let a=arr.indexOf(drag),b=arr.indexOf(el);box.insertBefore(drag,a<b?el:el.nextSibling);await reorderFromDOM();}};
 // iPhone touch drag
 el.addEventListener('touchstart',e=>{touchTarget=el;touchStartY=e.touches[0].clientY;el.classList.add('dragging')},{passive:true});
 el.addEventListener('touchmove',e=>{
   if(!touchTarget)return;
   const y=e.touches[0].clientY;
   const target=document.elementFromPoint(e.touches[0].clientX,y)?.closest('.draggable');
   if(target&&target!==touchTarget){
     const rect=target.getBoundingClientRect();
     if(y<rect.top+rect.height/2) box.insertBefore(touchTarget,target);
     else box.insertBefore(touchTarget,target.nextSibling);
   }
   e.preventDefault();
 },{passive:false});
 el.addEventListener('touchend',async()=>{if(touchTarget){touchTarget.classList.remove('dragging');touchTarget=null;await reorderFromDOM();}});
 el.onclick=()=>editSample(el.dataset.sample)
});
}
async function saveOrder(list){const all=await getAll('samples');for(const x of list){let s=all.find(a=>a.id===x.id);if(s){s.order=x.order;await put('samples',s)}}}
$('#addSampleBtn').onclick=()=>editSample();$('#sampleBack').onclick=()=>openBatch(currentBatch.id);
async function editSample(id){const all=await getAll('samples');currentSample=id?all.find(s=>s.id===id):null;const order=currentSample?.order||all.filter(s=>s.batchId===currentBatch.id).length+1;$('#sampleTitle').textContent=`${String(order).padStart(2,'0')}号样品`;for(const [k,id2] of Object.entries({name:'sampleName',code:'sampleCode',company:'sampleCompany',myAroma:'myAroma',myTaste:'myTaste',note:'sampleNote'}))$('#'+id2).value=currentSample?.[k]||'';photoData=currentSample?.photo||'';buildScoreList();showPhoto();$('#deleteSampleBtn').style.display=currentSample?'block':'none';go('sampleEdit')}
function showPhoto(){const im=$('#samplePreview'),hint=$('#photoHint');if(photoData){im.src=photoData;im.style.display='block';hint.style.display='none'}else{im.removeAttribute('src');im.style.display='none';hint.style.display='block'}}
$('#samplePhoto').onchange=async e=>{const f=e.target.files[0];if(!f)return;photoData=await compressImage(f);showPhoto()};
function compressImage(file){return new Promise((res,rej)=>{const img=new Image,fr=new FileReader;fr.onload=()=>img.src=fr.result;fr.onerror=rej;img.onload=()=>{const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=img.width*scale;c.height=img.height*scale;c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.72))};fr.readAsDataURL(file)})}
$('#sampleForm').onsubmit=async e=>{e.preventDefault();const existing=await getAll('samples'),order=currentSample?.order||existing.filter(s=>s.batchId===currentBatch.id).length+1;const s={id:currentSample?.id||uid(),batchId:currentBatch.id,order,photo:photoData,name:$('#sampleName').value.trim(),code:$('#sampleCode').value.trim(),company:$('#sampleCompany').value.trim(),myAroma:$('#myAroma').value.trim(),myTaste:$('#myTaste').value.trim(),scores:collectScores(),note:$('#sampleNote').value.trim(),createdAt:currentSample?.createdAt||Date.now(),updatedAt:Date.now()};await put('samples',s);currentSample=s;openBatch(currentBatch.id)};
$('#deleteSampleBtn').onclick=async()=>{if(currentSample&&confirm('确定删除这个样品吗？')){await del('samples',currentSample.id);openBatch(currentBatch.id)}};

function buildScoreList(){
 const make=(id,type,defaults)=>{
  const box=$('#'+id); if(!box)return;
  if(box.children.length)return;
  defaults.forEach(t=>addScoreRow(id,type,t));
 };
 make('aromaScoreList','aroma',['花香','蜜香','果香']);
 make('tasteScoreList','taste',['厚度','浓度','涩','苦']);
}
function addScoreRow(id,type='',preset=''){
 const box=$('#'+id);if(!box)return;
 const row=document.createElement('div');row.className='scoreRow';
 const terms=TERMS[id.includes('aroma')?'aroma':'taste'];
 row.innerHTML=`<input class="customType" placeholder="类型（可选择或自定义）" value="${esc(preset)}"><input class="scoreInput" type="number" min="0" max="10" value="0">`;
 box.appendChild(row);
}
function addCustomScore(type){
 const id=type==='aroma'?'aromaScoreList':'tasteScoreList';
 addScoreRow(id,type,'');
}
function collectScores(){
 const read=id=>[...document.querySelectorAll('#'+id+' .scoreRow')].map(r=>({type:(r.querySelector('.customType')?.value.trim()||r.querySelector('select').value),score:Number(r.querySelector('input[type="number"]').value)}));
 return {aroma:read('aromaScoreList'),taste:read('tasteScoreList')};
}
function makeChips(){for(const box of $$('.chips')){const type=box.dataset.target.toLowerCase().includes('aroma')?'aroma':'taste';box.innerHTML=TERMS[type].map(t=>`<button type="button" class="chip">${t}</button>`).join('');box.querySelectorAll('button').forEach(b=>b.onclick=()=>{const ta=$('#'+box.dataset.target),parts=ta.value.split(/[，,、；;\s]+/).filter(Boolean);if(!parts.includes(b.textContent))parts.push(b.textContent);ta.value=parts.join('、')})}}makeChips();
async function renderHistory(){const q=$('#searchInput').value.trim().toLowerCase(), bs=await getAll('batches'), ss=(await getAll('samples')).sort((a,b)=>b.createdAt-a.createdAt).filter(s=>!q||[s.name,s.code,s.company,s.myAroma,s.myTaste,s.otherAroma,s.otherTaste,s.note].join(' ').toLowerCase().includes(q));const box=$('#historyList');if(!ss.length){box.className='cards empty';box.textContent='没有匹配记录';return}box.className='cards';box.innerHTML=ss.map(s=>{const b=bs.find(x=>x.id===s.batchId);return `<article class="card" data-hsample="${s.id}" data-hbatch="${s.batchId}">${s.photo?`<img src="${s.photo}">`:'<div style="width:68px;height:68px;border-radius:12px;background:#eee"></div>'}<div class="grow"><h3>${esc(s.name||String(s.order).padStart(2,'0')+'号样品')}</h3><p>${esc(b?.name||'未知批次')} · ${esc(s.company||s.code||'')}</p></div><b>›</b></article>`}).join('');$$('[data-hsample]').forEach(x=>x.onclick=async()=>{await openBatch(x.dataset.hbatch);editSample(x.dataset.hsample)})}
$('#searchInput').oninput=renderHistory;
function csvCell(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}
async function exportCSV(batchId){const bs=await getAll('batches'), all=await getAll('samples'), ss=batchId?all.filter(s=>s.batchId===batchId):all;const head=['批次','日期','茶类','顺序号','样品名称','样品编号','公司','我的香气','我的滋味','他人香气','他人滋味','共同香气','未品出香气','共同滋味','未品出滋味','备注'];const rows=ss.sort((a,b)=>a.createdAt-b.createdAt).map(s=>{const b=bs.find(x=>x.id===s.batchId)||{};const ca=compareFields(s.myAroma,s.otherAroma,'aroma'),ct=compareFields(s.myTaste,s.otherTaste,'taste');return [b.name,dateText(s.createdAt),b.category,s.order,s.name,s.code,s.company,s.myAroma,s.myTaste,s.otherAroma,s.otherTaste,ca.common.join('、'),ca.missing.join('、'),ct.common.join('、'),ct.missing.join('、'),s.note]});download('\ufeff'+[head,...rows].map(r=>r.map(csvCell).join(',')).join('\n'),batchId?`${currentBatch.name}.csv`:'茶样志-全部记录.csv','text/csv;charset=utf-8')}
function download(data,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#exportBatchBtn').onclick=()=>exportCSV(currentBatch.id);$('#exportAllBtn').onclick=()=>exportCSV();
$('#backupBtn').onclick=async()=>download(JSON.stringify({version:1,batches:await getAll('batches'),samples:await getAll('samples'),settings:await getAll('settings')},null,2),`茶样志备份-${new Date().toISOString().slice(0,10)}.json`,'application/json');
$('#restoreInput').onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());for(const x of data.batches||[])await put('batches',x);for(const x of data.samples||[])await put('samples',x);for(const x of data.settings||[])await put('settings',x);alert('恢复完成');renderHome()}catch{alert('备份文件无法读取')}};
$('#clearBtn').onclick=async()=>{if(!confirm('此操作会删除全部批次、样品和照片，确定继续吗？'))return;for(const s of ['batches','samples','settings'])await new Promise((res,rej)=>{const r=tx(s,'readwrite').clear();r.onsuccess=res;r.onerror=rej});await renderCats();renderHome();alert('已清空')};
$('#addCategoryBtn').onclick=async()=>{const n=$('#newCategory').value.trim();if(!n)return;const c=await getCats();if(!c.includes(n))c.push(n);await put('settings',{key:'categories',value:c});$('#newCategory').value='';renderCats()};
$('#ocrBtn').onclick=async()=>{if(!photoData)return alert('请先拍摄或选择样品袋照片');$('#ocrStatus').textContent='正在加载识别组件…';try{if(!window.Tesseract){await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)})}$('#ocrStatus').textContent='正在识别，请保持页面打开…';const r=await Tesseract.recognize(photoData,'chi_sim+eng');const text=r.data.text.trim();$('#sampleNote').value=($('#sampleNote').value?$('#sampleNote').value+'\n':'')+'【包装识别文字】\n'+text;const lines=text.split(/\n/).map(x=>x.trim()).filter(x=>x.length>1);if(!$('#sampleCode').value){const code=lines.find(x=>/[A-Z0-9-]{4,}/i.test(x));if(code)$('#sampleCode').value=code.slice(0,40)}if(!$('#sampleCompany').value){const co=lines.find(x=>/(公司|茶业|集团|合作社)/.test(x));if(co)$('#sampleCompany').value=co.slice(0,40)}if(!$('#sampleName').value){const nm=lines.find(x=>/(红茶|绿茶|乌龙|小种|金骏眉|工夫|茶)/.test(x)&&!/(公司|茶业)/.test(x));if(nm)$('#sampleName').value=nm.slice(0,30)}$('#ocrStatus').textContent='识别完成，请检查并修改结果'}catch(e){$('#ocrStatus').textContent='识别失败，请检查网络或手动填写';alert('OCR 组件未能加载。你仍可手动填写名称、编号和公司。')}};
let deferred;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('#installBtn').classList.remove('hidden')});$('#installBtn').onclick=async()=>{if(deferred){deferred.prompt();deferred=null}else alert('在 iPhone Safari 中，请点击“分享”→“添加到主屏幕”')};
$('#closeCompareBtn').onclick=()=>{hideComparison();openBatch(currentBatch.id)};$('#compareDoneBtn').onclick=()=>{hideComparison();openBatch(currentBatch.id)};$('#compareModal').onclick=e=>{if(e.target.id==='compareModal'){hideComparison();openBatch(currentBatch.id)}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js');
(async()=>{await openDB();await renderCats();await renderHome()})();

$('#addAromaBtn')?.addEventListener('click',()=>addScoreRow('aromaScoreList','aroma'));
$('#addTasteBtn')?.addEventListener('click',()=>addScoreRow('tasteScoreList','taste'));

document.addEventListener('DOMContentLoaded',()=>{
 const a=document.querySelector('#addAromaBtn');
 const t=document.querySelector('#addTasteBtn');
 if(a)a.onclick=()=>addCustomScore('aroma');
 if(t)t.onclick=()=>addCustomScore('taste');
});
