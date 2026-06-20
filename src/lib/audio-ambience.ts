import type { AmbienceCategory } from "./app-settings";

interface CategoryConfig {
  // Stack of oscillator frequencies (Hz) for a drone chord
  freqs: number[];
  type: OscillatorType;
  filterFreq: number;
  lfoRate: number; // slow modulation
  lfoDepth: number; // dB modulation
}

const CATEGORIES: Record<AmbienceCategory, CategoryConfig> = {
  mistery: { freqs: [55, 82.4, 110], type: "sine", filterFreq: 480, lfoRate: 0.08, lfoDepth: 0.25 },
  philosophy: { freqs: [65.4, 98, 130.8], type: "triangle", filterFreq: 600, lfoRate: 0.05, lfoDepth: 0.18 },
  tech: { freqs: [73.4, 110, 146.8], type: "sawtooth", filterFreq: 320, lfoRate: 0.15, lfoDepth: 0.3 },
  universe: { freqs: [49, 73.4, 98, 196], type: "sine", filterFreq: 700, lfoRate: 0.04, lfoDepth: 0.3 },
  history: { freqs: [58.3, 87.3, 116.5], type: "triangle", filterFreq: 420, lfoRate: 0.06, lfoDepth: 0.2 },
  motivation: { freqs: [82.4, 123.5, 164.8], type: "sine", filterFreq: 800, lfoRate: 0.1, lfoDepth: 0.2 },
  nature: { freqs: [65.4, 82.4, 110], type: "sine", filterFreq: 540, lfoRate: 0.03, lfoDepth: 0.4 },
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let activeNodes: Array<OscillatorNode | GainNode | BiquadFilterNode> = [];
let currentCategory: AmbienceCategory | null = null;

function ensureCtx() {
  if (ctx) return ctx;
  const C =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(ctx.destination);
  return ctx;
}

function disposeNodes() {
  activeNodes.forEach((n) => {
    try {
      if ("stop" in n) (n as OscillatorNode).stop();
      n.disconnect();
    } catch {
      /* ignore */
    }
  });
  activeNodes = [];
}

export function startAmbience(category: AmbienceCategory, volume: number) {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  if (c.state === "suspended") void c.resume();

  if (currentCategory === category && activeNodes.length > 0) {
    setAmbienceVolume(volume);
    return;
  }

  disposeNodes();
  currentCategory = category;

  const cfg = CATEGORIES[category];
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cfg.filterFreq;
  filter.Q.value = 0.7;
  filter.connect(masterGain);
  activeNodes.push(filter);

  cfg.freqs.forEach((f, i) => {
    const osc = c.createOscillator();
    osc.type = cfg.type;
    osc.frequency.value = f;
    const g = c.createGain();
    g.gain.value = 0.18 / cfg.freqs.length;
    osc.connect(g);
    g.connect(filter);

    // slow LFO to modulate gain (breath)
    const lfo = c.createOscillator();
    lfo.frequency.value = cfg.lfoRate + i * 0.01;
    const lfoGain = c.createGain();
    lfoGain.gain.value = cfg.lfoDepth * 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);

    osc.start();
    lfo.start();
    activeNodes.push(osc, lfo, g, lfoGain);
  });

  setAmbienceVolume(volume);
}

export function setAmbienceVolume(v: number) {
  if (!ctx || !masterGain) return;
  const target = Math.max(0, Math.min(1, v));
  masterGain.gain.cancelScheduledValues(ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.6);
}

export function stopAmbience() {
  if (!ctx || !masterGain) return;
  masterGain.gain.cancelScheduledValues(ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
  setTimeout(() => {
    disposeNodes();
    currentCategory = null;
  }, 700);
}
