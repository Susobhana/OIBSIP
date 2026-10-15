(() => {
"use strict";

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const STORAGE = {history:"calcStudio.history", theme:"calcStudio.theme", memory:"calcStudio.memory"};

const state = {
  expression: "",
  result: "0",
  lastResult: null,
  memory: Number(localStorage.getItem(STORAGE.memory) || 0),
  angle: "DEG",
  mode: "standard",
  history: loadJSON(STORAGE.history, []),
  historyFilter: "all",
  theme: localStorage.getItem(STORAGE.theme) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
};

function loadJSON(key, fallback){ try { const v=JSON.parse(localStorage.getItem(key)); return Array.isArray(v)?v:fallback; } catch { return fallback; } }
function save(){ localStorage.setItem(STORAGE.history, JSON.stringify(state.history.slice(0,100))); localStorage.setItem(STORAGE.memory, String(state.memory)); }
function setTheme(t){ state.theme=t; document.documentElement.dataset.theme=t; localStorage.setItem(STORAGE.theme,t); $("#themeBtn").textContent=t==="dark"?"☾":"☼"; }
setTheme(state.theme);

const expressionEl=$("#expression"), resultEl=$("#result"), historyList=$("#historyList"), historyCount=$("#historyCount"), toastEl=$("#toast"), liveHint=$("#liveHint");
let sessionOps=0, sessionStreak=0;

function toast(msg){ toastEl.textContent=msg; toastEl.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove("show"),1700); }
function renderDisplay(){
  expressionEl.textContent=state.expression || "";
  resultEl.textContent=state.result;
  expressionEl.scrollLeft=expressionEl.scrollWidth;
  resultEl.scrollLeft=resultEl.scrollWidth;
  $("#memoryStatus").hidden = Math.abs(state.memory) < 1e-15;
  $("#modeStatus").textContent=state.mode.toUpperCase();
  if(liveHint){ liveHint.textContent = state.expression ? (state.result.startsWith("Cannot") || state.result.startsWith("Invalid") ? "Needs a little cleanup" : "Live preview · press Enter to save") : "Ready · type to calculate"; }
  $("#sessionCount")?.replaceChildren(String(sessionOps));
  $("#sessionStreak")?.replaceChildren(String(sessionStreak));
}
function formatResult(n){
  if (!Number.isFinite(n)) return "Cannot divide by zero";
  if (Math.abs(n) < 1e-12) n=0;
  const rounded=Number.parseFloat(n.toPrecision(14));
  return new Intl.NumberFormat("en-US",{maximumFractionDigits:12,useGrouping:true}).format(rounded);
}
function rawResult(n){ return Number.parseFloat(Number(n).toPrecision(14)); }

class Parser {
  constructor(text){ this.text=text.replaceAll("×","*").replaceAll("÷","/").replaceAll("−","-").replace(/\s+/g,""); this.i=0; }
  peek(){ return this.text[this.i] || ""; }
  eat(c){ if(this.text.slice(this.i,this.i+c.length)===c){this.i+=c.length;return true} return false; }
  parse(){
    if(!this.text) throw new Error("EMPTY");
    const v=this.parseExpression();
    if(this.i!==this.text.length) throw new Error("INVALID");
    if(!Number.isFinite(v)) throw new Error("DIV0");
    return v;
  }
  parseExpression(){
    let v=this.parseTerm();
    while(this.peek()==="+"||this.peek()==="-"){ const op=this.peek();this.i++;const r=this.parseTerm();v=op==="+"?v+r:v-r; }
    return v;
  }
  parseTerm(){
    let v=this.parsePower();
    while(this.peek()==="*"||this.peek()==="/"){ const op=this.peek();this.i++;const r=this.parsePower(); if(op==="*" ) v*=r; else {if(r===0) throw new Error("DIV0");v/=r;} }
    return v;
  }
  parsePower(){
    let v=this.parseUnary();
    if(this.eat("^")){ const r=this.parsePower(); v=Math.pow(v,r); }
    return v;
  }
  parseUnary(){
    if(this.eat("+")) return this.parseUnary();
    if(this.eat("-")) return -this.parseUnary();
    return this.parsePostfix();
  }
  parsePostfix(){
    let v=this.parsePrimary();
    while(this.eat("%")) v=v/100;
    return v;
  }
  parsePrimary(){
    if(this.eat("(")){ const v=this.parseExpression(); if(!this.eat(")")) throw new Error("INVALID"); return v; }
    const id=this.readIdentifier();
    if(id){
      if(id==="pi") return Math.PI;
      if(id==="e") return Math.E;
      if(id==="ANS"){ if(state.lastResult===null) throw new Error("INVALID"); return state.lastResult; }
      if(["sin","cos","tan","sqrt","log","ln"].includes(id)){
        if(!this.eat("(")) throw new Error("INVALID");
        const x=this.parseExpression(); if(!this.eat(")")) throw new Error("INVALID");
        return trig(id,x);
      }
      throw new Error("INVALID");
    }
    const start=this.i;
    while(/[0-9.]/.test(this.peek())) this.i++;
    const s=this.text.slice(start,this.i);
    if(!s || (s.match(/\./g)||[]).length>1) throw new Error("INVALID");
    const n=Number(s);
    if(!Number.isFinite(n)) throw new Error("INVALID");
    return n;
  }
  readIdentifier(){ const m=this.text.slice(this.i).match(/^[A-Za-z]+/); if(!m)return "";this.i+=m[0].length;return m[0]; }
}
function trig(id,x){
  if(id==="sqrt"){ if(x<0) throw new Error("INVALID"); return Math.sqrt(x); }
  if(id==="log"){ if(x<=0) throw new Error("INVALID"); return Math.log10(x); }
  if(id==="ln"){ if(x<=0) throw new Error("INVALID"); return Math.log(x); }
  const a=state.angle==="DEG"?x*Math.PI/180:x;
  return id==="sin"?Math.sin(a):id==="cos"?Math.cos(a):Math.tan(a);
}

function normalizeInput(expr){
  return expr.replace(/(\d|\)|%|pi|e|ANS)\(/g,"$1*(")
    .replace(/\)(\d|pi|e|ANS)/g,")*$1")
    .replace(/(\d|\)|%|pi|e|ANS)(sin|cos|tan|sqrt|log|ln)\(/g,"$1*$2(");
}
function evaluate(expr){
  let x=normalizeInput(expr);
  // intuitive standalone percentage forms: 100+10% => 110, 100-10% => 90.
  const m=x.match(/^(-?(?:\d+(?:\.\d+)?))([+-])(\d+(?:\.\d+)?)%$/);
  if(m){ const a=Number(m[1]),p=Number(m[3])/100; return m[2]==="+"?a+a*p:a-a*p; }
  return new Parser(x).parse();
}
function calculate(commit=true){
  if(!state.expression) return;
  try{
    const n=evaluate(state.expression);
    state.result=formatResult(n);
    state.lastResult=n;
    flashResult();
    if(commit && !["Cannot divide by zero","Invalid expression"].includes(state.result)){
      state.history.unshift({id:crypto.randomUUID(),expression:state.expression,result:state.result,timestamp:Date.now(),favorite:false});
      state.history=state.history.slice(0,100); save(); renderHistory();
    }
  }catch(e){ state.result=e.message==="DIV0"?"Cannot divide by zero":"Invalid expression"; }
  renderDisplay();
}
function preview(){
  if(!state.expression){ state.result="0"; renderDisplay(); return; }
  try{ const n=evaluate(state.expression); state.result=formatResult(n); }
  catch(e){ state.result=e.message==="DIV0"?"Cannot divide by zero":"…"; }
  renderDisplay();
}
function appendToken(token){
  const ops="+-*/";
  if(token==="." ){
    const tail=state.expression.split(/[+\-*/()]/).pop();
    if(tail.includes(".")) return;
  }
  if(ops.includes(token)){
    if(!state.expression && token!=="-") return;
    if(ops.includes(state.expression.slice(-1))){
      if(token==="-" && state.expression.slice(-1)!=="-") state.expression+=token;
      else state.expression=state.expression.slice(0,-1)+token;
    } else state.expression+=token;
  } else {
    if(state.result!=="0" && state.expression==="" && /^\d|\.$/.test(token)) state.result="0";
    state.expression+=token;
  }
  sessionOps++;
  sessionStreak++;
  preview();
  flashResult();
}
function clearAll(){state.expression="";state.result="0";sessionStreak=0;renderDisplay();toast("Screen cleared");}
function backspace(){state.expression=state.expression.slice(0,-1);sessionStreak=0;preview();toast("Last input removed");}
function clearEntry(){
  const m=state.expression.match(/(.*?)(?:\d+\.?\d*|[A-Za-z]+|.)$/);
  state.expression=m?m[1]:""; sessionStreak=0; preview();
}
function flashResult(){ resultEl.classList.remove("result-pop"); void resultEl.offsetWidth; resultEl.classList.add("result-pop"); }
function signToggle(){
  if(!state.expression){state.expression="-";renderDisplay();return;}
  const m=state.expression.match(/^(.*?)(\d+(?:\.\d+)?)$/);
  if(!m)return;
  const prefix=m[1], num=m[2];
  if(prefix.endsWith("-") && (prefix.length===1 || "+-*/(".includes(prefix[prefix.length-2]||""))){
    state.expression=prefix.slice(0,-1)+num;
  } else state.expression=prefix+"-"+num;
  renderDisplay();
}

function memoryAction(a){
  try{
    const n=evaluate(state.expression || (state.lastResult!==null?String(state.lastResult):"0"));
    if(a==="mc")state.memory=0;
    if(a==="mr"){state.expression=String(state.memory);state.result=String(state.memory);}
    if(a==="mplus")state.memory+=n;
    if(a==="mminus")state.memory-=n;
    if(a==="ms")state.memory=n;
    save();renderDisplay();
    if(a!=="mr")toast(a==="mc"?"Memory cleared":a==="ms"?"Memory stored":"Memory updated");
  }catch{toast("Enter a valid calculation first");}
}

function renderHistory(){
  const q=$("#historySearch").value.trim().toLowerCase();
  let items=state.history.filter(h=>(state.historyFilter==="all"||h.favorite) && (!q || h.expression.toLowerCase().includes(q)||h.result.toLowerCase().includes(q)));
  historyCount.textContent=state.history.length;
  if(!items.length){historyList.innerHTML=`<div class="empty-state"><strong>${state.history.length?"No matching calculations":"No calculations yet"}</strong><span>${state.history.length?"Try another search or filter.":"Your completed calculations will appear here."}</span></div>`;return;}
  historyList.innerHTML=items.map(h=>`<div class="history-item">
    <div class="history-main" data-reuse="${h.id}"><div class="history-expression">${escapeHTML(h.expression)}</div><div class="history-result">${escapeHTML(h.result)}</div><div class="history-time">${new Date(h.timestamp).toLocaleString()}</div></div>
    <button class="fav-btn ${h.favorite?"active":""}" data-fav="${h.id}" aria-label="${h.favorite?"Remove favorite":"Add favorite"}">${h.favorite?"★":"☆"}</button>
  </div>`).join("");
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

$$("[data-token]").forEach(b=>b.addEventListener("click",()=>appendToken(b.dataset.token)));
$$("[data-action]").forEach(b=>b.addEventListener("click",()=>{
  const a=b.dataset.action;
  if(["mc","mr","mplus","mminus","ms"].includes(a))return memoryAction(a);
  if(a==="clear")clearAll(); else if(a==="backspace")backspace(); else if(a==="delete")clearAll(); else if(a==="clearEntry")clearEntry(); else if(a==="sign")signToggle(); else if(a==="equals")calculate(true);
  else if(a==="angle"){state.angle=state.angle==="DEG"?"RAD":"DEG";b.textContent=state.angle;}
}));
$("#copyBtn").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(state.result);toast("Result copied");}
  catch{const ta=document.createElement("textarea");ta.value=state.result;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();toast("Result copied");}
});
$("#themeBtn").addEventListener("click",()=>setTheme(state.theme==="dark"?"light":"dark"));
$("#helpBtn").addEventListener("click",()=>$("#helpDialog").showModal());
$$("[data-close]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.close).close()));
$$(".mode-btn").forEach(b=>b.addEventListener("click",()=>{state.mode=b.dataset.mode;$$(".mode-btn").forEach(x=>x.classList.toggle("active",x===b));$("#scientificPad").hidden=state.mode!=="scientific";renderDisplay();}));

$("#historySearch").addEventListener("input",renderHistory);
$("#allHistoryBtn").addEventListener("click",()=>{state.historyFilter="all";$("#allHistoryBtn").classList.add("active");$("#favHistoryBtn").classList.remove("active");renderHistory();});
$("#favHistoryBtn").addEventListener("click",()=>{state.historyFilter="fav";$("#favHistoryBtn").classList.add("active");$("#allHistoryBtn").classList.remove("active");renderHistory();});
$("#clearHistoryBtn").addEventListener("click",()=>{state.history=[];save();renderHistory();toast("History cleared");});
historyList.addEventListener("click",e=>{
  const reuse=e.target.closest("[data-reuse]"), fav=e.target.closest("[data-fav]");
  if(reuse){const h=state.history.find(x=>x.id===reuse.dataset.reuse);if(h){state.expression=h.expression;state.result=h.result;renderDisplay();}}
  if(fav){const h=state.history.find(x=>x.id===fav.dataset.fav);if(h){h.favorite=!h.favorite;save();renderHistory();toast(h.favorite?"Favorite added":"Favorite removed");}}
});
document.addEventListener("keydown",e=>{
  if(e.target.matches("input,textarea,select")) return;
  const k=e.key;
  if(/^\d$/.test(k)){e.preventDefault();appendToken(k);return;}
  const aliases={"x":"*","X":"*","÷":"/","×":"*","−":"-"};
  const token=aliases[k]||k;
  if(["+","-","*","/","%","(",")","."].includes(token)){e.preventDefault();appendToken(token);return;}
  if(k==="Enter"||k==="="){e.preventDefault();calculate(true);sessionStreak++;flashResult();toast("Calculation saved");return;}
  if(k==="Escape"){e.preventDefault();clearAll();return;}
  if(k==="Backspace"){e.preventDefault();backspace();return;}
  if(k==="Delete"){e.preventDefault();clearAll();return;}
  if(k.toLowerCase()==="c"){e.preventDefault();clearAll();return;}
  if(k.toLowerCase()==="m" && e.shiftKey){e.preventDefault();memoryAction("ms");return;}
});

renderHistory();renderDisplay();

// Enhanced Studio features: quick tools, insights, export, focus mode, and richer feedback.
const quickDialog=$("#quickDialog"), quickTitle=$("#quickTitle"), quickDescription=$("#quickDescription"), quickFields=$("#quickFields"), quickResult=$("#quickResult"), quickApply=$("#quickApply");
let activeQuick=null;
const quickConfigs={
  percent:{title:"Percentage",desc:"Find a percentage of a value.",fields:[["value","Value"],["percent","Percentage"]]},
  discount:{title:"Discount",desc:"Calculate the final price after a discount.",fields:[["price","Original price"],["percent","Discount %"]]},
  tip:{title:"Tip calculator",desc:"Split a bill with a tip across people.",fields:[["bill","Bill amount"],["tip","Tip %"],["people","People"]]},
  gst:{title:"GST calculator",desc:"Add GST to a price.",fields:[["price","Price before GST"],["gst","GST %"]]}
};
function qval(id){return Number($("#q_"+id)?.value||0)}
function computeQuick(){
  let r=0;
  if(activeQuick==="percent")r=qval("value")*qval("percent")/100;
  if(activeQuick==="discount")r=qval("price")-(qval("price")*qval("percent")/100);
  if(activeQuick==="tip")r=(qval("bill")*(1+qval("tip")/100))/Math.max(1,Math.floor(qval("people")||1));
  if(activeQuick==="gst")r=qval("price")*(1+qval("gst")/100);
  quickResult.textContent=Number.isFinite(r)?new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(r):"—";
}
function openQuick(type){
  activeQuick=type;const c=quickConfigs[type];quickTitle.textContent=c.title;quickDescription.textContent=c.desc;
  quickFields.innerHTML=c.fields.map(([id,label])=>`<label>${label}<input id="q_${id}" type="number" min="0" step="any" inputmode="decimal" placeholder="0"></label>`).join("");
  quickFields.querySelectorAll("input").forEach(i=>i.addEventListener("input",computeQuick));quickResult.textContent="—";quickDialog.showModal();setTimeout(()=>quickFields.querySelector("input")?.focus(),40);
}
$$('[data-quick]').forEach(b=>b.addEventListener('click',()=>openQuick(b.dataset.quick)));
quickApply.addEventListener('click',()=>{computeQuick();if(quickResult.textContent!=="—"){const n=quickResult.textContent.replaceAll(',','');state.expression=n;state.result=quickResult.textContent;renderDisplay();quickDialog.close();toast('Result added to calculator');}});
quickDialog.addEventListener('keydown',e=>{
  if(e.key==='Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey){
    const tag=(e.target?.tagName||'').toLowerCase();
    if(tag!=='textarea'){e.preventDefault();quickApply.click();}
  }
});

$("#copyExpressionBtn")?.addEventListener("click",async()=>{if(!state.expression){toast("No expression to copy");return}try{await navigator.clipboard.writeText(state.expression);toast("Expression copied")}catch{toast("Copy unavailable")}});
$("#exportHistoryBtn")?.addEventListener("click",()=>{if(!state.history.length){toast("Nothing to export yet");return}const rows=[["Expression","Result","Time","Favorite"],...state.history.map(h=>[h.expression,h.result,new Date(h.timestamp).toISOString(),h.favorite?"Yes":"No"])];const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='calculator-studio-history.csv';a.click();URL.revokeObjectURL(url);toast('History exported')});
function updateInsights(){const fav=state.history.filter(h=>h.favorite).length;$("#insightTotal").textContent=state.history.length;$("#insightFav").textContent=fav;$("#insightLast").textContent=state.history[0]?.result||"—"}
const oldRenderHistory=renderHistory;
renderHistory=function(){oldRenderHistory();updateInsights()};
$("#focusBtn")?.addEventListener("click",()=>{$("#focusOverlay").hidden=false;document.body.classList.add("focus-active")});
$("#exitFocusBtn")?.addEventListener("click",()=>{$("#focusOverlay").hidden=true;document.body.classList.remove("focus-active")});
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>{const d=$("#"+b.dataset.close);if(d?.open)d.close()}));
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#focusOverlay").hidden){$("#focusOverlay").hidden=true;document.body.classList.remove("focus-active")}});
updateInsights();
})();
