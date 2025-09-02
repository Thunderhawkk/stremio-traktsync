import React from "react";

export function Modal({
  open, onClose, title, children
}: { open: boolean; onClose: () => void; title?: string; children?: React.ReactNode; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-lg bg-surface-1 border border-white/10 shadow-elevate w-[520px] max-w-[92vw] p-4 animate-elevate">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">{title || "Dialog"}</h3>
          <button className="text-sm px-2 py-1 rounded-md bg-surface-2 border border-white/10" onClick={onClose}>Close</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
