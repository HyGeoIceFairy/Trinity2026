import {Game,CARDS,RULES_VERSION} from './engine.mjs';

const $ = id=>document.getElementById(id);
const cast = {shadow:['鸣濑白羽','Summer Pockets','海边独白','shiroha'],storm:['神尾观铃','AIR','夏日海堤','misuzu'],shell:['月宫亚由','Kanon','飘雪商店街','ayu'],clock:['枣铃','Little Busters!','放学后操场','rin'],guardian:['星野梦美','planetarian','星象馆','yumemi'],winter:['篝','Rewrite','月下花丘','kagari']};
const kinds = {strike:'攻击',guard:'防御',insight:'技巧',spark:'攻击',heavy:'攻击',echo:'攻击',shelter:'防御',focus:'力量',mist:'毒',rush:'能量',sweep:'攻守',sustain:'防御'};
const paths = {
  strike:'M13 35 34 14m-5-1 7-1-1 7M11 29l8 8m-7-2-4 5',
  guard:'M24 6 9 12v11c0 10 15 19 15 19s15-9 15-19V12Zm-7 17 5 5 10-11',
  insight:'M7 11h14l3 4 3-4h14v26H27l-3 4-3-4H7Zm17 4v26M12 18h6m-6 6h6m11-6h6m-6 6h6',
  spark:'m24 5 4 14 14 5-14 4-4 15-4-15-14-4 14-5Zm13 0v7m-4-3h7M7 35v7m-3-3h7',
  heavy:'m24 4 5 10 11 2-7 9 2 12-11-6-11 6 2-12-7-9 11-2Zm0 27v13m-7-6h14',
  echo:'m9 12 13 12L9 36m17-24 13 12-13 12',
  shelter:'M7 28 24 9l17 19H7Zm7 0v12h20V28m-10 0v12M5 40h38M10 11l3 3m22-3-3 3',
  focus:'M24 39c-9-5-16-11-14-18 2-8 12-9 14-1 3-8 13-7 15 0 2 7-6 15-15 19ZM24 4v6M6 13l5 3m27-3-4 3',
  mist:'M24 6c0 11-13 13-13 25a13 13 0 0 0 26 0C37 19 24 17 24 6Zm-6 25c0 5 3 7 6 7',
  rush:'m28 4-17 23h12l-3 17 17-25H25ZM6 15h8M3 22h7m25 11h9',
  sweep:'M7 16c8-9 19-7 24-2M8 29c12-8 20-9 33-5M14 38c8-3 14-5 24-4M31 9v8h-8',
  sustain:'M24 6 7 24l17 18 17-18Zm0 9v18M15 24h18',
};
const STORAGE='trinity-cards-save-v1', BEST='trinity-cards-best-v1';
let game,seed='',selected=null,busy=false,sound=false,audio,toastTimer,previousKind='shadow',lastSave=null,drag=null,suppressClickUntil=0;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,reduced()?0:ms));
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function text(id,value){$(id).textContent=value;}
function effects(e,strength=0){return [e.damage?`伤害 ${e.damage+strength}${e.hits>1?` × ${e.hits}`:''}`:'',e.block?`格挡 ${e.block}`:'',e.draw?`抽 ${e.draw} 张牌`:'',e.energy?`能量 +${e.energy}`:'',e.strength?`力量 +${e.strength}`:'',e.poison?`毒 +${e.poison}`:'',e.exhaust?'本场消耗':''].filter(Boolean).join(' · ');}
function svg(kind){const n=document.createElementNS('http://www.w3.org/2000/svg','svg');n.setAttribute('viewBox','0 0 48 48');n.setAttribute('aria-hidden','true');const p=document.createElementNS(n.namespaceURI,'path');p.setAttribute('d',paths[kind]??paths.spark);n.append(p);return n;}
function toast(message){text('toast',message);$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function tone(type){if(!sound)return;try{audio??=new AudioContext();audio.resume().catch(()=>{});const now=audio.currentTime,notes=type==='win'?[523,659,784]:type==='hit'?[196,147]:type==='block'?[392,523]:[440,554];for(const [i,f] of notes.entries()){const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,now+i*.055);g.gain.linearRampToValueAtTime(.035,now+i*.055+.012);g.gain.exponentialRampToValueAtTime(.001,now+i*.055+.19);o.connect(g).connect(audio.destination);o.start(now+i*.055);o.stop(now+i*.055+.21);}}catch{sound=false;updateSound();}}
function updateSound(){$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭声音':'开启声音');$('sound').querySelector('span').textContent=sound?'声音开':'声音关';}
function makeCard(c,{action=null,index=-1,preview=false}={}){
  const e=c.effects,type=e.poison?'poison':e.damage?'attack':e.block?'defense':'skill';
  const node=el(action?'button':'article',`card ${type}${c.upgraded?' upgraded':''}`);node.dataset.uid=c.uid;
  node.append(el('span','cost',c.cost),el('span','type',kinds[c.kind]??c.kind));
  const art=el('span','card-art');art.append(svg(c.kind));node.append(art,el('strong','',c.name));
  let shown=e;
  if(preview)shown=CARDS[c.kind][3];
  node.append(el('p','effects',effects(shown,game?.phase==='battle'?game.strength:0)),el('span','card-foot',preview?'升级后的效果':e.exhaust?'用后移入消耗区':'用后移入弃牌堆'));
  if(index>=0)node.append(el('span','shortcut',String((index+1)%10)));
  if(action){
    const legal=game.legalActions().some(a=>a.id===action),decision=game.decisions;
    let pointerType='mouse';
    const handlers={};const listen=(type,fn)=>{handlers[type]=fn;node.addEventListener(type,fn);};node.forwardCardEvent=event=>handlers[event.type]?.(event);
    node.dataset.action=action;node.setAttribute('aria-label',`${c.name}，费用 ${c.cost}，${effects(shown)}${!legal?'，当前不可用':''}`);node.setAttribute('aria-pressed',String(selected?.id===action));node.classList.toggle('selected',selected?.id===action);node.classList.toggle('unavailable',!legal);node.setAttribute('aria-disabled',String(!legal||busy));
    listen('pointerenter',e=>{if(e.pointerType==='mouse'&&!busy&&!drag)inspectCard(action,c,preview,node);});
    node.addEventListener('focus',()=>{if(!busy)inspectCard(action,c,preview,node);});
    listen('pointerdown',e=>{
      pointerType=e.pointerType;
      if(e.button!==0||busy||!legal||game.decisions!==decision)return;
      drag={id:action,card:c,preview,node,decision,pointer:e.pointerId,type:e.pointerType,x:e.clientX,y:e.clientY,started:false,cancelled:false,ghost:null};
    });
    listen('click',e=>{
      if(busy||performance.now()<suppressClickUntil||game.decisions!==decision)return;
      if(!legal){inspectCard(action,c,preview,node);toast(game.phase==='battle'&&game.turn_actions>=20?'本回合已出牌 20 次，请结束回合。':`需要 ${c.cost} 点能量，当前只有 ${game.energy} 点。`);return;}
      if(pointerType!=='mouse'&&selected?.id===action){perform(action);return;}
      select(action,c,preview,node);
    });
    listen('dblclick',e=>{e.preventDefault();if(pointerType==='mouse'&&!busy&&legal&&game.decisions===decision)perform(action);});
  }
  return node;
}
function select(id,card,preview=false,node=null){selected={id,card,preview};for(const n of $('hand').querySelectorAll('[data-action]')){const yes=n.dataset.action===id;n.classList.toggle('selected',yes);n.setAttribute('aria-pressed',String(yes));n.closest('.card-slot')?.classList.toggle('selected',yes);}renderSelection();inspectCard(id,card,preview,node??$('hand').querySelector(`[data-action="${id}"]`));tone('select');}
function clearPreview(){selected=null;$('card-detail').hidden=true;for(const n of $('hand').querySelectorAll('.inspected,.selected'))n.classList.remove('inspected','selected');for(const n of $('hand').querySelectorAll('[aria-pressed]'))n.setAttribute('aria-pressed','false');if(game)renderSelection();}
function inspectCard(id,c,preview,node){
  if(!node||$('modal').open)return;
  for(const n of $('hand').querySelectorAll('.inspected'))n.classList.remove('inspected');node.closest('.card-slot')?.classList.add('inspected');
  const detail=$('card-detail');detail.replaceChildren(el('h3','',preview?`${c.name} → 升级`:c.name),el('p','detail-cost',`${kinds[c.kind]} · ${c.cost} 能量`));
  const e=preview?CARDS[c.kind][3]:c.effects;
  if(preview)detail.append(el('p','detail-rule',`当前：${effects(c.effects)}`));
  detail.append(el('p','detail-effects',`${preview?'升级后：':''}${effects(e,game.phase==='battle'?game.strength:0)}`));
  if(e.damage&&game.phase==='battle'){const total=(e.damage+game.strength)*(e.hits??1);detail.append(el('p','detail-rule',`当前力量已计入伤害。对手格挡吸收后，造成 ${Math.max(0,total-game.enemy.block)} 点体力伤害。`));}
  if(e.block)detail.append(el('p','detail-rule','格挡吸收本回合的伤害，在下回合开始清零。'));
  if(e.strength)detail.append(el('p','detail-rule','力量增加本场每一段卡牌伤害，可以叠加。'));
  if(e.poison)detail.append(el('p','detail-rule','毒在对手行动前结算，无视格挡，每回合减少 1。'));
  if(e.draw)detail.append(el('p','detail-rule','从牌堆抽牌。牌堆空时洗回弃牌，手牌最多 10 张。'));
  if(e.exhaust)detail.append(el('p','detail-rule','使用后本场移入消耗区，下一幕回到牌组。'));
  const legal=game.legalActions().some(a=>a.id===id),touch=matchMedia('(pointer:coarse)').matches||innerWidth<=720;
  detail.append(el('p','detail-hint',!legal?game.turn_actions>=20?'本回合出牌次数已用尽':`还需要 ${Math.max(0,c.cost-game.energy)} 点能量`:touch?'再点同一张即可使用 · 向上拖动也可以':`双击${game.phase==='battle'?'打出':game.phase==='reward'?'领取':'升级'} · 拖向舞台使用 · Enter 确认`));
  detail.hidden=false;
  const r=(node.closest('.card-slot')??node).getBoundingClientRect(),height=detail.offsetHeight;
  detail.style.left=`${Math.max(12,Math.min(innerWidth-242,r.left+r.width/2-115))}px`;detail.style.top=`${Math.max(71,r.top-height-66)}px`;
}
function arrangeHand(){
  const slots=[...$('hand').querySelectorAll('.card-slot')],n=slots.length,available=$('hand').clientWidth;
  const step=n<=1?0:Math.min(game.phase==='reward'?195:108,Math.max(25,(available-150)/(n-1)));
  slots.forEach((slot,i)=>{const offset=i-(n-1)/2;slot.style.setProperty('--fan-x',`${offset*step}px`);slot.style.setProperty('--fan-r',`${game.phase==='battle'?Math.max(-9,Math.min(9,offset*(innerWidth<=720?1.4:2.7))):0}deg`);slot.style.setProperty('--fan-y',`${game.phase==='battle'?Math.abs(offset)*Math.abs(offset)*1.25:0}px`);slot.style.setProperty('--order',String(i+1));});
}
function renderSelection(){
  $('selection').replaceChildren();
  if(selected){const d=el('div','selection-detail');d.append(el('strong','',selected.preview?`升级 ${selected.card.name}`:selected.card.name),document.createTextNode(effects(selected.preview?CARDS[selected.card.kind][3]:selected.card.effects,game.phase==='battle'?game.strength:0)));$('selection').append(d);$('confirm').replaceChildren(document.createTextNode(game.phase==='rest'?'确认升级':game.phase==='reward'?'加入牌组':'打出此牌'),el('span','','↗'));}
  else{$('selection').append(el('span','selection-mark','✧'));const p=el('p');p.append(document.createTextNode(game.phase==='reward'?'奖励可以选一张，也可以跳过。':game.phase==='rest'?'恢复体力，或选择一张牌升级。':'把光留在手里，'),el('b','',game.phase==='battle'?'然后做出你的选择。':''));$('selection').append(p);$('confirm').replaceChildren(document.createTextNode(game.phase==='rest'?'选择一张牌升级':game.phase==='reward'?'选择一张奖励':'选择一张牌'),el('span','','↗'));}
  $('confirm').disabled=!selected||busy;
}
function status(container,block,strength,poison){container.replaceChildren();for(const [name,value,cls,symbol] of [['格挡',block,'block','◇'],['力量',strength,'strength','↗'],['毒',poison,'poison','❋']])if(value)container.append(el('span',`status ${cls}`,`${symbol} ${name} ${value}`));if(!container.children.length)container.append(el('span','status none','暂无状态'));
}
function render(){
  const o=game.observation(),battle=o.phase==='battle',kind=battle?o.enemy.kind:previousKind,actor=cast[kind];previousKind=kind;
  document.body.classList.add('playing');for(const p of ['battle','reward','rest','terminal'])document.body.classList.toggle(p,o.phase===p);$('card-detail').hidden=true;
  const displayStage=battle?o.stage:Math.max(1,o.completed);
  text('act-label',`ACT ${String(displayStage).padStart(2,'0')} / 12${displayStage%3===0?' · BOSS':''}`);
  text('scene-title',o.phase==='reward'?'把这一幕，带在身边':o.phase==='rest'?'幕间，稍作休息':o.phase==='terminal'?'旅程的回声':actor[2]);
  text('score',game.result().score.toLocaleString('en-US'));
  $('route').replaceChildren();
  const seen=new Map(game.history.filter(f=>f.observation.phase==='battle').map(f=>[f.observation.stage,f.observation.enemy.name]));
  if(battle)seen.set(o.stage,o.enemy.name);
  for(let i=1;i<=12;i++){const n=el('span',`route-step${i%3===0?' boss':''}${i<=o.completed?' done':''}${battle&&i===o.stage?' current':''}`,String(i).padStart(2,'0'));if(i%3===0)n.append(el('small','','✦'));n.title=seen.has(i)?`第 ${i} 幕 · ${seen.get(i)}`:`第 ${i} 幕${i%3===0?' · 首领':''}`;if(battle&&i===o.stage)n.setAttribute('aria-current','step');$('route').append(n);}
  $('stage').querySelector('.scene-image').style.backgroundImage=`linear-gradient(#e9eade44,#e6e7d999),url('assets/scene-${actor[3]}.webp')`;
  text('stage-name',actor[2]);text('turn',battle?`第 ${o.turn} / 30 回合`:o.phase==='reward'?'本幕完成 · 体力 +4':o.phase==='rest'?'幕间休息':'旅程结束');
  text('center-note',battle?'YOUR TURN':o.phase==='reward'?'REWARD':o.phase==='rest'?'REST':'FIN');
  const h=$('hero-hp');h.replaceChildren(document.createTextNode(`${o.player.hp} `),el('small','','/ 60'));$('hero-health').style.width=`${o.player.hp/60*100}%`;
  $('hero').setAttribute('aria-label',`古河渚，体力 ${o.player.hp}/60${battle?`，格挡 ${o.block}，力量 ${o.strength}`:''}`);
  status($('hero-status'),battle?o.block:0,battle?o.strength:0,0);
  const art=$('enemy-art');if(!art.src.endsWith(`replay-${actor[3]}.webp`))art.src=`assets/replay-${actor[3]}.webp`;art.alt=actor[0];text('enemy-name',actor[0]);text('enemy-sub',actor[1]);
  $('enemy').style.opacity=battle?'1':'.6';
  const e=$('enemy-hp');e.replaceChildren(document.createTextNode(battle?`${o.enemy.hp} `:'0 '),el('small','',`/ ${battle?o.enemy.maxHp:game.enemy.maxHp}`));$('enemy-health').style.width=battle?`${o.enemy.hp/o.enemy.maxHp*100}%`:'0%';
  status($('enemy-status'),battle?o.enemy.block:0,battle?o.enemy.strength:0,battle?o.enemy.poison:0);
  $('intent').hidden=!battle;
  if(battle){text('intent-value',effects(o.intent));const incoming=(o.intent.damage??0)*(o.intent.hits??1),poisonLethal=o.enemy.poison>=o.enemy.hp;const loss=poisonLethal?0:Math.max(0,incoming-o.block);text('forecast',poisonLethal?'毒将先于对手行动，结束本幕。':incoming?`现在结束回合：失去 ${loss} 体力${loss>=o.player.hp?' · 将体力耗尽':''}`:'本回合对手不会攻击。');text('tip',o.enemy.poison?'毒会先结算，无视格挡，然后减少 1。':o.strength?'力量会加到每一段卡牌伤害上。':o.draw_count===0?'抽牌堆空时，弃牌会重新洗入。':'先看对手的意图，再决定出哪张牌。');}
  text('energy',battle?o.energy:o.player.hp);document.querySelector('.energy-display b').textContent=battle?'能量':'体力';document.querySelector('.energy-display small').textContent=battle?'每回合恢复为 3':'上限 60';$('energy-orbs').replaceChildren(...Array.from({length:battle?Math.min(o.energy,8):0},()=>el('i')));text('actions-left',battle?`${o.actions_remaining} 次`:'—');text('deck-count',o.deck.length);text('draw-count',battle?o.draw_count:'—');text('discard-count',battle?o.discard.length:'—');text('exhaust-count',battle?o.exhaust.length:'—');
  const oldPositions=new Map([...$('hand').children].map(n=>[n.dataset.uid,n.getBoundingClientRect()])),old=new Set(oldPositions.keys()),scroll=$('hand').scrollLeft;$('hand').replaceChildren();
  const cards=battle?o.hand:o.phase==='reward'?o.offers:o.phase==='rest'?o.deck.filter(c=>!c.upgraded):o.deck;
  text('hand-title',battle?'你的手牌':o.phase==='reward'?'选择一张奖励':o.phase==='rest'?'选择一张牌升级':'最终牌组');
  const touch=innerWidth<=720;
  text('hand-note',battle?(touch?'轻点看牌 · 再点打出 · 左右滑动手牌':'悬停查看 · 双击出牌 · 拖向舞台 · 1–0 选牌，Enter 出牌，E 结束回合'):o.phase==='reward'?(touch?'轻点查看，再点领取 · 也可跳过':'双击领取一张奖励 · 也可跳过'):o.phase==='rest'?`下方显示升级后效果 · ${touch?'再点':'双击'}升级，或恢复 ${Math.min(18,60-o.player.hp)} 体力。`:'谢谢你走过这一程。');text('hand-counter',`${cards.length} CARDS`);
  cards.forEach((c,i)=>{const action=battle?`play:${c.uid}`:o.phase==='reward'?`pick:${i}`:o.phase==='rest'?`upgrade:${c.uid}`:null;const n=makeCard(c,{action,index:i,preview:o.phase==='rest'}),slot=el('div','card-slot');slot.dataset.uid=c.uid;slot.append(n);if(!old.has(String(c.uid)))n.classList.add('new-card');for(const type of ['pointerenter','pointerdown','click','dblclick'])slot.addEventListener(type,e=>{if(e.target===slot)n.forwardCardEvent?.(e);});slot.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!drag&&!selected){slot.classList.remove('inspected');$('card-detail').hidden=true;}});$('hand').append(slot);});
  if(!cards.length)$('hand').append(el('p','hand-empty',battle?'手牌已空。可以结束回合了。':'没有可升级的牌。'));
  arrangeHand();$('hand').scrollLeft=scroll;
  if(!reduced())for(const slot of $('hand').querySelectorAll('.card-slot')){const oldRect=oldPositions.get(slot.dataset.uid);if(oldRect){const now=slot.getBoundingClientRect();slot.animate([{translate:`${oldRect.left-now.left}px ${oldRect.top-now.top}px`},{translate:'0 0'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});}}
  $('end-turn').hidden=o.phase==='terminal';$('confirm').hidden=o.phase==='terminal';
  $('end-turn').replaceChildren(document.createTextNode(battle?'结束回合':o.phase==='reward'?'跳过奖励':`恢复 +${Math.min(18,60-o.player.hp)}`),el('span','','→'));$('end-turn').disabled=busy;
  renderSelection();
  text('game-status',battle?`第 ${o.stage} 幕，第 ${o.turn} 回合。体力 ${o.player.hp}，能量 ${o.energy}。对手${effects(o.intent)}。`:o.phase==='reward'?'本幕完成，选择奖励。':o.phase==='rest'?'幕间休息，恢复体力或升级卡牌。':`旅程结束，${game.result().score} 分。`);
}
function persist(){const record={format:'trinity-save-v1',rules_version:RULES_VERSION,seed,actions:game.history.map(f=>f.action_id)};lastSave=record;try{localStorage.setItem(STORAGE,JSON.stringify(record));text('save-state','已自动保存');}catch{text('save-state','存档空间不可用');}if(game.phase==='terminal'){const result=game.result();try{const old=JSON.parse(localStorage.getItem(BEST)||'null');if(!old||result.score>old.score)localStorage.setItem(BEST,JSON.stringify({...result,seed}));}catch{}}return record;}
function setBusy(value){busy=value;$('confirm').disabled=value||!selected;$('end-turn').disabled=value;for(const n of $('hand').querySelectorAll('button'))n.setAttribute('aria-disabled',String(value||n.classList.contains('unavailable')));}
function float(target,value,cls=''){if(reduced()||!value)return;const n=el('span',`float ${cls}`,typeof value==='number'?`${value>0?'+':''}${value}`:value);$(target).append(n);const a=n.animate([{opacity:0,transform:'translate(-50%,8px)'},{opacity:1,offset:.18},{opacity:0,transform:'translate(-50%,-40px)'}],{duration:750,easing:'ease-out'});a.finished.catch(()=>{}).finally(()=>n.remove());}
async function animate(before,after,action,card){
  if(card?.effects.damage){$('hero').classList.add('lunge');$('enemy').classList.add('hit');tone('hit');const count=card.effects.hits??1;let shield=before.enemy.block;for(let i=0;i<count;i++){const damage=card.effects.damage+before.strength,absorbed=Math.min(shield,damage);shield-=absorbed;float('enemy-floats',damage>absorbed?`−${damage-absorbed}`:'格挡',damage>absorbed?'':'shield');if(i<count-1)await wait(90);}}
  else if(card?.effects.block){$('hero').classList.add('shield-flash');float('hero-floats',`◇ +${card.effects.block}`,'shield');tone('block');}
  else tone('select');
  if(card?.effects.poison)float('enemy-floats',`❋ +${card.effects.poison}`,'heal');
  if(action==='end'&&before.enemy?.poison){float('enemy-floats',`❋ −${Math.min(before.enemy.hp,before.enemy.poison)}`,'heal');await wait(100);}
  if(action==='end'&&before.phase==='battle'&&after.completed===before.completed&&before.intent.damage){$('hero').classList.add('hit');tone('hit');const lost=after.player.hp-before.player.hp;if(lost)float('hero-floats',lost);else float('hero-floats','格挡','shield');}
  if(after.player.hp>before.player.hp)float('hero-floats',after.player.hp-before.player.hp,'heal');
  if(after.completed>before.completed){tone('win');text('scene-banner','这一幕，完成。');const n=$('scene-banner');if(!reduced()){const a=n.animate([{opacity:0},{opacity:1,offset:.3},{opacity:1,offset:.65},{opacity:0}],{duration:650});await a.finished.catch(()=>{});}}
  else await wait(210);
  for(const id of ['hero','enemy'])$(id).classList.remove('hit','lunge','shield-flash');
}
async function perform(action){
  if(busy||!game||game.phase==='terminal')return;
  if(!game.legalActions().some(a=>a.id===action))return;
  setBusy(true);const before=game.observation(),card=action.startsWith('play:')?before.hand.find(c=>`play:${c.uid}`===action):null;
  if(card&&!reduced()){const source=$('hand').querySelector(`[data-action="${action}"]`);if(source){const r=source.getBoundingClientRect(),clone=source.cloneNode(true),stage=$('stage').getBoundingClientRect();clone.className='card played-flight';clone.style.cssText=`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;min-height:0;pointer-events:none;z-index:60;transform:none;`;document.body.append(clone);const a=clone.animate([{opacity:1,transform:'rotate(-3deg) scale(1)'},{opacity:.85,offset:.6},{opacity:0,transform:`translate(${stage.left+stage.width*.5-r.left-r.width/2}px,${stage.top+stage.height*.45-r.top}px) rotate(8deg) scale(.6)`}],{duration:320,easing:'cubic-bezier(.2,.65,.2,1)'});a.finished.catch(()=>{}).finally(()=>clone.remove());}}
  try{const after=game.step(action);selected=null;persist();render();if(before.phase!==after.phase)document.activeElement?.blur?.();await animate(before,after,action,card);if(game.phase==='terminal')showResult();}
  catch(error){toast(`操作未完成：${error.message}`);}
  finally{setBusy(false);}
}
function validSeed(value){if(typeof value!=='string'||!/^[-+]?\d{1,100}$/.test(value.trim()))throw new Error('种子需要填写整数。');return BigInt(value.trim()).toString();}
function randomSeed(){const a=crypto.getRandomValues(new Uint32Array(2));return ((BigInt(a[0])<<32n)|BigInt(a[1])).toString();}
async function begin(value){if(busy)return;setBusy(true);try{seed=validSeed(value);game=await Game.create(seed);selected=null;previousKind=game.enemy.kind;$('modal').close();$('welcome').hidden=true;$('game').hidden=false;persist();render();window.scrollTo({top:0,behavior:'instant'});}catch(error){toast(error.message);}finally{setBusy(false);}}
async function restore(record){
  if(busy)return;
  if(record?.format!=='trinity-save-v1'||record.rules_version!==RULES_VERSION||!Array.isArray(record.actions)||record.actions.length>10000||record.actions.some(a=>typeof a!=='string'||a.length>30))throw new Error('存档格式不支持。');
  const s=validSeed(record.seed),restored=await Game.create(s);
  for(const action of record.actions)restored.step(action);
  game=restored;seed=s;selected=null;previousKind=game.enemy.kind;$('modal').close();$('welcome').hidden=true;$('game').hidden=false;persist();render();if(game.phase==='terminal')showResult();
}
function openModal(title,nodes,eyebrow='TRINITY CARDS'){text('modal-title',title);text('modal-eyebrow',eyebrow);$('modal-content').replaceChildren(...(Array.isArray(nodes)?nodes:[nodes]));if(!$('modal').open)$('modal').showModal();$('modal').scrollTop=0;}
function rules(){const n=el('div','rules-copy');n.innerHTML='<div class="rule-stat"><span>12 场 · 最高 12160 分</span><span>每回合 3 能量 · 抽 5 张</span><span>30 回合上限</span></div><h3>把牌拿在手里</h3><p>鼠标悬停查看完整效果，双击直接出牌，也可把牌拖到舞台松开。手机上轻点查看，再点同一张使用；左右滑动可以看更多手牌。数字键 1–9、0 选牌，回车使用，Esc 收回，E 结束回合。奖励与升级同样可以双击或轻点两次选择。</p><p>能量不够时无法出牌。结束回合会弃掉手牌，由对手执行已经展示的意图；没有操作倒计时。</p><h3>留意这三个状态</h3><ul><li><b>格挡</b>吸收伤害，你的格挡在下回合开始清零。对手的格挡在它下次行动时替换。</li><li><b>力量</b>增加每一段卡牌伤害，仅持续本场战斗。界面上的伤害已计入当前力量。</li><li><b>毒</b>在对手行动前造成伤害，无视格挡，再减少 1。毒击败对手后，它不会行动。</li></ul><h3>十二幕旅程</h3><p>初始体力 60，牌组为 5 张头槌、4 张守护者和 1 张夜想。前十一场胜利恢复 4 体力，再从三张牌里选一张或跳过。第 3、6、9 幕之后，可以恢复 18 体力，或升级一张牌。手牌最多 10 张，每回合最多出牌 20 次。带「消耗」的牌本场移出，下场回到牌组。</p><p>第 3、9 幕对手是星野梦美，第 6、12 幕对手是篝。抽牌堆用尽时，弃牌重新洗入；抽牌堆只展示剩余张数，不展示隐藏顺序。</p><h3>得分与存档</h3><p>得分 = 已完成战斗数 × 1000 + 剩余体力；十二幕全部通关再加 100 分。体力耗尽或结束第 30 回合时本幕仍未获胜，旅程结束。</p><p>每次操作自动保存在当前浏览器。同种子与同操作会得到同一局；菜单可指定种子、导入或导出存档。结算时可导出比赛格式的回放。</p>';openModal('玩法',n,'HOW TO PLAY');}
function showPile(which){if(!game)return;const o=game.observation();let cards=[],title='';const content=el('div');
  if(which==='draw'){title='抽牌堆';content.append(el('p','muted',o.phase==='battle'?`还剩 ${o.draw_count} 张。抽取顺序保持隐藏。`:'下一幕会使用完整牌组重新洗牌。'));if(o.phase==='battle'){const known=new Set([...o.hand,...o.discard,...o.exhaust].map(c=>c.uid));cards=o.deck.filter(c=>!known.has(c.uid)).sort((a,b)=>a.kind.localeCompare(b.kind)||a.uid-b.uid);content.append(el('p','muted','下方按牌种排列，只表示剩余组成。'));}}
  else{title={deck:'完整牌组',discard:'弃牌堆',exhaust:'消耗区'}[which];cards=which==='deck'?o.deck:o[which]??[];if(which==='exhaust')content.append(el('p','muted','这些牌本场不再抽到，下一幕回到牌组。'));}
  const grid=el('div','pile-grid');for(const c of cards)grid.append(makeCard(c));if(!cards.length&&which!=='draw')grid.append(el('p','muted','这里暂时没有牌。'));content.append(grid);openModal(title,content,'YOUR DECK');
}
function showLog(){if(!game)return;const list=el('ol','log-list');for(const frame of game.history.slice(-250)){const o=frame.observation,row=el('li');row.append(el('b','',`${o.phase==='battle'?`${o.stage}幕 T${o.turn}`:o.phase==='reward'?'奖励':'休息'}`),el('span','',frame.events.join(' · ')||frame.action_id));list.append(row);}if(!list.children.length)list.append(el('p','muted','旅程刚刚开始。'));openModal('行动记录',list,'JOURNEY LOG');list.scrollTop=list.scrollHeight;}
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json;charset=utf-8'}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function button(label,fn,cls='secondary'){const b=el('button',cls,label);b.addEventListener('click',fn);return b;}
function menu(){const box=el('div'),list=el('div','menu-grid');if(game){box.append(el('p','seed-display',`种子 ${seed}`));list.append(button('复制本局种子',async()=>{try{await navigator.clipboard.writeText(seed);toast('种子已复制。');}catch{toast(`种子：${seed}`);}},''));list.append(button('查看行动记录',showLog,''),button('导出存档',()=>download(persist(),'trinity-save.json'),''));if(game.phase==='terminal')list.append(button('查看结算',showResult,''));}
  const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;file.addEventListener('change',async()=>{const f=file.files?.[0];if(!f)return;try{if(f.size>1048576)throw new Error('存档不得超过 1 MiB。');await restore(JSON.parse(await f.text()));toast('存档已恢复。');}catch(error){toast(`无法导入：${error.message}`);}});list.append(button('导入存档',()=>file.click(),''));box.append(list,file);
  const row=el('div','seed-row'),input=el('input');input.type='text';input.inputMode='numeric';input.placeholder='指定整数种子（可选）';input.setAttribute('aria-label','新一局的整数种子');row.append(input,button('新旅程',()=>{if(game&&game.phase!=='terminal'){const s=input.value.trim()||randomSeed();const n=el('div');n.append(el('p','muted','开始新旅程会替换当前自动存档。可以先从菜单导出存档。'),button('开始新旅程',()=>begin(s),'primary'));openModal('开始新旅程',n);}else begin(input.value.trim()||randomSeed());}));box.append(row);if(game)box.append(button('同种子重新开始',()=>{const n=el('div');n.append(el('p','muted','将从第一幕重新开始，当前自动存档会被替换。'),button('重新开始',()=>begin(seed),'primary'));openModal('重新开始',n);}));openModal('旅程菜单',box,'YOUR JOURNEY');}
function showResult(){const r=game.result(),box=el('div'),hero=el('div','end-title');hero.append(el('span','','✧'),el('h3','',r.won?'十二幕，都有回声':'故事，留在这一幕'));const total=el('div','end-score',r.score.toLocaleString('en-US'));total.append(el('small','','本次旅程得分'));hero.append(total);const metrics=el('div','end-metrics');for(const [v,label] of [[`${r.completed} / 12`,'完成战斗'],[r.hp,'剩余体力'],[r.reason==='turn_limit'?'30 回合':r.won?'通关':'体力耗尽','旅程记录']]){const n=el('span','',label);n.prepend(el('b','',v));metrics.append(n);}hero.append(metrics);box.append(hero);const actions=el('div','result-actions');actions.append(button('再走一程 ↗',()=>begin(randomSeed()),'primary'),button('同种子重开',()=>begin(seed)),button('导出回放',()=>download(game.replay(),'trinity-replay.json')));box.append(actions,el('p','seed-display',`本局种子：${seed}`));openModal('旅程结算',box,'FIN · TRINITY 2026');}
$('start').addEventListener('click',()=>{const query=new URLSearchParams(location.search).get('seed');begin(query??randomSeed());});
$('resume').addEventListener('click',async()=>{try{await restore(lastSave);}catch(error){toast(`无法继续：${error.message}`);}});
$('confirm').addEventListener('click',()=>{if(selected)perform(selected.id);});
$('end-turn').addEventListener('click',()=>perform(game.phase==='battle'?'end':game.phase==='reward'?'skip':'heal'));
$('rules-open').addEventListener('click',()=>{clearPreview();rules();});$('menu-open').addEventListener('click',()=>{clearPreview();menu();});$('modal-close').addEventListener('click',()=>$('modal').close());$('modal').addEventListener('click',e=>{if(e.target===$('modal')){const r=$('modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('modal').close();}});
$('sound').addEventListener('click',()=>{sound=!sound;updateSound();if(sound)tone('select');});
for(const b of document.querySelectorAll('[data-pile]'))b.addEventListener('click',()=>showPile(b.dataset.pile));$('log-open').addEventListener('click',showLog);
document.addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='?'&&!$('modal').open){e.preventDefault();rules();return;}if(!game||$('game').hidden||$('modal').open||busy)return;if(e.key==='Escape'){clearPreview();return;}if(e.key==='Enter'&&selected){e.preventDefault();perform(selected.id);return;}if(e.key.toLowerCase()==='e'&&game.phase==='battle'){e.preventDefault();perform('end');return;}if(/^\d$/.test(e.key)){e.preventDefault();const i=e.key==='0'?9:Number(e.key)-1,n=$('hand').querySelectorAll('[data-action]')[i];if(n){const o=game.observation(),cards=o.phase==='battle'?o.hand:o.phase==='reward'?o.offers:o.deck.filter(c=>!c.upgraded);select(n.dataset.action,cards[i],o.phase==='rest',n);n.scrollIntoView({behavior:'instant',block:'nearest',inline:'nearest'});}}});
document.addEventListener('pointermove',e=>{
  if(!drag||drag.pointer!==e.pointerId||drag.cancelled)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.started){if(Math.abs(dx)<10&&Math.abs(dy)<10)return;if(drag.type!=='mouse'&&Math.abs(dx)>Math.abs(dy)){drag.cancelled=true;suppressClickUntil=performance.now()+450;return;}if(dy>-10&&drag.type!=='mouse')return;drag.started=true;drag.ghost=drag.node.cloneNode(true);drag.ghost.className='card drag-card';drag.ghost.removeAttribute('id');drag.ghost.setAttribute('aria-hidden','true');document.body.append(drag.ghost);drag.node.setPointerCapture?.(e.pointerId);document.body.classList.add('is-dragging');$('card-detail').hidden=true;}
  e.preventDefault();drag.ghost.style.left=`${e.clientX}px`;drag.ghost.style.top=`${e.clientY}px`;
  const bounds=$('stage').getBoundingClientRect(),over=e.clientX>=bounds.left&&e.clientX<=bounds.right&&e.clientY>=bounds.top&&e.clientY<=bounds.bottom;
  $('stage').classList.toggle('drop-ready',over);
},{passive:false});
function endDrag(e,cancel=false){if(!drag||drag.pointer!==e.pointerId)return;const d=drag;drag=null;if(d.started){suppressClickUntil=performance.now()+450;const target=$('stage').classList.contains('drop-ready');d.ghost?.remove();document.body.classList.remove('is-dragging');$('stage').classList.remove('drop-ready');if(!cancel&&target&&!busy&&game.decisions===d.decision)perform(d.id);}else if(d.cancelled)suppressClickUntil=performance.now()+450;}
document.addEventListener('pointerup',e=>endDrag(e));document.addEventListener('pointercancel',e=>endDrag(e,true));
$('stage').addEventListener('click',()=>{if(!busy&&!drag)clearPreview();});
window.addEventListener('resize',()=>{if(game&&!$('game').hidden){selected=null;render();}});
try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');if(saved?.format==='trinity-save-v1'&&saved.rules_version===RULES_VERSION){lastSave=saved;$('resume').hidden=false;}const best=JSON.parse(localStorage.getItem(BEST)||'null');if(best&&Number.isFinite(best.score))text('best-home',`本机最佳 · ${best.score.toLocaleString('en-US')} 分 · 完成 ${best.completed} 幕`);}catch{}
document.addEventListener('visibilitychange',()=>{if(document.hidden){for(const a of document.getAnimations())if(a.effect?.target?.matches?.('.float,.scene-banner'))a.finish();if(game)persist();}});
