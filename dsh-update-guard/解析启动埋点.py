# -*- coding: utf-8 -*-
import json, os, sys
from collections import OrderedDict

f = os.path.join(os.environ['APPDATA'], 'DSH Desktop', 'lifecycle-events', 'startup.jsonl')
runs = OrderedDict()
with open(f, encoding='utf-8') as fh:
    for line in fh:
        line = line.strip()
        if not line.startswith('{'):
            continue
        try:
            e = json.loads(line)
        except Exception:
            continue
        rid = e.get('runId') or 'noid'
        runs.setdefault(rid, []).append(e)

STAGES = ['electron-ready','shell-environment','runtime-bootstrap','profile-selection',
          'profile-composition','host-boot','renderer-startup','health-commit']

print(f"共 {len(runs)} 次启动记录")
print()
hdr = f"{'时间':<17}{'总耗时':>8}" + ''.join(f"{s[:12]:>14}" for s in STAGES)
print(hdr)
print('-' * len(hdr))
for rid, evs in runs.items():
    started = {}
    stage = OrderedDict()
    for e in evs:
        st = e.get('stageId')
        if e['eventName'] == 'startup.stage.started' and st:
            started[st] = e['monotonicMs']
        elif e['eventName'] == 'startup.stage.completed' and st and st in started:
            stage[st] = e['monotonicMs'] - started[st]
    ts = evs[0].get('timestamp', '')[:16].replace('T', ' ')
    total = evs[0].get('monotonicMs', 0)
    for e in evs:
        if e['eventName'] == 'startup.run.completed':
            total = e.get('durationMs', total)
    row = f"{ts:<17}{total:>7.0f}s"[0:0]
    row = f"{ts:<17}{total:>6.1f}s"
    for s in STAGES:
        v = stage.get(s)
        row += f"{v:>13.0f}m" if v is not None else f"{'-':>14}"
    print(row)

# 最新一次：renderer-startup 内部还有 details 吗？
last_rid = list(runs)[-1]
print()
print(f"=== 最新一次 ({last_rid[:8]}) 事件明细 ===")
for e in runs[last_rid]:
    d = e.get('details') or {}
    extra = json.dumps({k: v for k, v in d.items() if k}, ensure_ascii=False) if d else ''
    print(f"  {e['eventName']:<28} stage={e.get('stageId','-'):<20} t={e['monotonicMs']:>9.0f}ms  {extra[:120]}")
