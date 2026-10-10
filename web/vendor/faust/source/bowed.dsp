// Adapted from Faust-STK by Romain Michon, STK-4.3 (MIT-style).
// Upstream: grame-cncm/faust/examples/physicalModeling/faust-stk/
// Changes: mono output, fixed simple controls, host-managed articulation/reverb.
import("stdfaust.lib");
in = library("instruments.lib");
freq = hslider("freq",440,30,8000,.001);
gate = button("gate");
color = hslider("color",0,0,1,1);
declare name "bowed";
declare author "Romain Michon; Jianpu Workbench contributors";
declare license "STK-4.3";
// McIntyre/Smith bow-string interaction with two travelling-wave delays.
bowPosition = .35+color*.3;
bowPressure = .65+color*.15;
bowTable = in.bow(0,5-4*bowPressure);
bowVelocity = en.asr(.015,1,.025,gate)*.19;
betaRatio = .027236+.2*bowPosition;
neckDelay = de.fdelay(8192,max(1,(ma.SR/freq-3.0)*(1-betaRatio)));
bridgeDelay = de.fdelay(8192,max(1,(ma.SR/freq-3.0)*betaRatio));
stringFilter = *(0.95) : fi.tf1(1-pole,0,-pole) : *(-1) with { pole=.6-.1*22050/ma.SR; };
instrumentBody(feedBckBridge) = (*(-1)<:+(feedBckBridge), _:(bowVelocity-_<:*(bowTable)<:_, _), _:_, +:+(feedBckBridge), _) ~ neckDelay : !, _;
process = (stringFilter:instrumentBody) ~ bridgeDelay : fi.dcblocker : fi.resonbp(500,.9,1);
