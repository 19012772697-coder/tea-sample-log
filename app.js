
// 茶样志 V1.2
// 核心升级：
// 1. 根据多人品评统计香气/滋味高频关键词
// 2. 样品卡显示TOP特征
// 3. 与我的品评一致绿色，不一致红色

const synonym = {
 "蜜糖香":"蜜香",
 "蜂蜜香":"蜜香",
 "蜜香":"蜜香",
 "桂圆味":"桂圆香",
 "甜润":"甜醇",
 "甜醇":"甜醇",
 "清爽":"鲜爽"
};

function normalize(word){
 return synonym[word.trim()] || word.trim();
}

function splitWords(text){
 return (text||"")
 .split(/[，,；;、\s]+/)
 .filter(Boolean)
 .map(normalize);
}

function analyze(sample){
 let aroma=[
  ...splitWords(sample.myAroma),
  ...splitWords(sample.otherAroma)
 ];
 let taste=[
  ...splitWords(sample.myTaste),
  ...splitWords(sample.otherTaste)
 ];

 function top(arr){
  let map={};
  arr.forEach(x=>map[x]=(map[x]||0)+1);
  return Object.entries(map)
   .sort((a,b)=>b[1]-a[1])
   .slice(0,2)
   .map(x=>x[0]);
 }

 return {
  aroma:top(aroma),
  taste:top(taste)
 };
}

function compare(word,myText){
 return splitWords(myText).includes(word)
 ?"green":"red";
}

// 示例数据
let demo={
 name:"CTC",
 id:"HD-1378",
 myAroma:"木香、花香",
 otherAroma:"木香、花香、果香",
 myTaste:"醇厚",
 otherTaste:"醇厚、甜醇"
};

let result=analyze(demo);

document.getElementById("content").innerHTML=`
<div class="card">
<h2>01号 ${demo.name}</h2>
<p>${demo.id}</p>
<h3>香气</h3>
<p>${result.aroma.map(x=>`<span class="${compare(x,demo.myAroma)}">${x}</span>`).join(" ")}</p>
<h3>滋味</h3>
<p>${result.taste.map(x=>`<span class="${compare(x,demo.myTaste)}">${x}</span>`).join(" ")}</p>
</div>
`;
