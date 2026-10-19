import random
import time
from functools import lru_cache
KINDS = ('strike', 'guard', 'insight', 'spark', 'heavy', 'echo', 'shelter', 'focus', 'mist', 'rush', 'sweep', 'sustain')
INDEX = {k: i * 2 for i, k in enumerate(KINDS)}
CARDS = ((1, 6, 1, 0, 0, 0, 0, 0, 0), (1, 9, 1, 0, 0, 0, 0, 0, 0), (1, 0, 0, 5, 0, 0, 0, 0, 0), (1, 0, 0, 8, 0, 0, 0, 0, 0), (1, 0, 0, 0, 0, 0, 0, 2, 0), (1, 0, 0, 0, 0, 0, 0, 3, 0), (0, 3, 1, 0, 0, 0, 0, 0, 0), (0, 5, 1, 0, 0, 0, 0, 0, 0), (2, 17, 1, 0, 0, 0, 0, 0, 0), (2, 22, 1, 0, 0, 0, 0, 0, 0), (1, 4, 2, 0, 0, 0, 0, 0, 0), (1, 5, 2, 0, 0, 0, 0, 0, 0), (2, 0, 0, 16, 0, 0, 0, 0, 0), (2, 0, 0, 21, 0, 0, 0, 0, 0), (1, 0, 0, 0, 2, 0, 0, 0, 1), (1, 0, 0, 0, 3, 0, 0, 0, 1), (1, 0, 0, 0, 0, 4, 0, 0, 0), (1, 0, 0, 0, 0, 6, 0, 0, 0), (0, 0, 0, 0, 0, 0, 2, 0, 1), (0, 0, 0, 0, 0, 0, 3, 0, 1), (1, 4, 1, 4, 0, 0, 0, 0, 0), (1, 6, 1, 6, 0, 0, 0, 0, 0), (1, 0, 0, 4, 0, 0, 0, 1, 0), (1, 0, 0, 7, 0, 0, 0, 1, 0))
PATTERNS = {'shadow': ((6, 1, 0, 0), (8, 1, 0, 0), (4, 1, 5, 0)), 'storm': ((4, 2, 0, 0), (10, 1, 0, 0), (0, 0, 0, 2)), 'shell': ((3, 1, 10, 0), (10, 1, 0, 0), (7, 1, 0, 0)), 'clock': ((0, 0, 0, 2), (5, 2, 0, 0), (12, 1, 0, 0)), 'guardian': ((10, 1, 0, 0), (6, 1, 8, 0), (0, 0, 0, 2), (5, 3, 0, 0)), 'winter': ((7, 2, 0, 0), (0, 0, 12, 1), (14, 1, 0, 0), (5, 3, 0, 0))}
BASE_HP = {'shadow': 28, 'storm': 34, 'shell': 38, 'clock': 32, 'guardian': 74, 'winter': 56}
HP_BONUS = (4, 18, 0, 20, 26, 8, 42, 54, 28, 72, 88, 72)
DMG_BONUS = (1, 3, 2, 3, 4, 0, 6, 7, 5, 9, 10, 7)
NORMAL = ('shadow', 'storm', 'shell', 'clock')
SETTINGS = {'damage': 0.6, 'strength': 2.0, 'poison': 0.6, 'draw': 0.05, 'candidates': 18, 'samples': 96, 'draft_samples': 96, 'horizon': 12, 'decision_seconds': 0.4, 'draft_seconds': 0.55, 'game_seconds': 24.0, 'health_value': 26.0, 'risk': 0.0}
_CPU = 0.0
_DEADLINE = 0.0
_CALLS = 0

def _code(c):
    return INDEX[c['kind']] + int(c['upgraded'])

def _score(hp, eh, poison, strength, block, inc, draws, energy, weight):
    eh -= poison
    if eh <= 0:
        return 10000.0
    loss = max(0, inc - block)
    if loss >= hp:
        return -100000.0 - eh
    future = min(eh, max(0, poison - 1) * poison * 0.5)
    return -loss - weight * eh + SETTINGS['poison'] * weight * future + SETTINGS['strength'] * strength * min(1.0, 0.3 + eh / 25) + SETTINGS['draw'] * draws * (1 + min(3, energy)) - SETTINGS['risk'] * loss * loss / max(1, hp)

def _plans(hand, energy, block, strength, eh, eb, poison, hp, inc, left, count):
    hand = tuple(sorted(hand))
    seen = set()
    outcomes = []
    visits = 0

    def visit(hand, en, bl, st, eh, eb, po, drawn, path):
        nonlocal visits
        visits += 1
        if visits > 1600:
            return
        key = (hand, en, min(bl, inc), st, eh, eb, po, drawn)
        if key in seen:
            return
        seen.add(key)
        outcomes.append((eh, po, bl, st, drawn, en, path))
        if eh <= 0 or len(path) >= left:
            return
        prev = -1
        for i, c in enumerate(hand):
            if c == prev:
                continue
            prev = c
            cost, dmg, hits, guard, gain, venom, mana, draw, exhaust = CARDS[c]
            if cost > en or (not (dmg or gain or venom or mana or draw) and bl >= inc):
                continue
            attack = (dmg + st) * hits
            nh = eh - max(0, attack - eb)
            rest = path + (c,)
            if draw:
                outcomes.append((nh, po + venom, bl + guard, st + gain, drawn + draw, en - cost + mana, rest))
            else:
                visit(hand[:i] + hand[i + 1:], en - cost + mana, bl + guard, st + gain, nh, max(0, eb - attack), po + venom, drawn, rest)
    visit(hand, energy, block, strength, eh, eb, poison, 0, ())
    if not outcomes:
        return [()]
    weight = SETTINGS['damage']
    if count == 1:
        return [max(outcomes, key=lambda r: (_score(hp, *r[:2], r[3], r[2], inc, r[4], r[5], weight), -len(r[6])))[6]]
    result = []
    used = set()
    for w, n in ((weight, max(1, count - 4)), (weight * 2.7, 2), (weight * 0.35, 2)):
        ranked = sorted(outcomes, key=lambda r: (_score(hp, *r[:2], r[3], r[2], inc, r[4], r[5], w), -len(r[6])), reverse=True)
        for r in ranked:
            if r[6] in used:
                continue
            used.add(r[6])
            result.append(r[6])
            n -= 1
            if n <= 0:
                break
    return result

@lru_cache(maxsize=16000)
def _policy(hand, energy, block, strength, eh, eb, poison, hp, inc, left):
    return _plans(hand, energy, block, strength, eh, eb, poison, hp, inc, left, 1)[0]

def _fight(state, pattern, bonus, seed, first=None, utility=True):
    hp, eh, eb, es, poison, strength, energy, block, hand, pile, discard, turn, pos, left = state
    hand, pile, discard = (list(hand), list(pile), list(discard))
    rng = random.Random(seed)
    rng.shuffle(pile)
    seq = first
    for _ in range(45):
        d, h, shield, gain = pattern[pos]
        inc = (d + es + bonus) * h
        if seq is None:
            seq = _policy(tuple(sorted(hand)), energy, block, strength, eh, eb, poison, min(hp, inc + 1), inc, left)
        while seq:
            redrawn = False
            for c in seq:
                if c not in hand or left <= 0 or CARDS[c][0] > energy:
                    break
                hand.remove(c)
                cost, dmg, hits, guard, gain_st, venom, mana, draw, exhaust = CARDS[c]
                energy += mana - cost
                left -= 1
                if not exhaust:
                    discard.append(c)
                attack = (dmg + strength) * hits
                eh -= max(0, attack - eb)
                eb = max(0, eb - attack)
                block += guard
                poison += venom
                strength += gain_st
                if eh <= 0:
                    return hp
                for _ in range(draw):
                    if len(hand) >= 10:
                        break
                    if not pile:
                        if not discard:
                            break
                        pile, discard = (discard, [])
                        rng.shuffle(pile)
                    hand.append(pile.pop())
                    redrawn = True
                if draw:
                    break
            if redrawn:
                seq = _policy(tuple(sorted(hand)), energy, block, strength, eh, eb, poison, min(hp, inc + 1), inc, left)
            else:
                break
        eh -= poison
        poison = max(0, poison - 1)
        if eh <= 0:
            return hp
        hp -= max(0, inc - block)
        if hp <= 0:
            return -min(120, max(0, eh)) * 0.02 - 0.01 if utility else 0
        if turn >= 30:
            return -1.0 if utility else 0
        es += gain
        eb = shield
        discard.extend(hand)
        hand = []
        for _ in range(5):
            if not pile:
                if not discard:
                    break
                pile, discard = (discard, [])
                rng.shuffle(pile)
            hand.append(pile.pop())
        energy, block, left = (3, 0, 20)
        turn += 1
        pos = (pos + 1) % len(pattern)
        seq = None
    return -1.0 if utility else 0

def _state(deck, hp, stage, kind, offset, seed):
    pile = list(deck)
    random.Random(seed).shuffle(pile)
    hand, pile = (pile[-5:], pile[:-5])
    return (hp, BASE_HP[kind] + HP_BONUS[stage - 1], 0, 0, 0, 0, 3, 0, hand, pile, (), 1, offset, 20)

def _campaign(deck, hp, completed, seed):
    rng = random.Random(seed)
    score = 1000 * completed
    end = min(12, completed + SETTINGS['horizon'])
    for stage in range(completed + 1, end + 1):
        kind = 'guardian' if stage in (3, 9) else 'winter' if stage in (6, 12) else NORMAL[rng.randrange(4)]
        pattern = PATTERNS[kind]
        salt = rng.randrange(2 ** 31)
        state = _state(deck, hp, stage, kind, rng.randrange(len(pattern)), salt)
        hp = _fight(state, pattern, DMG_BONUS[stage - 1], salt, utility=False)
        if hp <= 0:
            return score
        score += 1000
        if stage == 12:
            return score + 100 + hp
        hp = min(60, hp + 4 + (18 if stage in (3, 6, 9) else 0))
    return score + hp * SETTINGS['health_value']

def _draft(o):
    deck = tuple((_code(c) for c in o['deck']))
    hp = o['player']['hp']
    completed = o['completed']
    options = []
    if o['phase'] == 'reward':
        if completed in (3, 6, 9):
            hp = min(60, hp + 18)
        options = [(f'pick:{i}', deck + (_code(c),), hp) for i, c in enumerate(o['offers'])]
        options.append(('skip', deck, hp))
    else:
        if hp <= 42:
            return 'heal'
        options = [('heal', deck, min(60, hp + 18))]
        seen = set()
        for i, card in enumerate(o['deck']):
            c = _code(card)
            if card['upgraded'] or c in seen:
                continue
            seen.add(c)
            options.append((f"upgrade:{card['uid']}", deck[:i] + (c + 1,) + deck[i + 1:], hp))
    totals = [0.0] * len(options)
    n = 0
    for sample in range(SETTINGS['draft_samples']):
        salt = 170119 + o['decision'] * 12377 + sample * 100003
        for i, (_, d, h) in enumerate(options):
            totals[i] += _campaign(d, h, completed, salt)
        n += 1
        if time.perf_counter() > _DEADLINE:
            break
    best = max(range(len(options)), key=lambda i: (totals[i] / n, -i))
    return options[best][0]

def _battle(o):
    if len(o['legal_actions']) == 1:
        return 'end'
    enemy, intent = (o['enemy'], o['intent'])
    hand = tuple((_code(c) for c in o['hand']))
    inc = intent.get('damage', 0) * intent.get('hits', 1)
    candidates = _plans(hand, o['energy'], o['block'], o['strength'], enemy['hp'], enemy['block'], enemy['poison'], o['player']['hp'], inc, o['actions_remaining'], SETTINGS['candidates'])
    chosen = candidates[0]
    if len(candidates) > 1 and _CPU < SETTINGS['game_seconds']:
        known = {c['uid'] for key in ('hand', 'discard', 'exhaust') for c in o[key]}
        pile = tuple((_code(c) for c in o['deck'] if c['uid'] not in known))
        discard = tuple((_code(c) for c in o['discard']))
        pattern = PATTERNS[enemy['kind']]
        bonus = DMG_BONUS[o['stage'] - 1]
        pos = 0
        for i, (d, h, b, s) in enumerate(pattern):
            if (d + enemy['strength'] + bonus) * h == inc and b == intent.get('block', 0) and (s == intent.get('strength', 0)):
                pos = i
                break
        state = (o['player']['hp'], enemy['hp'], enemy['block'], enemy['strength'], enemy['poison'], o['strength'], o['energy'], o['block'], hand, pile, discard, o['turn'], pos, o['actions_remaining'])
        sums = [0.0] * len(candidates)
        counts = [0] * len(candidates)
        active = list(range(len(candidates)))
        for sample in range(SETTINGS['samples']):
            salt = o['decision'] * 1000003 + sample * 7919 + 34171
            for i in active:
                health = _fight(state, pattern, bonus, salt, candidates[i])
                value = 1000 + health * SETTINGS['health_value'] if health > 0 else health
                sums[i] += value
                counts[i] += 1
            if sample in (3, 7, 15):
                active.sort(key=lambda i: (sums[i] / counts[i], -i), reverse=True)
                active = active[:max(2, (len(active) + 1) // 2)]
            if time.perf_counter() > _DEADLINE:
                break
        best = max(active, key=lambda i: (sums[i] / max(1, counts[i]), -i))
        chosen = candidates[best]
    if not chosen:
        return 'end'
    return next((f"play:{c['uid']}" for c in o['hand'] if _code(c) == chosen[0]))

def act(observation, memory):
    global _CPU, _DEADLINE, _CALLS
    started = time.process_time()
    if observation['decision'] == 0:
        _CPU = 0.0
        _CALLS = 0
        _policy.cache_clear()
    phase = observation['phase']
    cap = SETTINGS['decision_seconds'] if phase == 'battle' else SETTINGS['draft_seconds']
    _DEADLINE = time.perf_counter() + min(cap, max(0.005, SETTINGS['game_seconds'] - _CPU))
    if phase == 'battle':
        action = _battle(observation)
    elif phase in ('reward', 'rest'):
        action = _draft(observation)
    else:
        action = observation['legal_actions'][0]['id']
    _CPU += time.process_time() - started
    _CALLS += 1
    return {'action_id': action, 'memory': None}
