// Web Audio chimes for trade alerts. No assets, safe to call any time.
export type AlertKind = "entry" | "partial" | "win" | "loss";

let audio: AudioContext | null = null;

const NOTES: Record<AlertKind, number[]> = {
  entry: [660, 880],
  partial: [587, 740],
  win: [523, 659, 784],
  loss: [392, 311],
};

export function playChime(kind: AlertKind) {
  try {
    audio ??= new AudioContext();
    const ac = audio;
    if (ac.state === "suspended") void ac.resume();
    NOTES[kind].forEach((freq, i) => {
      const at = ac.currentTime + i * 0.13;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
      osc.connect(gain).connect(ac.destination);
      osc.start(at);
      osc.stop(at + 0.3);
    });
  } catch {
    // Audio unavailable (autoplay policy or no device) — toasts still fire.
  }
}

const MUTE_KEY = "fz-alerts-muted";

export function loadAlertsMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAlertsMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // storage unavailable
  }
}
