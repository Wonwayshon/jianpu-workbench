// Modal struck-string bank composed with Faust standard-library resonators.
// Original model and presets: Jianpu Workbench, GPL-3.0-only.
import("stdfaust.lib");
declare name "hammer";
declare license "GPL-3.0-only";
freq = hslider("freq",440,30,8000,.001);
gate = button("gate");
color = hslider("color",0,0,1,1);
strike = no.noise * en.ar(.0004,.004,gate);
mode(n) = fi.resonbp(min(ma.SR*.45,fn),max(1,ma.PI*fn*t60/log(1000)),weight) * (fn<ma.SR*.45)
with {
 k=n+1;
 fn=freq*k*sqrt((1+.00008*k*k)/(1+.00008));
 t60=(2.8-color*.9)/(1+n*.32);
 weight=abs(sin(ma.PI*k*(.2+color*.08)))/pow(k,1.15);
};
process = strike <: par(n,18,mode(n)) :> _ : fi.dcblocker;
