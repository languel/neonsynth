import { useEffect, useRef, useState } from 'react';
import { Headphones, Volume2 } from 'lucide-react';
import { audio } from '../audio/AudioEngine';
import { isPlayable } from '../model/graph';
import type { Instrument } from '../model/types';

const keys = [
  { midi: 60, label: 'A', note: 'C', black: false }, { midi: 61, label: 'W', note: 'C♯', black: true },
  { midi: 62, label: 'S', note: 'D', black: false }, { midi: 63, label: 'E', note: 'D♯', black: true },
  { midi: 64, label: 'D', note: 'E', black: false }, { midi: 65, label: 'F', note: 'F', black: false },
  { midi: 66, label: 'T', note: 'F♯', black: true }, { midi: 67, label: 'G', note: 'G', black: false },
  { midi: 68, label: 'Y', note: 'G♯', black: true }, { midi: 69, label: 'H', note: 'A', black: false },
  { midi: 70, label: 'U', note: 'A♯', black: true }, { midi: 71, label: 'J', note: 'B', black: false },
  { midi: 72, label: 'K', note: 'C', black: false },
];
const whiteKeys = keys.filter((key) => !key.black);
const blackPositions: Record<number, number> = { 61: 1, 63: 2, 66: 4, 68: 5, 70: 6 };

export function Waveform({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const ctx = canvas.current?.getContext('2d');
      if (ctx && canvas.current) {
        const width = canvas.current.width, height = canvas.current.height;
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#28413d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, height/2); ctx.lineTo(width, height/2); ctx.stroke();
        const data = new Uint8Array(audio.analyser?.fftSize ?? 1024);
        if (active && audio.analyser) audio.analyser.getByteTimeDomainData(data);
        ctx.beginPath(); ctx.strokeStyle = active ? '#b9f4c6' : '#608f7c'; ctx.lineWidth = 1.5;
        for (let i = 0; i < width; i++) {
          const y = active && audio.analyser ? (data[Math.floor(i/width*data.length)] / 255) * height : height/2 + Math.sin(i*.17)*Math.exp(-(((i-width/2)/(width*.22))**2))*3;
          if (!i) ctx.moveTo(i, y); else ctx.lineTo(i, y);
        }
        ctx.stroke();
      }
      frame = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(frame);
  }, [active]);
  return <canvas ref={canvas} width="240" height="52" className="waveform" aria-label={active ? 'Live output waveform' : 'Output waveform standby'}/>;
}

export function Keyboard({ instrument, onAudio, onError }: { instrument: Instrument; onAudio: () => void; onError: (message: string) => void }) {
  const [pressed, setPressed] = useState<number[]>([]);
  const held = useRef(new Map<number, { id?: string }>());
  const instrumentRef = useRef(instrument); instrumentRef.current = instrument;
  const startRef = useRef<(midi: number) => void>(() => {});
  const stopRef = useRef<(midi: number) => void>(() => {});
  const start = async (midi: number) => {
    if (held.current.has(midi)) return;
    const current = instrumentRef.current;
    if (!isPlayable(current.parts, current.connections)) { onError('Connect a source to an outlet before playing.'); return; }
    const token: { id?: string } = {};
    held.current.set(midi, token); setPressed((value) => [...value, midi]);
    try {
      await audio.start(); onAudio();
      const id = audio.note(current, midi);
      if (held.current.get(midi) !== token) audio.release(id); else token.id = id;
    } catch { if (held.current.get(midi) === token) { held.current.delete(midi); setPressed((value) => value.filter((n) => n !== midi)); } onError('Audio could not start. Please try again in a supported browser.'); }
  };
  const stop = (midi: number) => {
    const token = held.current.get(midi); held.current.delete(midi);
    if (token?.id) audio.release(token.id);
    setPressed((value) => value.filter((n) => n !== midi));
  };
  startRef.current = (midi) => { void start(midi); }; stopRef.current = stop;
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
      const key = keys.find((item) => item.label.toLowerCase() === event.key.toLowerCase());
      if (key) { event.preventDefault(); startRef.current(key.midi); }
    };
    const up = (event: KeyboardEvent) => {
      const key = keys.find((item) => item.label.toLowerCase() === event.key.toLowerCase());
      if (key) stopRef.current(key.midi);
    };
    const blur = () => { for (const midi of held.current.keys()) stopRef.current(midi); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); blur(); };
  }, []);
  const buttonEvents = (midi: number) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.currentTarget.setPointerCapture(event.pointerId); void start(midi); },
    onPointerUp: () => stop(midi), onPointerCancel: () => stop(midi),
  });
  return <section className="keyboard-card">
    <div className="keyboard-copy"><span className="keyboard-icon"><Headphones size={18}/></span><div><span className="eyebrow">TAKE IT FOR A SPIN</span><h3>Play your creation</h3><p>Use your keyboard or tap the keys.</p></div></div>
    <div className="piano" aria-label="Playable piano keyboard">
      <div className="white-keys">{whiteKeys.map((key) => <button key={key.midi} className={`piano-white ${pressed.includes(key.midi) ? 'pressed' : ''}`} {...buttonEvents(key.midi)} aria-label={`Play ${key.note}${key.midi === 72 ? '5' : '4'}`}><span>{key.label}</span></button>)}</div>
      {keys.filter((key) => key.black).map((key) => <button key={key.midi} className={`piano-black ${pressed.includes(key.midi) ? 'pressed' : ''}`} style={{ left: `calc(${blackPositions[key.midi] * 12.5}% - 12px)` }} {...buttonEvents(key.midi)} aria-label={`Play ${key.note}4`}><span>{key.label}</span></button>)}
    </div>
    <div className="output-indicator"><Volume2 size={16}/><div><strong>LIVE OUTPUT</strong><span>Headphones recommended</span></div></div>
  </section>;
}
