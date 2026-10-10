// Adapted from Faust-STK clarinet.dsp by Romain Michon, STK-4.3 / MIT-style.
// Upstream: grame-cncm/faust@8c00913e44d42f9d25aa3f1a0d500bde5662d7bc.
// Changes: compact mono controls, host envelopes, no nonlinear ladder/stereo/reverb.
import("stdfaust.lib");
in=library("instruments.lib");
declare name "clarinet";
declare author "Romain Michon; Jianpu Workbench contributors";
declare license "STK-4.3";
freq=hslider("freq",440,30,8000,.001);
gate=button("gate");
color=hslider("color",0,0,1,1);
// Lower pressure keeps the reed out of the nearly square, overblown regime.
// Slow coloured turbulence changes the reed aperture as well as amplitude.
air=no.noise:fi.lowpass(1,9);
reedTable=in.reed(.7,-.44+.26*(.48+color*.12)+air*.045);
pressure=en.asr(.045,1,.05,gate)*(.70+color*.025)*.9
 *(1+.008*sin(2*ma.PI*.73*ba.time/ma.SR)+air*.16);
breath=pressure*(1+no.noise*.012);
filter=fi.tf1(.5,.5,0);
delay=de.fdelay(8192,max(1,ma.SR/freq*.5-1.5));
tube=(_, (breath<:_,_) : (filter*(-.95)-_ <: *(reedTable))+_) ~ delay;
// Radiated tone is darker than pressure inside the bore; keep breath separate.
process=(tube:fi.dcblocker:fi.lowpass(2,2600+color*900))
 + (no.noise:fi.resonbp(1500,.65,.006))*pressure;
