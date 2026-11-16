import json, os, collections
D = os.path.dirname(os.path.abspath(__file__)); agg = collections.defaultdict(lambda: collections.Counter()); cur = None
for line in open(os.path.join(D, "log.jsonl")):
    e = json.loads(line)
    if e["kind"] == "start": cur = e["body"] or "base"; continue
    if e["kind"] != "key" or cur is None: continue
    b = json.loads(e["body"]); v = b["v"] or "base"
    if v != cur: continue          # a post from before the variant switched
    a = agg[v]; a["keys"] += 1; a["frames"] += b["n"]; a["over20"] += b["over20"]; a["over35"] += b["over35"]; a["first"] += b["first"]; a["max"] = max(a["max"], b["max"])
print(f"{'variant':12} keys  fps   >20ms/key >35ms/key  key->frame ms  worst ms")
for v, a in agg.items():
    k = a["keys"] or 1
    print(f"{v:12} {a['keys']:4}  {a['frames']/k/0.6:5.1f}  {a['over20']/k:8.2f} {a['over35']/k:8.2f}  {a['first']/k:10.0f}  {a['max']:7}")
