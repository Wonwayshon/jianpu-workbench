// Original compact modal piano: filtered hammer excitation, detuned string pairs,
// inharmonic partials and short soundboard modes. GPL-3.0-only.
import("stdfaust.lib");
declare name "piano";
declare license "GPL-3.0-only";
freq=hslider("freq",440,30,8000,.001);
gate=button("gate");
color=hslider("color",0,0,1,1);
strike=(no.noise : fi.lowpass(2,1500+color*3300))*en.ar(.0005,.006,gate);
mode(n,s)=fi.resonbp(min(ma.SR*.45,fn),max(1,ma.PI*fn*t60/log(1000)),weight)*(fn<ma.SR*.45)
with {
 k=n+1;
 stiffness=.00016+color*.00007;
 fn=freq*(1+(s*2-1)*.00035)*k*sqrt((1+stiffness*k*k)/(1+stiffness));
 t60=(4.8-color*.7)/pow(max(.5,freq/220),.45)/(1+n*.25);
 weight=abs(sin(ma.PI*k*.13))/pow(k,1.1)/2;
};
strings = _ <: par(s,2,par(n,22,mode(n,s))) :> _;
body = _ <: fi.resonbp(230,20,.025),fi.resonbp(560,26,.018),fi.resonbp(1200,30,.012) :> _;
process = strike <: strings,body :> _ : fi.dcblocker;
