import { copy, isDesign, normalizeBand, uid, type Band, type Design } from "./model.ts";
const KEY = "neonsynth-physical-studio-v1";
type Library = { instruments: Design[]; bands: Band[] };
export function readLibrary(): Library {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { instruments: Array.isArray(v.instruments) ? v.instruments.filter(isDesign).slice(0, 100) : [], bands: Array.isArray(v.bands) ? v.bands.map(normalizeBand).filter((b: Band | null): b is Band => b !== null).slice(0, 50) : [] };
  } catch { return { instruments: [], bands: [] }; }
}
export function writeLibrary(v: Library): void { localStorage.setItem(KEY, JSON.stringify(v)); }
export function saveInstrument(d: Design): Design {
  const lib = readLibrary();
  const item = copy(d);
  if (item.id.startsWith("example-")) item.id = uid();
  lib.instruments = [item, ...lib.instruments.filter(x => x.id !== item.id)].slice(0, 100);
  writeLibrary(lib);
  return item;
}
export function saveBand(b: Band): Band {
  const lib = readLibrary();
  const item = copy(b);
  lib.bands = [item, ...lib.bands.filter(x => x.id !== item.id)].slice(0, 50);
  writeLibrary(lib);
  return item;
}
export function download(value: Design | Band, type: "instrument" | "band"): void {
  const blob = new Blob([JSON.stringify({ format: `neonsynth-${type}`, version: 1, [type]: value }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${value.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || type}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importFile(file: File): Promise<{ type: "instrument"; value: Design } | { type: "band"; value: Band }> {
  if (file.size > 1_000_000) throw new Error("File is too large.");
  const v = JSON.parse(await file.text());
  if (v?.format === "neonsynth-instrument" && isDesign(v.instrument)) return { type: "instrument", value: { ...v.instrument, id: uid() } };
  if (v?.format === "neonsynth-band") { const band = normalizeBand(v.band); if (band) return { type: "band", value: { ...band, id: uid() } }; }
  throw new Error("This is not a valid Neonsynth instrument or band file.");
}
