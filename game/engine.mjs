export const RULES_VERSION = 'trinity-cards-2026-12-c0c48f2b3c';
export const TOTAL_STAGES = 12;
export const MAX_SCORE = 12160;
const HP_BONUS = [4,18,0,20,26,8,42,54,28,72,88,72];
const DAMAGE_BONUS = [1,3,2,3,4,0,6,7,5,9,10,7];
export const CARDS = {
  strike:['头槌',1,{damage:6},{damage:9}],
  guard:['守护者',1,{block:5},{block:8}],
  insight:['夜想',1,{draw:2},{draw:3}],
  spark:['满天的星光',0,{damage:3},{damage:5}],
  heavy:['风子出击',2,{damage:17},{damage:22}],
  echo:['回响施放',1,{damage:4,hits:2},{damage:5,hits:2}],
  shelter:['小鸟的庇护',2,{block:16},{block:21}],
  focus:['我变强了',1,{strength:2,exhaust:true},{strength:3,exhaust:true}],
  mist:['桃子果汁',1,{poison:4},{poison:6}],
  rush:['智代的晚餐',0,{energy:2,exhaust:true},{energy:3,exhaust:true}],
  sweep:['藤林姐妹的帮助',1,{damage:4,block:4},{damage:6,block:6}],
  sustain:['捕球手',1,{block:4,draw:1},{block:7,draw:1}],
};
export const ENEMIES = {
  shadow:['鸣濑白羽',28,[{damage:6},{damage:8},{block:5,damage:4}]],
  storm:['神尾观铃',34,[{damage:4,hits:2},{damage:10},{strength:2}]],
  shell:['月宫亚由',38,[{block:10,damage:3},{damage:10},{damage:7}]],
  clock:['枣铃',32,[{strength:2},{damage:5,hits:2},{damage:12}]],
  guardian:['星野梦美',74,[{damage:10},{block:8,damage:6},{strength:2},{damage:5,hits:3}]],
  winter:['篝',56,[{damage:7,hits:2},{block:12,strength:1},{damage:14},{damage:5,hits:3}]],
};
const copy = v => structuredClone(v);
const encoder = new TextEncoder();
const MASK = (1n << 64n) - 1n;

class RandomStream {
  static async create(seed, domain) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(`${seed}:${domain}`)));
    const stream = new RandomStream();
    stream.state = bytes.slice(0,8).reduce((n,b)=>(n<<8n)|BigInt(b),0n);
    return stream;
  }
  next() {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    return z ^ (z >> 31n);
  }
  below(n) {
    const size = BigInt(n), limit = (1n << 64n) - ((1n << 64n) % size);
    for (;;) { const v = this.next(); if (v < limit) return Number(v % size); }
  }
  shuffle(values) {
    for (let i = values.length - 1; i > 0; i--) {
      const j = this.below(i + 1); [values[i],values[j]] = [values[j],values[i]];
    }
  }
}

export class Game {
  static async create(seed) {
    const normalized = BigInt(seed).toString();
    const g = new Game();
    g._rng = Object.fromEntries(await Promise.all(['draw','encounter','reward'].map(async k=>[k,await RandomStream.create(normalized,k)])));
    g.deck = []; g._uid = 0;
    for (const k of [...Array(5).fill('strike'),...Array(4).fill('guard'),'insight']) g.deck.push(g._card(k));
    g.hp = 60; g.max_hp = 60; g.completed = 0; g.decisions = 0;
    g.phase = 'battle'; g.reason = null; g.history = [];
    g._startBattle();
    return g;
  }
  _card(kind) { return {uid:++this._uid,kind,upgraded:false}; }
  static cardInfo(c) {
    const [name,cost,base,upgraded] = CARDS[c.kind];
    return {...c,name:name+(c.upgraded?'+':''),cost,effects:copy(c.upgraded?upgraded:base)};
  }
  _startBattle() {
    const stage = this.completed + 1;
    const kind = [3,9].includes(stage)?'guardian':[6,12].includes(stage)?'winter':Object.keys(ENEMIES)[this._rng.encounter.below(4)];
    const [name,hp,pattern] = ENEMIES[kind], total = hp+HP_BONUS[stage-1];
    this.enemy = {kind,name,hp:total,maxHp:total,block:0,strength:0,poison:0};
    this._pattern = copy(pattern); this._pattern_offset = this._rng.encounter.below(pattern.length);
    this.hand = []; this.draw_pile = copy(this.deck); this.discard = []; this.exhaust = [];
    this._rng.draw.shuffle(this.draw_pile);
    this.strength = 0; this.turn = 0; this.phase = 'battle'; this._beginTurn();
  }
  _draw(count) {
    for (let i=0;i<count;i++) {
      if (this.hand.length>=10) break;
      if (!this.draw_pile.length) {
        if (!this.discard.length) break;
        [this.draw_pile,this.discard] = [this.discard,[]]; this._rng.draw.shuffle(this.draw_pile);
      }
      this.hand.push(this.draw_pile.pop());
    }
  }
  _beginTurn() { this.turn++; this.energy=3; this.block=0; this.turn_actions=0; this._draw(5); }
  intent() {
    const it = copy(this._pattern[(this._pattern_offset+this.turn-1)%this._pattern.length]);
    if ('damage' in it) { it.damage+=this.enemy.strength+DAMAGE_BONUS[this.completed]; it.hits??=1; }
    return it;
  }
  legalActions() {
    if (this.phase==='battle') return [...(this.turn_actions<20?this.hand.filter(c=>Game.cardInfo(c).cost<=this.energy).map(c=>({id:`play:${c.uid}`,type:'play',cardUid:c.uid})):[]),{id:'end',type:'end_turn'}];
    if (this.phase==='reward') return [...[0,1,2].map(i=>({id:`pick:${i}`,type:'pick',index:i})),{id:'skip',type:'skip'}];
    if (this.phase==='rest') return [{id:'heal',type:'heal',amount:Math.min(18,60-this.hp)},...this.deck.filter(c=>!c.upgraded).map(c=>({id:`upgrade:${c.uid}`,type:'upgrade',cardUid:c.uid}))];
    return [];
  }
  observation() {
    const o = {rules_version:RULES_VERSION,phase:this.phase,decision:this.decisions,stage:Math.min(this.completed+1,12),completed:this.completed,player:{hp:this.hp,max_hp:60},deck:this.deck.map(Game.cardInfo),legal_actions:this.legalActions()};
    if (this.phase==='battle') Object.assign(o,{turn:this.turn,hand:this.hand.map(Game.cardInfo),energy:this.energy,block:this.block,strength:this.strength,draw_count:this.draw_pile.length,discard:this.discard.map(Game.cardInfo),exhaust:this.exhaust.map(Game.cardInfo),enemy:copy(this.enemy),intent:this.intent(),actions_remaining:20-this.turn_actions});
    else if(this.phase==='reward') o.offers=this.offers.map(Game.cardInfo);
    else if(this.phase==='terminal') o.result=this.result();
    return o;
  }
  static _damage(target,amount) {
    const absorbed = Math.min(target.block,amount); target.block-=absorbed; target.hp=Math.max(0,target.hp-(amount-absorbed));
  }
  _victory() {
    this.completed++;
    if (this.completed===12) { this.phase='terminal'; this.reason='victory'; return; }
    this.hp=Math.min(60,this.hp+4);
    const kinds=Object.keys(CARDS).slice(3); this._rng.reward.shuffle(kinds);
    this.offers=kinds.slice(0,3).map(k=>this._card(k)); this.phase='reward';
  }
  abort(reason) { if(this.phase!=='terminal'){this.phase='terminal';this.reason=reason;} }
  step(action) {
    if (typeof action!=='string'||!this.legalActions().some(a=>a.id===action)) throw new Error('无效操作');
    const before=this.observation(), events=[]; this.decisions++;
    if (this.phase==='battle') {
      if (action!=='end') {
        const uid=Number(action.split(':')[1]),index=this.hand.findIndex(c=>c.uid===uid),[card]=this.hand.splice(index,1);
        const info=Game.cardInfo(card),e=info.effects;
        this.energy-=info.cost; this.turn_actions++;
        (e.exhaust?this.exhaust:this.discard).push(card); events.push(`打出 ${info.name}`);
        for(let i=0;i<(e.hits??1);i++) if('damage' in e) Game._damage(this.enemy,e.damage+this.strength);
        this.block+=e.block??0; this.strength+=e.strength??0; this.enemy.poison+=e.poison??0; this.energy+=e.energy??0; this._draw(e.draw??0);
        if(this.enemy.hp===0){this._victory();events.push('战斗胜利');}
      } else {
        this.discard.push(...this.hand); this.hand=[];
        const poison=this.enemy.poison; this.enemy.hp=Math.max(0,this.enemy.hp-poison);this.enemy.poison=Math.max(0,poison-1);
        if(this.enemy.hp===0){this._victory();events.push('中毒击败对手');}
        else {
          const intent=this.intent(); this.enemy.block=intent.block??0;this.enemy.strength+=intent.strength??0;
          const player={hp:this.hp,block:this.block};
          for(let i=0;i<(intent.hits??1);i++)Game._damage(player,intent.damage??0);
          this.hp=player.hp;this.block=player.block;events.push('敌人行动');
          if(this.hp===0)this.abort('defeat'); else if(this.turn>=30)this.abort('turn_limit'); else this._beginTurn();
        }
      }
    } else if(this.phase==='reward') {
      if(action!=='skip') { const card=this.offers[Number(action.split(':')[1])];this.deck.push(copy(card));events.push(`获得 ${Game.cardInfo(card).name}`); }
      else events.push('跳过选牌');
      if([3,6,9].includes(this.completed))this.phase='rest';else this._startBattle();
    } else {
      if(action==='heal'){this.hp=Math.min(60,this.hp+18);events.push('休息恢复体力');}
      else{this.deck.find(c=>c.uid===Number(action.split(':')[1])).upgraded=true;events.push('升级卡牌');}
      this._startBattle();
    }
    this.history.push({observation:before,action_id:action,events});
    return this.observation();
  }
  result() {
    const won=this.completed===12;
    return {score:1000*this.completed+(won?100:0)+this.hp,won,completed:this.completed,hp:this.hp,reason:this.reason,decisions:this.decisions};
  }
  replay() {return {rules_version:RULES_VERSION,frames:copy(this.history),final:this.observation(),result:this.result()};}
}
