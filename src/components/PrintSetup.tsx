"use client";
import { useSyncExternalStore } from "react";
import { Printer } from "lucide-react";
import { PRINTERS, MATERIALS, DEFAULT_SETUP, type PrintSetup as Setup } from "@/lib/printers";

const KEY = "3dblend.printSetup";

// Tiny external store over localStorage so the selection survives reloads
// without a setState-in-effect (and without SSR hydration mismatches).
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const serverSnapshot = () => null;
const DEFAULT_JSON = JSON.stringify(DEFAULT_SETUP);

export function usePrintSetup(): [Setup, (s: Setup) => void] {
  const raw = useSyncExternalStore(subscribe, read, serverSnapshot);
  let setup = DEFAULT_SETUP;
  try {
    const parsed = JSON.parse(raw ?? DEFAULT_JSON) as Setup;
    if (PRINTERS.some((p) => p.id === parsed.printerId)) setup = parsed;
  } catch { /* keep default */ }
  const setSetup = (s: Setup) => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
    listeners.forEach((cb) => cb());
  };
  return [setup, setSetup];
}

export function PrintSetupBar({ setup, onChange, compact }: { setup: Setup; onChange: (s: Setup) => void; compact?: boolean }) {
  const printer = PRINTERS.find((p) => p.id === setup.printerId) ?? PRINTERS[0];
  const sel = "rounded-lg border border-line bg-elev px-2 py-1 text-xs text-fg outline-none focus:border-accent";
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "glass rounded-xl px-3 py-2"}`} title="The agent designs for this printer and the checks use its bed, nozzle and material">
      <Printer className="h-4 w-4 text-accent-2" />
      <select aria-label="Printer" className={sel} value={setup.printerId} onChange={(e) => { const p = PRINTERS.find((x) => x.id === e.target.value)!; onChange({ ...setup, printerId: p.id, nozzle: p.nozzles.includes(setup.nozzle) ? setup.nozzle : p.nozzles[0] }); }}>
        {PRINTERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select aria-label="Nozzle" className={sel} value={setup.nozzle} onChange={(e) => onChange({ ...setup, nozzle: Number(e.target.value) })}>
        {printer.nozzles.map((n) => <option key={n} value={n}>{n} mm nozzle</option>)}
      </select>
      <select aria-label="Material" className={sel} value={setup.material} onChange={(e) => onChange({ ...setup, material: e.target.value as Setup["material"] })}>
        {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}
