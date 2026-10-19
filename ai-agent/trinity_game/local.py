import argparse
import importlib.util
import json
from pathlib import Path
from .engine import Game, RULES_VERSION

def load_agent(path):
    spec = importlib.util.spec_from_file_location('participant_agent', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not callable(getattr(module, 'act', None)):
        raise ValueError('agent.py must define act(observation, memory)')
    return module.act

def play(callback, seed):
    game = Game(seed)
    memory = None
    while game.phase != 'terminal':
        reply = callback(game.observation(), memory)
        if not isinstance(reply, dict) or set(reply) - {'action_id', 'memory'}:
            raise ValueError('Return {"action_id": ..., "memory": ...}')
        encoded = json.dumps(reply, ensure_ascii=False, allow_nan=False).encode('utf-8')
        if len(encoded) > 16384:
            raise ValueError('Reply exceeds 16 KiB')
        memory = reply.get('memory')
        game.step(reply.get('action_id'))
    return game

def main():
    parser = argparse.ArgumentParser(description='Trinity local simulator, Python 3.12+, standard library only')
    parser.add_argument('--agent', required=True, type=Path)
    parser.add_argument('--seed', default=0, type=int)
    parser.add_argument('--games', default=1, type=int)
    parser.add_argument('--replay', type=Path)
    args = parser.parse_args()
    if not 1 <= args.games <= 10000:
        parser.error('--games must be between 1 and 10000')
    scores = []
    wins = 0
    for seed in range(args.seed, args.seed + args.games):
        game = play(load_agent(args.agent.resolve()), seed)
        result = game.result()
        scores.append(result['score'])
        wins += result['won']
        if args.games <= 20:
            print(json.dumps({'seed': seed, **result}, ensure_ascii=False))
        if args.replay and seed == args.seed:
            args.replay.write_text(json.dumps(game.replay(), ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'rules_version': RULES_VERSION, 'games': len(scores), 'mean_score': sum(scores) / len(scores), 'wins': wins, 'min': min(scores), 'max': max(scores)}))
if __name__ == '__main__':
    main()
