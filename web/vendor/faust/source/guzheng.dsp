// Original plucked-string waveguide composed with Faust standard-library delays.
// Position-dependent excitation and bridge losses. GPL-3.0-only.
import("stdfaust.lib");
declare name "guzheng";
declare license "GPL-3.0-only";
freq=hslider("freq",440,30,8000,.001);
gate=button("gate");
color=hslider("color",0,0,1,1);
period=ma.SR/freq;
strike=(no.noise : fi.lowpass(1,5500+color*3000))*en.ar(.0005,.003,gate);
pluck=strike-(strike : de.fdelay(8192,period*(.22-color*.08)));
loss=pow(.001,1/((3.3+color*.4)*freq));
string=(+ : fi.tf1(.5,.5,0) : de.fdelay4(8192,max(3,period-1.5)) : *(loss)) ~ _;
process=pluck : string : fi.dcblocker;
