// Original reed-spectrum / tube-radiation candidate. GPL-3.0-only.
// Pressure-dependent partials approximate a double reed's nasal spectrum;
// this compact source/filter model is not a full measured oboe waveguide.
import("stdfaust.lib");
declare name "oboe";
declare license "GPL-3.0-only";
freq=hslider("freq",440,30,8000,.001);
gate=button("gate");
color=hslider("color",0,0,1,1);
air=no.noise:fi.lowpass(1,11);
pressure=en.asr(.018,1,.04,gate)*(1+air*.18
 + .012*sin(2*ma.PI*.61*ba.time/ma.SR));
bloom=en.asr(.07,1,.035,gate);
// A strong broad first formant and both even/odd partials give reed buzz,
// rather than the smooth 1/n saw spectrum of an electronic wind patch.
formant(f)=.22+1.65*exp(0-pow((f-(1100+color*130))/650,2))
 +(.65+color*.22)*exp(0-pow((f-2450)/1150,2));
partial(n)=os.oscrs(freq*n)*formant(freq*n)/pow(n,.72)
 *exp(-freq*n/(4700+color*1600))*max(0,1-freq*n/(ma.SR*.45))
 *(.52+.48*bloom+air*.6*(n>2))
 *(1+.025*sin(2*ma.PI*(.6+n*.13)*ba.time/ma.SR));
reed=sum(i,14,partial(i+1));
wind=(no.noise:fi.resonbp(1900,.65,.025));
process=(reed+wind)*pressure*.4:fi.dcblocker;
