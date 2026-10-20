import json,math,re
from statistics import mean,stdev
d=json.load(open('roboarena_sessions_full.json',encoding='utf-8'))
def pairs(base,cand):
    out=[]
    for s in d:
        ps={p['name']:p for p in s['policies'].values()}
        if base in ps and cand in ps:
            out.append(dict(id=s['id'],t=s['t'],site=s['site'],instr=s['instr'],notes=s['notes'],d=ps[cand]['progress']-ps[base]['progress']))
    return out
def cs_seq(xs,alpha=0.05):
    grid=[i/1000 for i in range(1,1000)]
    Kp={m:1.0 for m in grid}; Km={m:1.0 for m in grid}
    lo,hi=0.0,1.0; var=0.25; n=0; ssum=0.0; sq=0.0; hist=[]
    for t,x in enumerate(xs,1):
        lam=min(math.sqrt(2*math.log(2/alpha)/(var*t*math.log(t+1))),0.5)
        for m in grid:
            Kp[m]*=1+min(lam,0.5/m)*(x-m); Km[m]*=1-min(lam,0.5/(1-m))*(x-m)
        alive=[m for m in grid if 0.5*Kp[m]+0.5*Km[m]<1/alpha]
        if alive: lo=max(lo,min(alive)); hi=min(hi,max(alive))
        hist.append((round(2*lo-1,3),round(2*hi-1,3)))
        n+=1; ssum+=x; sq+=(x-ssum/n)**2; var=(0.25+sq)/(n+1)
    return hist
G={}
for base,cand in [('pi0_droid','pi0_fast_droid'),('paligemma_fast_droid','paligemma_binning_droid'),('pi0_fast_droid','paligemma_fast_specialist_droid')]:
    ps=pairs(base,cand); h=cs_seq([(p['d']+1)/2 for p in ps])
    dec=('HOLD',len(ps))
    for i,(L,U) in enumerate(h,1):
        if L>0: dec=('PROMOTE',i);break
        if U<-0.02: dec=('ROLLBACK',i);break
    G[f'{base}->{cand}']=dict(n=len(ps),mean=round(mean(p['d'] for p in ps),4),decision=dec[0],at=dec[1],cs_at_decision=h[dec[1]-1],cs_final=h[-1],cs_at_10=h[9],cs_at_50=h[49])
    print(base,cand,G[f'{base}->{cand}'])
json.dump(G,open(r'%s/golden.json'%__import__('os').environ['SD'],'w'),indent=1)
# slice tests on specialist
ps=pairs('pi0_fast_droid','paligemma_fast_specialist_droid'); half=len(ps)//2
slices={'deformable':r'fold|towel|cloth|napkin|shirt|rag|fabric','drawer':r'drawer|open|close','stack':r'stack|on top','pour':r'pour','marker_pen':r'marker|pen','cup_mug':r'cup|mug|bowl','wipe':r'wipe|clean'}
for nm,rx in slices.items():
    r=re.compile(rx,re.I)
    for lab,seg in [('disc',ps[:half]),('conf',ps[half:])]:
        x=[p['d'] for p in seg if r.search(p['instr'])]
        if len(x)>2:
            m=mean(x); se=stdev(x)/len(x)**.5; z=m/se if se else 0
            p1=0.5*math.erfc(-z/2**.5)
            print(f'{nm:10s} {lab} n={len(x):3d} mean={m:+.3f} z={z:+.2f} p_one_sided={p1:.4f}')
print('split at',half,'boundary time',ps[half]['t'])
