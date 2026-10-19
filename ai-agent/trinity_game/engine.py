import copy
import hashlib
RULES_VERSION = 'trinity-cards-2026-12-c0c48f2b3c'
TOTAL_STAGES = 12
MAX_SCORE = 12160
STAGE_HP_BONUS = (4, 18, 0, 20, 26, 8, 42, 54, 28, 72, 88, 72)
STAGE_DAMAGE_BONUS = (1, 3, 2, 3, 4, 0, 6, 7, 5, 9, 10, 7)

class RandomStream:

    def __init__(self, seed, domain):
        self.state = int.from_bytes(hashlib.sha256(f'{seed}:{domain}'.encode()).digest()[:8], 'big')

    def next(self):
        mask = (1 << 64) - 1
        self.state = self.state + 11400714819323198485 & mask
        z = self.state
        z = (z ^ z >> 30) * 13787848793156543929 & mask
        z = (z ^ z >> 27) * 10723151780598845931 & mask
        return z ^ z >> 31

    def below(self, n):
        limit = (1 << 64) - (1 << 64) % n
        while True:
            value = self.next()
            if value < limit:
                return value % n

    def shuffle(self, values):
        for i in range(len(values) - 1, 0, -1):
            j = self.below(i + 1)
            values[i], values[j] = (values[j], values[i])
CARDS = {'strike': ('头槌', 1, {'damage': 6}, {'damage': 9}), 'guard': ('守护者', 1, {'block': 5}, {'block': 8}), 'insight': ('夜想', 1, {'draw': 2}, {'draw': 3}), 'spark': ('满天的星光', 0, {'damage': 3}, {'damage': 5}), 'heavy': ('风子出击', 2, {'damage': 17}, {'damage': 22}), 'echo': ('回响施放', 1, {'damage': 4, 'hits': 2}, {'damage': 5, 'hits': 2}), 'shelter': ('小鸟的庇护', 2, {'block': 16}, {'block': 21}), 'focus': ('我变强了', 1, {'strength': 2, 'exhaust': True}, {'strength': 3, 'exhaust': True}), 'mist': ('桃子果汁', 1, {'poison': 4}, {'poison': 6}), 'rush': ('智代的晚餐', 0, {'energy': 2, 'exhaust': True}, {'energy': 3, 'exhaust': True}), 'sweep': ('藤林姐妹的帮助', 1, {'damage': 4, 'block': 4}, {'damage': 6, 'block': 6}), 'sustain': ('捕球手', 1, {'block': 4, 'draw': 1}, {'block': 7, 'draw': 1})}
REWARDS = list(CARDS)[3:]
ENEMIES = {'shadow': ('鸣濑白羽', 28, [{'damage': 6}, {'damage': 8}, {'block': 5, 'damage': 4}]), 'storm': ('神尾观铃', 34, [{'damage': 4, 'hits': 2}, {'damage': 10}, {'strength': 2}]), 'shell': ('月宫亚由', 38, [{'block': 10, 'damage': 3}, {'damage': 10}, {'damage': 7}]), 'clock': ('枣铃', 32, [{'strength': 2}, {'damage': 5, 'hits': 2}, {'damage': 12}]), 'guardian': ('星野梦美', 74, [{'damage': 10}, {'block': 8, 'damage': 6}, {'strength': 2}, {'damage': 5, 'hits': 3}]), 'winter': ('篝', 56, [{'damage': 7, 'hits': 2}, {'block': 12, 'strength': 1}, {'damage': 14}, {'damage': 5, 'hits': 3}])}

class Game:

    def __init__(self, seed):
        self._rng = {k: RandomStream(seed, k) for k in ['draw', 'encounter', 'reward']}
        self.deck = []
        self._uid = 0
        for kind in ['strike'] * 5 + ['guard'] * 4 + ['insight']:
            self.deck.append(self._card(kind))
        self.hp = self.max_hp = 60
        self.completed = 0
        self.decisions = 0
        self.phase = 'battle'
        self.reason = None
        self.history = []
        self._start_battle()

    def _card(self, kind):
        self._uid += 1
        return {'uid': self._uid, 'kind': kind, 'upgraded': False}

    @staticmethod
    def card_info(card):
        name, cost, base, upgraded = CARDS[card['kind']]
        return {**card, 'name': name + ('+' if card['upgraded'] else ''), 'cost': cost, 'effects': copy.deepcopy(upgraded if card['upgraded'] else base)}

    def _start_battle(self):
        stage = self.completed + 1
        kind = 'guardian' if stage in (3, 9) else 'winter' if stage in (6, 12) else list(ENEMIES)[:4][self._rng['encounter'].below(4)]
        name, hp, pattern = ENEMIES[kind]
        bonus = STAGE_HP_BONUS[stage - 1]
        self.enemy = {'kind': kind, 'name': name, 'hp': hp + bonus, 'maxHp': hp + bonus, 'block': 0, 'strength': 0, 'poison': 0}
        self._pattern = copy.deepcopy(pattern)
        self._pattern_offset = self._rng['encounter'].below(len(pattern))
        self.hand = []
        self.draw_pile = copy.deepcopy(self.deck)
        self.discard = []
        self.exhaust = []
        self._rng['draw'].shuffle(self.draw_pile)
        self.strength = 0
        self.turn = 0
        self.phase = 'battle'
        self._begin_turn()

    def _draw(self, count):
        for _ in range(count):
            if len(self.hand) >= 10:
                break
            if not self.draw_pile:
                if not self.discard:
                    break
                self.draw_pile, self.discard = (self.discard, [])
                self._rng['draw'].shuffle(self.draw_pile)
            self.hand.append(self.draw_pile.pop())

    def _begin_turn(self):
        self.turn += 1
        self.energy = 3
        self.block = 0
        self.turn_actions = 0
        self._draw(5)

    def intent(self):
        result = copy.deepcopy(self._pattern[(self._pattern_offset + self.turn - 1) % len(self._pattern)])
        if 'damage' in result:
            result['damage'] += self.enemy['strength'] + STAGE_DAMAGE_BONUS[self.completed]
            result['hits'] = result.get('hits', 1)
        return result

    def legal_actions(self):
        if self.phase == 'battle':
            values = [{'id': 'end', 'type': 'end_turn'}]
            if self.turn_actions < 20:
                values = [{'id': f"play:{c['uid']}", 'type': 'play', 'cardUid': c['uid']} for c in self.hand if self.card_info(c)['cost'] <= self.energy] + values
            return values
        if self.phase == 'reward':
            return [{'id': f'pick:{i}', 'type': 'pick', 'index': i} for i in range(3)] + [{'id': 'skip', 'type': 'skip'}]
        if self.phase == 'rest':
            return [{'id': 'heal', 'type': 'heal', 'amount': min(18, 60 - self.hp)}] + [{'id': f"upgrade:{c['uid']}", 'type': 'upgrade', 'cardUid': c['uid']} for c in self.deck if not c['upgraded']]
        return []

    def observation(self):
        result = {'rules_version': RULES_VERSION, 'phase': self.phase, 'decision': self.decisions, 'stage': min(self.completed + 1, TOTAL_STAGES), 'completed': self.completed, 'player': {'hp': self.hp, 'max_hp': 60}, 'deck': [self.card_info(c) for c in self.deck], 'legal_actions': self.legal_actions()}
        if self.phase == 'battle':
            result.update(turn=self.turn, hand=[self.card_info(c) for c in self.hand], energy=self.energy, block=self.block, strength=self.strength, draw_count=len(self.draw_pile), discard=[self.card_info(c) for c in self.discard], exhaust=[self.card_info(c) for c in self.exhaust], enemy=copy.deepcopy(self.enemy), intent=self.intent(), actions_remaining=20 - self.turn_actions)
        elif self.phase == 'reward':
            result['offers'] = [self.card_info(c) for c in self.offers]
        elif self.phase == 'terminal':
            result['result'] = self.result()
        return result

    @staticmethod
    def _damage(target, amount):
        absorbed = min(target['block'], amount)
        target['block'] -= absorbed
        target['hp'] = max(0, target['hp'] - (amount - absorbed))

    def _victory(self):
        self.completed += 1
        if self.completed == TOTAL_STAGES:
            self.phase = 'terminal'
            self.reason = 'victory'
            return
        self.hp = min(60, self.hp + 4)
        kinds = REWARDS[:]
        self._rng['reward'].shuffle(kinds)
        self.offers = [self._card(kind) for kind in kinds[:3]]
        self.phase = 'reward'

    def abort(self, reason):
        if self.phase != 'terminal':
            self.phase = 'terminal'
            self.reason = reason

    def step(self, action_id):
        if not isinstance(action_id, str) or action_id not in {a['id'] for a in self.legal_actions()}:
            raise ValueError('Illegal action')
        before = self.observation()
        self.decisions += 1
        events = []
        if self.phase == 'battle':
            if action_id != 'end':
                uid = int(action_id.split(':')[1])
                card = next((c for c in self.hand if c['uid'] == uid))
                self.hand.remove(card)
                info = self.card_info(card)
                effect = info['effects']
                self.energy -= info['cost']
                self.turn_actions += 1
                (self.exhaust if effect.get('exhaust') else self.discard).append(card)
                events.append(f"打出 {info['name']}")
                for _ in range(effect.get('hits', 1)):
                    if 'damage' in effect:
                        self._damage(self.enemy, effect['damage'] + self.strength)
                self.block += effect.get('block', 0)
                self.strength += effect.get('strength', 0)
                self.enemy['poison'] += effect.get('poison', 0)
                self.energy += effect.get('energy', 0)
                self._draw(effect.get('draw', 0))
                if self.enemy['hp'] == 0:
                    self._victory()
                    events.append('战斗胜利')
            else:
                self.discard.extend(self.hand)
                self.hand = []
                poison = self.enemy['poison']
                self.enemy['hp'] = max(0, self.enemy['hp'] - poison)
                self.enemy['poison'] = max(0, poison - 1)
                if self.enemy['hp'] == 0:
                    self._victory()
                    events.append('中毒击败对手')
                else:
                    intent = self.intent()
                    self.enemy['block'] = intent.get('block', 0)
                    self.enemy['strength'] += intent.get('strength', 0)
                    player = {'hp': self.hp, 'block': self.block}
                    for _ in range(intent.get('hits', 1)):
                        self._damage(player, intent.get('damage', 0))
                    self.hp, self.block = (player['hp'], player['block'])
                    events.append('敌人行动')
                    if self.hp == 0:
                        self.abort('defeat')
                    elif self.turn >= 30:
                        self.abort('turn_limit')
                    else:
                        self._begin_turn()
        elif self.phase == 'reward':
            if action_id != 'skip':
                card = self.offers[int(action_id.split(':')[1])]
                self.deck.append(copy.deepcopy(card))
                events.append(f"获得 {self.card_info(card)['name']}")
            else:
                events.append('跳过选牌')
            if self.completed in (3, 6, 9):
                self.phase = 'rest'
            else:
                self._start_battle()
        else:
            if action_id == 'heal':
                self.hp = min(60, self.hp + 18)
                events.append('休息恢复体力')
            else:
                uid = int(action_id.split(':')[1])
                next((c for c in self.deck if c['uid'] == uid))['upgraded'] = True
                events.append('升级卡牌')
            self._start_battle()
        self.history.append({'observation': before, 'action_id': action_id, 'events': events})
        return self.observation()

    def result(self):
        won = self.completed == TOTAL_STAGES
        return {'score': 1000 * self.completed + (100 if won else 0) + self.hp, 'won': won, 'completed': self.completed, 'hp': self.hp, 'reason': self.reason, 'decisions': self.decisions}

    def replay(self):
        return {'rules_version': RULES_VERSION, 'frames': copy.deepcopy(self.history), 'final': self.observation(), 'result': self.result()}
