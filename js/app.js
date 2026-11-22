// UI, autenticazione e comunicazione con il backend.
(()=>{
const C=CONFIG,$=s=>document.querySelector(s),API=(CONFIG.API||'').replace(/\/$/,'');
let tok=localStorage.tok||'',me=null,run=null,tilt=localStorage.tilt==='1',period='all';
async function api(p,body){
  const r=await fetch(API+'/api/'+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body&&JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j.error||'Errore'),{status:r.status});return j}
const net=e=>e.status?e.message:'Server non raggiungibile';
const show=id=>{const tk=document.getElementById('ticker');if(tk)tk.hidden=!(id==='home'||id==='login'); // la striscia gialla è un elemento a sé: nascosta davvero (display:none) fuori da home e login
  document.body.classList.toggle('menu',['login','home','prize','board','prof'].includes(id));document.querySelectorAll('.screen').forEach(e=>e.classList.toggle('on',e.id===id));$('#hud').classList.toggle('hide',!(id===''||id==='pause'))};
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;e.textContent=x;return e};
// seconda musica: preload a (soglia-400) punti, dissolvenza incrociata di MUSIC_FADE secondi alla soglia (config.js: MUSIC2_AT, MUSIC_FADE)
const M2=C.MUSIC2_AT||2900,FADE=C.MUSIC_FADE||5;let m2=false;
const musicFor=()=>game.score>=M2&&SFX.has('music2')?'music2':'music';
const fadeTry=()=>{if(!m2&&game.state==='run'&&game.score>=M2&&SFX.crossfade('music2',FADE))m2=true};
function musicTick(s){if(m2)return;if(s>=M2-400)SFX.preload('music2').then(fadeTry);if(s>=M2)fadeTry()}
const game=new Game($('#cv'),{tilt:()=>tilt,onScore:s=>{$('#sc').textContent=s;musicTick(s)},onPause:()=>{SFX.pauseMusic();SFX.play('pause');show('pause')},sfx:k=>SFX.play(k),fx:()=>SFX.fx(),onBiome:i=>biomeToast(i),onPower:t=>{$('#pu').textContent=t},onPick:k=>showToast({shield:'🛡️ SCUDO!',potion:'🧪 SUPER SALTO!',jet:'🚀 JETPACK!'}[k]),onOver:over});
{const a=$('#credit'),h=C.CREDIT_IG||'zanonfrancesco';a.href='https://instagram.com/'+h;a.querySelector('span').textContent='by '+(C.CREDIT_NAME||'zanonfrancesco')}
// ---- modalità debug: ?debug nell'indirizzo (?debug=0 la spegne). Non chiede né salva punteggi sul server. Disattivabile del tutto con ALLOW_DEBUG:false in config.js
const DEBUG=(C.ALLOW_DEBUG!==false)&&(()=>{try{const q=new URLSearchParams(location.search).get('debug');if(q==='0')sessionStorage.removeItem('debug');else if(q!==null)sessionStorage.debug='1';return sessionStorage.debug==='1'}catch{return false}})();
if(DEBUG){document.body.classList.add('isdebug');$('#pdbg').classList.remove('hide');$('#dbgp').classList.remove('hide');
  EJ.BIOMES.forEach(b=>{const e=el('button','ghost small',b.icon+' '+b.n);e.onclick=()=>{game.teleport(b.from+120);show('');game.resume()};$('#dgrid').append(e)});
  {const e=el('button','sec small','✨ M2');e.onclick=()=>{game.teleport(M2*10+10);show('');game.resume()};$('#dgrid').append(e)} // salta alla soglia della musica 2
  [['shield','🛡️'],['potion','🧪'],['jet','🚀']].forEach(([k,ic])=>{const e=el('button','sec small',ic);e.onclick=()=>{game.give(k);show('');game.resume()};$('#dgrid').append(e)});
  const gl=()=>{$('#bgod').textContent='🛡 Immortale: '+(game.god?'ON':'OFF')};gl();$('#bgod').onclick=()=>{game.god=!game.god;gl()};
  $('#pdbg').onclick=()=>game.teleportNext();$('#dbgb').onclick=()=>{try{sessionStorage.removeItem('debug')}catch{}location.href=location.pathname}}
function showToast(txt){const t=$('#toast');t.textContent=txt;t.classList.remove('on');void t.offsetWidth;t.classList.add('on')}
function biomeToast(i){const b=EJ.BIOMES[i];if(!b||(i<1&&!DEBUG))return;showToast(b.icon+' '+b.n.toUpperCase());SFX.play('biome')}
// sfere dello sfondo menu: [diametro px, posizione x %, durata s, deriva px, fase]
[[150,6,38,40,.1],[90,78,28,-30,.45],[230,48,46,25,.7],[70,22,24,-20,.25],[120,90,32,30,.9],[180,12,52,-35,.55],[60,62,22,20,.05],[100,36,30,-25,.8]].forEach(([d,x,t,dx,ph],i)=>{
  const e=document.createElement('i');e.style.cssText=`--s:${d}px;--x:${x}%;--d:${t}s;--dx:${dx}px;--y:${18+(i*37)%70};animation-delay:-${(t*ph).toFixed(1)}s`;$('#bg').append(e)});
// ---- helpers voto / UI
const fmt=g=>g==null?'–':g.toFixed(1).replace('.',','),gcol=g=>`hsl(${Math.round((g-1)/9*125)},80%,52%)`,num=n=>n.toLocaleString('it-IT');
function gauge(box,val,anim,suf,from=1){ // semicerchio che si riempie e cambia colore col voto
  box.innerHTML='<svg viewBox="0 0 120 72"><path class="gb" pathLength="100" d="M10 62A50 50 0 0 1 110 62"/><path class="gf" pathLength="100" d="M10 62A50 50 0 0 1 110 62"/><text x="60" y="58" text-anchor="middle"><tspan class="gn"></tspan><tspan class="gs"></tspan></text></svg>';
  const f=box.querySelector('.gf'),n=box.querySelector('.gn');box.querySelector('.gs').textContent=val==null?'':suf||'';
  const set=v=>{f.style.strokeDasharray=(v-1)/9*100+' 100';f.style.stroke=gcol(v);n.textContent=fmt(v)};
  if(val==null){n.textContent='–';return}
  if(!anim||matchMedia('(prefers-reduced-motion:reduce)').matches)return set(val);
  const t0=performance.now();set(from);
  (function st(t){const p=Math.min(1,(t-t0)/1400);set(from+(val-from)*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(st)})(t0);
}
const LABEL=g=>g<4?'Rimandato a settembre 📉':g<5?'Insufficiente: serve il recupero':g<6?'Quasi sufficiente, ci siamo':g<7?'Sufficiente: tira a campare':g<8?'Buono, si nota l\'impegno':g<9?'Distinto, da prof preferito':'Eccellente: lode in vista 🏅';
const pick=a=>a[Math.floor(Math.random()*a.length)];
function pickNew(pool){ // casuale con memoria degli ultimi messaggi
  let h=[];try{h=JSON.parse(localStorage.mh||'[]')}catch{}
  const c=pool.filter(m=>!h.includes(m)),m=pick(c.length?c:pool);h.push(m);try{localStorage.mh=JSON.stringify(h.slice(-12))}catch{}return m}
const M={
 solo:['Nessuno in classifica ancora: sei il re di un regno deserto. Facile così.','Classifica vuota: per ora sei primo, ultimo e anche l\'unico spettatore.','Non c\'è nessuno da superare. Quando arriverà qualcuno, ne riparliamo.'],
 first:['👑 Sei davanti a tutti! Il primo ora sei tu: goditi la vetta finché dura.','👑 Primo posto. Gli altri stanno già pianificando la vendetta.','👑 Vetta conquistata. Ora tutti ti vogliono battere: tranquillo, nessuna pressione.','👑 Sei il numero uno. Un applauso, anche se te lo fai da solo.'],
 close:['Ti mancano {gap} punti per superare {next}. Dai, che stavolta ci eri quasi.','Solo {gap} punti da {next}: un salto più sveglio e ti siede in testa.','{gap} punti di distacco da {next}. Hai quasi fatto paura. Quasi.','Ti guarda ancora da sopra, ma solo per {gap} punti. Riprova!','{next} ha {gap} punti di vantaggio. Per ora.','Manca pochissimo: {gap} punti a {next}. Il prossimo salto è quello giusto.','Un soffio: {gap} punti. {next} sta già sudando freddo.','{gap} punti e passi {next}. Non è una scusa, è un invito.'],
 mid:['Ti mancano {gap} punti per raggiungere {next}. Evidentemente lui è più sveglio.','{gap} punti di distacco da {next}. Hai ancora parecchio da saltare.','Il podio non si conquista guardando gli altri giocare: {gap} punti da {next}.','{next} probabilmente sta già festeggiando. Ti mancano {gap} punti.','Non male... ma {next} non è ancora preoccupato. Distacco: {gap} punti.','{next} è {gap} punti più in alto. Vuoi fare qualcosa a riguardo?','Hai {gap} punti da recuperare su {next}. Si può fare, con meno distrazione.','Ti mancano {gap} punti. Il primo, {top}, è a {topgap}: lui non guarda neanche.'],
 far:['{gap} punti di distacco da {next}. Inizierei a piangere.','La vetta è libera, il problema è arrivarci: {gap} punti ti separano da {next}.','Ti mancano {gap} punti. {next} ti saluta dall\'alto, con la manina.','{next} ti ha preso in giro in {gap} punti. Un bel viaggio, ma lui è più avanti.','Con {gap} punti di ritardo da {next}, la palla ha saltato più di te.','Il primo, {top}, ha {topgap} punti più di te. Ti consolerà sapere che è solo un gioco.','{gap} punti per arrivare a {next}. Prova a guardare lo schermo, aiuta.','Per raggiungere {next} servono {gap} punti. Allenamento, impegno e forse una pallina meno stanca.']};
function gapMsg(r,score){
  let pool,v={};
  if(!r.top)pool=M.solo;else if(!r.next)pool=M.first;
  else{const gap=r.next.score-score,ratio=gap/r.next.score;v={gap:num(gap),next:r.next.nick,top:r.top.nick,topgap:num(r.top.score-score)};pool=ratio<.08?M.close:ratio<.35?M.mid:M.far}
  return pickNew(pool).replace(/\{(\w+)\}/g,(_,k)=>v[k]);
}
const SHARE_URL=()=>C.SHARE_URL||location.href.split('#')[0];
const SH=['Ho appena fatto {s} punti sul gioco della {list} {slogan} e il mio voto è {g}/10{pos}. Vediamo se riesci a battermi. Tocca a te!','{g}/10 di media e {s} punti{pos}. Il voto è ufficiale, il tuo ancora no. Batti {nick}, se hai il coraggio!','Secondo il gioco della {list} sono da {g}/10 ({s} punti{pos}). Tu quanto prendi? Dimostralo!','{nick}: {s} punti, voto {g}/10{pos}. Hai fatto meglio? Mandami il tuo voto.','Sfida lanciata: voto {g}/10 sul gioco della {list}, {s} punti{pos}. Il podio ti aspetta, o forse no.'];
const HINT={low:['Un voto così si nasconde... oppure si condivide e ci si ride sopra.','Condividilo comunque: almeno i tuoi amici si sentono bravi.'],mid:['Hai fatto meglio dei tuoi amici? Mandagli il tuo voto e vediamo chi è il più forte.','Condividi il risultato e lancia la sfida.','La prossima volta prova a battere il tuo compagno.'],high:['Un voto così non si tiene nascosto.','Mandagli il tuo voto e vediamo chi è il più forte.','Condividi il risultato e lancia la sfida!']};
let SHD=null; // dati verificati dal server, mai valori del browser
const shareText=()=>pick(SH).replace(/\{(\w+)\}/g,(_,k)=>({g:fmt(SHD.avg),s:num(SHD.score),pos:SHD.rank?' (#'+SHD.rank+' in classifica)':'',nick:me.nick,list:C.LIST,slogan:C.SLOGAN})[k]);
async function copyTxt(t,btn){try{await navigator.clipboard.writeText(t)}catch{const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();try{document.execCommand('copy')}catch{}a.remove()}
  const o=btn.textContent;btn.textContent='Copiato ✓';setTimeout(()=>btn.textContent=o,1600)}
// ---- feedback pulsanti (touch + mouse, Pointer Events)
const NOCLICK=['bplay','bagain','bpl2','pb'];let pb=null;const unp=()=>{if(pb){pb.classList.remove('pressed');pb=null}};
addEventListener('pointerdown',e=>{const b=e.target.closest&&e.target.closest('button');if(b&&!b.disabled){pb=b;b.classList.add('pressed');if(!NOCLICK.includes(b.id))SFX.play('click')}},{passive:true,capture:true});
addEventListener('pointermove',e=>{if(!pb)return;const t=document.elementFromPoint(e.clientX,e.clientY);pb.classList.toggle('pressed',!!t&&pb.contains(t))},{passive:true}); // dito spostato fuori = rilascia l'effetto
for(const t of['pointerup','pointercancel','blur','contextmenu'])addEventListener(t,unp,{passive:true});
document.addEventListener('visibilitychange',unp);addEventListener('touchstart',()=>{},{passive:true}); // abilita :active su iOS Safari
function home(){game.stop();SFX.music(false);SFX.free('music2');gauge($('#hg'),me.avg,false);$('#bpr').textContent='👤 '+me.nick;$('#hb').textContent=me.best;$('#btilt').textContent=tilt?'📱 Inclinazione':'👆 Touch';$('#bsnd').textContent=SFX.isOn()?'🔊 Suoni on':'🔇 Suoni off';show('home')}
async function loadMe(){try{me=await api('me')}catch(e){if(e.status===401){tok='';localStorage.removeItem('tok')}throw e}}
async function doAuth(kind){$('#err').textContent='';
  try{const r=await api(kind,{nick:$('#nick').value.trim(),pin:$('#pin').value});tok=r.token;localStorage.tok=tok;SFX.play('login');$('#pin').value='';await loadMe();home()}
  catch(e){SFX.play('error');$('#err').textContent=net(e)}}
async function play(){
  show('');game.clear();$('#sc').textContent='0';$('#bs').textContent=DEBUG?'DEBUG · non salvato':'Record '+me.best;
  run=DEBUG?null:await Promise.race([api('run/start',{}).catch(()=>null),new Promise(r=>setTimeout(r,1500,null))]);
  m2=false;SFX.play('start');SFX.music(true,'music');
  game.start(run?run.seed:(Math.random()*2**31|0)+1)}
async function packTrace(){ // traccia compressa (gzip se disponibile) in base64
  const u=game.getTrace();let b=u,z=0;
  if(typeof CompressionStream==='function'){try{b=new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());z=1}catch{b=u}}
  let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode.apply(null,b.subarray(i,i+8192));
  return{tr:btoa(s),z,ver:Game.VER}}
async function over(score){
  const rid=run&&run.id;run=null;SHD=null;SFX.music(false);SFX.free('music2');const later=(f,ms)=>setTimeout(()=>{if($('#over').classList.contains('on'))f()},ms);later(()=>SFX.play('gameover'),450);$('#os').textContent=score;$('#ob').textContent=me.best;$('#orank').textContent='…';$('#omsg').textContent='';
  for(const i of['#opg','#ogap','#osh'])$(i).classList.add('inv');show('over');$('#over').scrollTop=0;
  if(!rid){$('#orank').textContent='-';$('#omsg').textContent=DEBUG?'🛠 Debug: punteggio non salvato':'Offline: punteggio non salvato';return}
  try{const pk=await packTrace(),r=await api('run/finish',{id:rid,score,...pk});me.best=r.best;me.avg=r.avg;$('#ob').textContent=r.best;$('#orank').textContent=r.rank?'#'+r.rank:'-';
    if(!r.accepted){$('#omsg').textContent=r.reason==='old'?'Aggiorna l\'app: chiudila e riaprila, poi riprova':r.reason==='busy'?'Server occupato: riprova tra poco':'Punteggio non valido';return}
    if(r.score!=null&&r.score!==score)$('#os').textContent=r.score; // vale il punteggio rigiocato dal server
    if(r.grade==null){$('#omsg').textContent='Server non aggiornato: riavvia server.js dalla cartella nuova';return}
        if(r.newRecord)SFX.play('record');if(r.prevAvg==null||r.avg>r.prevAvg)later(()=>SFX.play('gradeup'),1400);else if(r.avg<r.prevAvg)later(()=>SFX.play('gradedown'),1400);
    $('#opg').classList.remove('inv');gauge($('#og'),r.avg,true,'',r.prevAvg==null?1:r.prevAvg); // voto del PROFILO aggiornato, animato dal valore precedente
    $('#ogap').textContent=(r.newRecord?'🎉 Nuovo record! ':'')+gapMsg(r,score);$('#ogap').classList.remove('inv');
    SHD=r;$('#osh').classList.remove('inv')}
  catch(e){$('#orank').textContent='-';$('#omsg').textContent=net(e)}}
let lbRows=0;
const lbRow=r=>{const li=el('li',r.nick===me.nick?'me':'');const gc=el('i','gc',fmt(r.grade));gc.style.background=r.grade?gcol(r.grade):'#334155';li.append(el('b','','#'+(r.rank||'-')),el('span','',r.nick),gc,el('b','',r.score));return li};
async function board(more){ // prima pagina 100 giocatori, poi "carica altri 50" in fondo
  const ul=$('#lb'),q=$('#q').value.trim(),more_=more===true;
  if(q){ul.replaceChildren(el('li','','Carico…'));
    try{const rows=await api('search?q='+encodeURIComponent(q));ul.replaceChildren(...rows.map(lbRow));if(!rows.length)ul.append(el('li','','Nessun risultato'))}catch(e){ul.replaceChildren(el('li','',net(e)))}return}
  const limit=more_?50:100,off=more_?lbRows:0;
  if(!more_){ul.replaceChildren(el('li','','Carico…'));lbRows=0}else{const b=ul.querySelector('.more');if(b){b.disabled=true;b.textContent='Carico…'}}
  try{const rows=await api('leaderboard?period='+period+'&limit='+limit+'&offset='+off);
    if(!more_)ul.replaceChildren();else{const m=ul.querySelector('.moreli');if(m)m.remove()}
    for(const r of rows)ul.append(lbRow(r));lbRows+=rows.length;
    if(!lbRows)ul.append(el('li','','Nessun risultato'));
    else if(rows.length===limit){const li=el('li','moreli',''),b=el('button','sec small more','⬇️ Carica altri 50');b.onclick=()=>board(true);li.append(b);ul.append(li)}}
  catch(e){if(!more_)ul.replaceChildren(el('li','',net(e)));else{const b=ul.querySelector('.more');if(b){b.disabled=false;b.textContent='Riprova: '+net(e)}}}}
async function profile(){
  try{await loadMe();$('#pn').textContent=me.nick;const ul=$('#pst');ul.replaceChildren();
    for(const[k,v]of[['Record',me.best],['Voto medio',fmt(me.avg)],['Miglior voto',fmt(me.bestGrade)],['Ultimo voto',fmt(me.lastGrade)],['Ultimo punteggio',me.lastScore==null?'-':me.lastScore],['Partite giocate',me.games],['Posizione globale',me.rank?'#'+me.rank:'-'],['Iscritto dal',new Date(me.since).toLocaleDateString('it')]]){const li=el('li','');li.append(el('span','',k),el('b','',v));ul.append(li)}
    show('prof')}catch(e){alert(net(e))}}
document.querySelectorAll('[data-cfg]').forEach(e=>e.textContent=C[e.dataset.cfg]);
const MSG=[`🗳️ VOTA ${C.LIST} · ${C.SLOGAN}`,`🏆 IL N°1 IN CLASSIFICA VINCE ${C.PRIZE.toUpperCase()}!`,'⚡ GIOCA, SALI, VINCI!'];
document.querySelectorAll('.tick').forEach(t=>{const s=MSG.join('  •  ')+'  •  ',tr=el('div','tr','');tr.append(el('span','',s),el('span','',s));tr.style.animationDuration=Math.round(s.length*.28)+'s';t.append(tr)});
async function prize(){
  show('prize');$('#shirt').src=C.SHIRT;$('#lead').textContent='';
  const end=C.CONTEST_END?new Date(C.CONTEST_END):null,d=end?Math.ceil((end-Date.now())/864e5):0;
  $('#cend').textContent=!end?'Data di chiusura: sarà comunicata a breve.':d<=0?'Il contest è concluso!':'Il contest termina il '+end.toLocaleDateString('it')+' · mancano '+d+(d===1?' giorno':' giorni')+'!';
  try{const[r]=await api('leaderboard?period=all');$('#lead').textContent=(r?'👑 In testa ora: '+r.nick+' ('+r.score+')':'👑 Nessuno in testa: puoi essere il primo!')+(me.rank?' · Tu: #'+me.rank:'')}catch{}}
$('#bpz').onclick=prize;$('#bpl2').onclick=play;$('#bb3').onclick=home;
$('#bshare').onclick=async()=>{if(!SHD)return;SFX.play('share');const t=shareText(),u=SHARE_URL();
  if(navigator.share){try{await navigator.share({text:t,url:u});return}catch(e){if(e.name==='AbortError')return}}copyTxt(t+' '+u,$('#bshare'))};
$('#bnn').onclick=async()=>{$('#nerr').textContent='';try{await api('nick',{nick:$('#nn').value.trim(),pin:$('#np').value});$('#np').value='';$('#nn').value='';await profile()}catch(e){$('#nerr').textContent=net(e)}};
$('#nick').oninput=(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(async()=>{const n=$('#nick').value.trim();if(n.length<3)return;try{const r=await api('nick-check?nick='+encodeURIComponent(n));if(!r.ok)$('#err').textContent=r.msg;else if($('#err').dataset.nick)$('#err').textContent=''}catch{};$('#err').dataset.nick=1},450)}})(); // feedback immediato (il controllo vero è sul server)
$('#bli').onclick=()=>doAuth('login');$('#bre').onclick=()=>doAuth('register');
$('#bplay').onclick=$('#bagain').onclick=play;$('#bhome').onclick=$('#bph').onclick=home;
$('#pb').onclick=()=>game.pause();$('#bres').onclick=()=>{show('');game.resume();SFX.play('resume');SFX.resumeMusic(musicFor())};$('#bsnd').onclick=()=>{SFX.toggle();home()};
$('#blb').onclick=()=>{$('#q').value='';show('board');board()};$('#bpr').onclick=profile;$('#bb1').onclick=$('#bb2').onclick=home;
$('#q').oninput=(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(board,300)}})();
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{period=b.dataset.p;$('#q').value='';document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('ghost',x!==b));board()});
$('#btilt').onclick=async()=>{if(!tilt&&typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){
  try{if(await DeviceOrientationEvent.requestPermission()!=='granted')return}catch{return}}
  tilt=!tilt;localStorage.tilt=tilt?'1':'0';home()};
$('#blo').onclick=async()=>{try{await api('logout',{})}catch{}tok='';localStorage.removeItem('tok');show('login')};
(async()=>{if(!tok)return show('login');try{await loadMe();home()}catch(e){show('login');$('#err').textContent=e.status?'':net(e)}})();
if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js'));
})();
