// dashboard-ui/src/sections/ReorderPanel.tsx
import React from "react";

export default function ReorderPanel() {
  return (
    <div className="space-y-3">
      <p className="text-white/70">
        Reorder installed Stremio add‑ons and remove non‑protected ones. Changes affect the whole account.
      </p>
      <iframe
        src="/reorder/"
        title="Stremio Addon Manager"
        className="w-full h-[80vh] rounded-lg border border-white/10"
        // Scripts + same-origin are required for the embedded app to run under this origin.
        // Do not add broader permissions unless needed.
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}
