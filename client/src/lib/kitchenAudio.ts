// CineBites Kitchen Audio Engine
// Provides high-penetration cinema kitchen chimes with browser autoplay unlock

let sharedCtx: AudioContext | null = null;

export function getKitchenAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioContextClass();
  }
  return sharedCtx;
}

export function isAudioReady(): boolean {
  if (!sharedCtx) return false;
  return sharedCtx.state === "running";
}

export async function unlockKitchenAudio(): Promise<boolean> {
  try {
    const ctx = getKitchenAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx.state === "running";
  } catch (err) {
    console.warn("Audio unlock warning:", err);
    return false;
  }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine"
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

export function playKitchenChime(volume = 0.85): void {
  try {
    const ctx = getKitchenAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    playTone(ctx, 783.99, now + 0.00, 0.45, volume * 0.9, "sine");
    playTone(ctx, 1046.50, now + 0.16, 0.55, volume * 1.0, "triangle");
    playTone(ctx, 1318.51, now + 0.32, 0.70, volume * 0.85, "sine");
    const t2 = now + 0.75;
    playTone(ctx, 880.00, t2 + 0.00, 0.45, volume * 0.9, "sine");
    playTone(ctx, 1174.66, t2 + 0.18, 0.65, volume * 1.0, "triangle");
  } catch (err) {
    console.error("Kitchen audio error:", err);
  }
}

export async function testKitchenAudio(): Promise<boolean> {
  await unlockKitchenAudio();
  playKitchenChime(0.9);
  return isAudioReady();
}
