import json, math, re, collections
d=json.load(open('roboarena_sessions_compact.json',encoding='utf-8'))
d.sort(key=lambda s:s['t'])
names=collections.Counter(p['policy_name'] for s in d for p in s['policies'].values())
print(len(names),'policies'); print(names.most_common(25))
def pairs(new,old):
    out=[]
    for s in d:
        ps={p['policy_name']:p for p in s['policies'].values()}
        if new in ps and old in ps:
            out.append((s, ps[new]['partial_success']-ps[old]['partial_success']))
    return out
def betting_cs(xs, alpha=0.05, grid=None):
    # Waudby-Smith & Ramdas hedged capital CS for mean of x in [0,1]
    grid = grid or [i/1000 for i in range(1,1000)]
    lo,hi=0.0,1.0; hist=[]
    # per-m capital
    Kp={m:1.0 for m in grid}; Km={m:1.0 for m in grid}
    mu_hat=0.5; var=0.25; n=0; ssum=0; sq=0
    for t,x in enumerate(xs,1):
        lam=min(math.sqrt(2*math.log(2/alpha)/(var*t*math.log(t+1))), 0.5)
        for m in grid:
            Kp[m]*= 1+min(lam,0.5/m)*(x-m)
            Km[m]*= 1-min(lam,0.5/(1-m))*(x-m)
        alive=[m for m in grid if 0.5*Kp[m]+0.5*Km[m] < 1/alpha]
        if alive: lo=max(lo,min(alive)); hi=min(hi,max(alive))
        hist.append((lo,hi))
        n+=1; ssum+=x; sq+=(x-ssum/n)**2
        mu_hat=(0.5+ssum)/(n+1); var=(0.25+sq)/(n+1)
    return hist
def decide(new,old,delta=0.0):
    ps=pairs(new,old); xs=[(dd+1)/2 for _,dd in ps]
    if not xs: print(new,old,'no pairs'); return
    h=betting_cs(xs)
    dec=None
    for i,(lo,hi) in enumerate(h,1):
        Lo,Hi=2*lo-1,2*hi-1
        if Lo>delta: dec=('PROMOTE',i,Lo,Hi);break
        if Hi<-delta: dec=('ROLLBACK',i,Lo,Hi);break
    Lo,Hi=2*h[-1][0]-1,2*h[-1][1]-1
    print(f'{new} vs {old}: n={len(xs)} meanΔ={sum(dd for _,dd in ps)/len(ps):+.3f} final CS[{Lo:+.3f},{Hi:+.3f}] decision={dec or "HOLD"}')
    return ps
import sys
for a,b in [('pi0_fast_droid','pi0_droid'),('paligemma_binning_droid','paligemma_fast_droid'),('fast_specialist','pi0_fast_droid')]:
    decide(a,b)
