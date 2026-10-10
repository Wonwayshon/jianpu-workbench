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
reedTable=in.reed(.7,-.44+.26*(.4+color*.35));
pressure=en.asr(.02,1,.03,gate)*(.8+color*.08)*.9;
breath=pressure*(1+no.noise*.002);
filter=fi.tf1(.5,.5,0);
delay=de.fdelay(8192,max(1,ma.SR/freq*.5-1.5));
process=(_, (breath<:_,_) : (filter*(-.95)-_ <: *(reedTable))+_) ~ delay : fi.dcblocker;
