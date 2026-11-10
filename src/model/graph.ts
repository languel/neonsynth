import type { Connection, Part } from './types';

/** Connections flow in one direction; feedback is deliberately disallowed in the editor. */
export function connectionError(parts: Part[], connections: Connection[], from: string, to: string): string | null {
  if (from === to) return 'A part cannot connect to itself.';
  const a = parts.find((part) => part.id === from);
  const b = parts.find((part) => part.id === to);
  if (!a || !b) return 'Choose two existing parts.';
  if (a.kind === 'body' || b.kind === 'body') return 'Body outlines are visual only; connect sound parts instead.';
  if (a.kind === 'outlet') return 'An outlet is the end of a sound path.';
  if (connections.some((edge) => edge.from === from && edge.to === to)) return 'These parts are already connected.';
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (id === from) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return connections.some((edge) => edge.from === id && visit(edge.to));
  };
  return visit(to) ? 'That connection would create a feedback loop.' : null;
}

export function isPlayable(parts: Part[], connections: Connection[]): boolean {
  const starters = parts.filter((part) => part.kind === 'source');
  const outlets = new Set(parts.filter((part) => part.kind === 'outlet').map((part) => part.id));
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (outlets.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return connections.some((edge) => edge.from === id && visit(edge.to));
  };
  return starters.some((part) => visit(part.id));
}
