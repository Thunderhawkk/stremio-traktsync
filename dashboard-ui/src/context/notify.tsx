import React, { createContext, useContext, useState } from "react";

type Note = { kind: "info" | "ok" | "err"; text: string } | null;
type Ctx = { show: (n: Note) => void; note: Note; clear: () => void };

const NotifyCtx = createContext<Ctx | null>(null);

export function NotifyProvider({ children }: { children: React.ReactNode }) {
  const [note, setNote] = useState<Note>(null);
  return (
    <NotifyCtx.Provider value={{ note, show: setNote, clear: () => setNote(null) }}>
      {children}
    </NotifyCtx.Provider>
  );
}
export function useNotify(){ const c = useContext(NotifyCtx); if(!c) throw new Error("NotifyProvider missing"); return c; }
