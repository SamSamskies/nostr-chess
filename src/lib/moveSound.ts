let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (sharedCtx) return sharedCtx;
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    sharedCtx = new Ctor();
    return sharedCtx;
}

/** Brown-ish noise buffer for a dull wooden “tap” body. */
function makeThumpNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        brown += white * 0.035;
        brown *= 0.96;
        data[i] = brown;
    }
    return buffer;
}

/** Short physical “piece set down” thump; safe to call on every new half-move. */
export function playMoveSound(): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    const run = () => {
        const t0 = ctx.currentTime;
        const dur = 0.14;

        // --- Layer 1: low sine “thud” (board / piece mass) ---
        const bodyOsc = ctx.createOscillator();
        bodyOsc.type = 'sine';
        bodyOsc.frequency.setValueAtTime(118, t0);
        bodyOsc.frequency.exponentialRampToValueAtTime(72, t0 + 0.055);
        const bodyGain = ctx.createGain();
        bodyGain.gain.setValueAtTime(0.0001, t0);
        bodyGain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.004);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
        bodyOsc.connect(bodyGain);

        // --- Layer 2: filtered brown noise (wood-on-wood scrape / contact) ---
        const noiseBuf = makeThumpNoiseBuffer(ctx, dur);
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(520, t0);
        lowpass.frequency.exponentialRampToValueAtTime(180, t0 + 0.1);
        lowpass.Q.setValueAtTime(0.85, t0);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, t0);
        noiseGain.gain.exponentialRampToValueAtTime(0.42, t0 + 0.002);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);

        noiseSrc.connect(lowpass);
        lowpass.connect(noiseGain);

        // --- Layer 3: brief high-mid noise for the initial “click” of contact ---
        const clickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
        const clickData = clickBuf.getChannelData(0);
        for (let i = 0; i < clickData.length; i++) {
            clickData[i] = (Math.random() * 2 - 1) * (1 - i / clickData.length);
        }
        const clickSrc = ctx.createBufferSource();
        clickSrc.buffer = clickBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2400, t0);
        bp.Q.setValueAtTime(2.4, t0);
        const clickGain = ctx.createGain();
        clickGain.gain.setValueAtTime(0.0001, t0);
        clickGain.gain.exponentialRampToValueAtTime(0.065, t0 + 0.0015);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.022);
        clickSrc.connect(bp);
        bp.connect(clickGain);

        const mix = ctx.createGain();
        mix.gain.value = 0.85;
        bodyGain.connect(mix);
        noiseGain.connect(mix);
        clickGain.connect(mix);
        mix.connect(ctx.destination);

        bodyOsc.start(t0);
        bodyOsc.stop(t0 + 0.08);
        noiseSrc.start(t0);
        noiseSrc.stop(t0 + dur);
        clickSrc.start(t0);
        clickSrc.stop(t0 + 0.03);
    };

    if (ctx.state === 'suspended') {
        void ctx.resume().then(run).catch(() => {});
    } else {
        run();
    }
}
