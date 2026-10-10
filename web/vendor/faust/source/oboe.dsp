// Original double-reed source/filter candidate. GPL-3.0-only.
// Band-limited reed waveform and tube/body formants; not a recorded oboe.
import("stdfaust.lib");
declare name "oboe";
declare license "GPL-3.0-only";
freq=hslider("freq",440,30,8000,.001);
gate=button("gate");
color=hslider("color",0,0,1,1);
reed=os.sawtooth(freq)*(.56+color*.08)+os.triangle(freq)*(.44-color*.08);
wind=no.noise*.004;
body = _ <: *(.8),fi.resonbp(1200+color*200,.8,.32),fi.resonbp(2600,1,.14) :> _;
process=(reed+wind)*en.asr(.02,1,.03,gate) : body : fi.lowpass(2,5200) : fi.dcblocker;
