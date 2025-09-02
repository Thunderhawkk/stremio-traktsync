// dashboard-ui/src/sections/MyTraktLists.tsx
import React, { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

type TList = { name: string; slug: string; privacy?: string };

export default function MyTraktLists(){
  const [lists, setLists] = useState<TList[]>([]);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState<string>("me"); // server will use /users/me when authorized

  async function load(){
    setBusy(true);
    try{
      const r = await fetch(`/api/trakt/me/lists?ts=${Date.now()}`, { credentials:"include", cache:"no-store" });
      const data = r.ok ? await r.json() : [];
      setLists(data || []);
    } finally { setBusy(false); }
  }
  useEffect(()=>{ load(); }, []);

  async function add(l: TList){
    // Add to config lists with a canonical Trakt URL
    const url = `https://trakt.tv/users/${username}/lists/${l.slug}`;
    const r = await fetch(`/api/config?ts=${Date.now()}`, { credentials:"include", cache:"no-store" });
    const cfg = r.ok ? await r.json() : { lists: [] };
    const next = [{ name: l.name, url, type: "movie", enabled: true }, ...(cfg.lists || [])];
    await fetch(`/api/config`, {
      method:"POST",
      credentials:"include",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ lists: next })
    });
    alert(`Added "${l.name}"`);
  }

  if (busy) return <Card className="bg-surface-2 border-white/10 p-6">Loading…</Card>;
  if (!lists.length) return <Card className="bg-surface-2 border-white/10 p-6">No Trakt lists found or not connected.</Card>;

  return (
    <div className="space-y-3">
      {lists.map((l, i) => (
        <Card key={i} className="bg-surface-2 border-white/10 p-4 flex items-center justify-between">
          <div>
            <div className="font-semibold">{l.name}</div>
            <div className="text-xs text-muted">/{l.slug}</div>
          </div>
          <Button onClick={()=>add(l)}>Add</Button>
        </Card>
      ))}
    </div>
  );
}
