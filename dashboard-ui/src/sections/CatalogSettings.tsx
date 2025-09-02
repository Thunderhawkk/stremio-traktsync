// dashboard-ui/src/sections/CatalogSettings.tsx
import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

export default function CatalogSettings(){
  const [saving, setSaving] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [name, setName] = useState("Trakt Lists");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try{
        const r = await fetch(`/api/config?ts=${Date.now()}`, { credentials: "include", cache: "no-store" });
        if (r.ok){
          const cfg = await r.json();
          setPrefix(cfg?.catalogPrefix || "");
          setName(cfg?.addonName || "Trakt Lists");
          setLoaded(true);
        }
      }catch{}
    })();
  }, []);

  async function save(){
    setSaving(true);
    try{
      await fetch(`/api/config`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogPrefix: prefix, addonName: name })
      });
    } finally { setSaving(false); }
  }

  if (!loaded) return null;

  return (
    <Card className="bg-surface-1 border-white/10 shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Catalog & Add‑on</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-12 gap-3">
        <div className="col-span-12 md:col-span-6">
          <label className="block text-xs text-muted mb-1">Catalog prefix (fallbacks to add‑on name)</label>
          <Input
            value={prefix}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrefix(e.target.value)}
            placeholder="e.g. My Trakt"
          />
        </div>
        <div className="col-span-12 md:col-span-6">
          <label className="block text-xs text-muted mb-1">Add‑on name (appears in manifest)</label>
          <Input
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder="e.g. Trakt Lists"
          />
        </div>
        <div className="col-span-12 pt-1">
          <Button onClick={save} disabled={saving}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}
