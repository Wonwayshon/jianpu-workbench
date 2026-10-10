// Adapted from Faust-STK by Romain Michon, STK-4.3 (MIT-style).
// Upstream: grame-cncm/faust/examples/physicalModeling/faust-stk/
// Changes: mono output, fixed simple controls, host-managed articulation/reverb.
import("stdfaust.lib");
in = library("instruments.lib");
freq = hslider("freq",440,30,8000,.001);
gate = button("gate");
color = hslider("color",0,0,1,1);
declare name "flute";
declare author "Romain Michon; Jianpu Workbench contributors";
declare license "STK-4.3";
// Smith jet/bore feedback model; no packaged recordings.
pressure = .95 + color*.04;
breathAmp = .004 + color*.012;
flow = pressure*en.asr(.02,1,.025,gate)*(1+no.noise*breathAmp);
embouchureDelay = de.fdelay(8192,max(1,ma.SR/freq/2-2));
boreDelay = de.fdelay(8192,max(1,ma.SR/freq-3.1));
poly = _ <: _-_*_*_;
process = (_ <: (flow+*(.4):embouchureDelay:poly)+*(.4):fi.lowpass(1,2000)) ~ boreDelay : fi.dcblocker;
