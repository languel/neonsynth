import { useEffect, useState, type InputHTMLAttributes } from "react";
import { clamp } from "./model.ts";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "min" | "max" | "onChange"> & {
  value: number; min: number; max: number; onChange: (value: number) => void;
};
/** Keep partially typed numbers intact; commit only valid values, and clamp on blur. */
export function NumberInput({ value, min, max, onChange, onBlur, ...props }: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <input {...props} type="number" min={min} max={max} value={draft} onChange={e=>{
    setDraft(e.target.value);
    const n=e.target.valueAsNumber;
    if (Number.isFinite(n) && n>=min && n<=max) onChange(n);
  }} onBlur={e=>{
    const n=e.target.valueAsNumber;
    if (Number.isFinite(n)) { const next=clamp(n,min,max); setDraft(String(next)); if(next!==value)onChange(next); }
    else setDraft(String(value));
    onBlur?.(e);
  }}/>;
}
