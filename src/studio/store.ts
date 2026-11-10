import { create } from "zustand";
import { example } from "./examples.ts";
import { copy, newBand, uid, type Band, type Design, type End, type Link, type Part, type Track } from "./model.ts";
import { readLibrary, saveBand, saveInstrument, writeLibrary } from "./storage.ts";

type StudioState = {
  design: Design; selected: string | null; band: Band; instruments: Design[]; bands: Band[]; message: string;
  setMessage: (s: string) => void;
  setDesign: (d: Design) => void; patchDesign: (p: Partial<Design>) => void;
  select: (id: string | null) => void; addPart: (p: Part) => void; patchPart: (id: string, p: Partial<Part>) => void; removePart: (id: string) => void;
  link: (a: End, b: End) => void; removeLink: (index: number) => void;
  saveDesign: () => void; deleteDesign: (id: string) => void;
  setBand: (b: Band) => void; patchBand: (p: Partial<Band>) => void; addTrack: (d: Design) => void; patchTrack: (id: string, p: Partial<Track>) => void; removeTrack: (id: string) => void; saveBand: () => void; deleteBand: (id: string) => void;
};
const initial = readLibrary();
const defaultBand = (): Band => ({ ...newBand(), name: "Creature ensemble", tracks: [
  { id: uid(), name: "Whale / bass", design: example("example-whale"), level: .65, mute: false, steps: [36,null,null,null,36,null,null,null,41,null,null,null,39,null,null,null] },
  { id: uid(), name: "Songbird / lead", design: example("example-bird"), level: .45, mute: false, steps: [null,null,84,null,88,null,91,null,86,null,84,null,81,null,84,null] },
] });
export const useStudio = create<StudioState>((set, get) => ({
  design: example("example-whale"), selected: null, band: defaultBand(), instruments: initial.instruments, bands: initial.bands, message: "",
  setMessage: (message) => set({ message }),
  setDesign: (d) => set({ design: copy(d), selected: null, message: "" }),
  patchDesign: (p) => set(s => ({ design: { ...s.design, ...p } })),
  select: (selected) => set({ selected }),
  addPart: (p) => set(s => s.design.parts.length < 32 ? ({ selected: p.id, design: { ...s.design, parts: [...s.design.parts, p] }, message: "" }) : ({ message: "An instrument can have up to 32 parts." })),
  patchPart: (id, p) => set(s => ({ design: { ...s.design, parts: s.design.parts.map(x => x.id === id ? { ...x, ...p } as Part : x) } })),
  removePart: (id) => set(s => ({ selected: null, design: { ...s.design, parts: s.design.parts.filter(x => x.id !== id), links: s.design.links.filter(l => l.a.id !== id && l.b.id !== id) } })),
  link: (a, b) => set(s => {
    const x = s.design.parts.find(p => p.id === a.id), y = s.design.parts.find(p => p.id === b.id);
    if (!x || !y || a.id === b.id) return { message: "Choose anchors on two different parts." };
    const special = (p: Part) => p.kind === "source" || p.kind === "outlet";
    if (special(x) && special(y)) return { message: "Connect sources and outlets to a duct or chamber." };
    if ((special(x) && s.design.links.some(l => l.a.id === x.id || l.b.id === x.id)) || (special(y) && s.design.links.some(l => l.a.id === y.id || l.b.id === y.id))) return { message: "Each source and outlet has one connection. Remove its old connection first." };
    const same = (e: End, f: End) => e.id === f.id && e.end === f.end;
    if (s.design.links.some(l => same(l.a,a) && same(l.b,b) || same(l.a,b) && same(l.b,a))) return { message: "Those anchors are already connected." };
    if (s.design.links.length >= 64) return { message: "An instrument can have up to 64 connections." };
    const link: Link = { a, b };
    return { design: { ...s.design, links: [...s.design.links, link] }, message: "Connection added." };
  }),
  removeLink: (index) => set(s => ({ design: { ...s.design, links: s.design.links.filter((_,i) => i !== index) } })),
  saveDesign: () => { try { const d = saveInstrument(get().design); set({ design: d, instruments: readLibrary().instruments, message: "Instrument saved in this browser." }); } catch { set({ message: "Could not save. Browser storage may be full or unavailable." }); } },
  deleteDesign: (id) => { try { const lib = readLibrary(); lib.instruments = lib.instruments.filter(x => x.id !== id); writeLibrary(lib); set({ instruments: lib.instruments, message: "Saved instrument removed." }); } catch { set({ message: "Could not update browser storage." }); } },
  setBand: (band) => set({ band: copy(band), message: "" }),
  patchBand: (p) => set(s => ({ band: { ...s.band, ...p } })),
  addTrack: (d) => set(s => s.band.tracks.length >= 4 ? ({ message: "A band supports up to four independent voices." }) : ({ band: { ...s.band, tracks: [...s.band.tracks, { id: uid(), name: d.name, design: copy(d), level: .65, mute: false, steps: Array(16).fill(null) }] }, message: `${d.name} added to the band.` })),
  patchTrack: (id, p) => set(s => ({ band: { ...s.band, tracks: s.band.tracks.map(t => t.id === id ? { ...t, ...p } : t) } })),
  removeTrack: (id) => set(s => ({ band: { ...s.band, tracks: s.band.tracks.filter(t => t.id !== id) } })),
  saveBand: () => { try { const band = saveBand(get().band); set({ band, bands: readLibrary().bands, message: "Band saved in this browser, including its instrument designs." }); } catch { set({ message: "Could not save. Browser storage may be full or unavailable." }); } },
  deleteBand: (id) => { try { const lib = readLibrary(); lib.bands = lib.bands.filter(x => x.id !== id); writeLibrary(lib); set({ bands: lib.bands, message: "Saved band removed." }); } catch { set({ message: "Could not update browser storage." }); } },
}));
