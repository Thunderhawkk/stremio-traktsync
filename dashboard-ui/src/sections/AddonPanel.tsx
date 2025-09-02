import React, { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { useNotify } from "../context/notify";

export default function AddonPanel(){
  const { show } = useNotify();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function load(){
    setLoading(true);
    try{
      const r = await fetch(`/api/addon-info`, { credentials:"include" });
      setData(r.ok ? await r.json() : null);
    } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, []);

  async function copy(){
    try{ await navigator.clipboard.writeText(data?.manifestUrl || ""); show({ kind:"ok", text:"Manifest copied." }); }
    catch{ show({ kind:"err", text:"Copy failed." }); }
  }

  if (loading) return <Card className="bg-surface-2 border-white/10 p-6">Loading…</Card>;
  if (!data) return <Card className="bg-surface-2 border-white/10 p-6">No addon info available.</Card>;

  return (
    <div className="space-y-3">
      <Card className="bg-surface-2 border-white/10 p-6">
        <pre className="text-sm whitespace-pre-wrap">{`Manifest URL:\n${data.manifestUrl}\n\nEnabled catalogs: ${data.enabledCatalogs}`}</pre>
        <div className="flex gap-2 mt-3">
          <Button onClick={copy}>Copy manifest</Button>
          <a className="inline-flex items-center px-3 py-2 rounded-md border border-white/10 bg-surface-3" href={data.stremioLink}>Install in Stremio</a>
        </div>
      </Card>
    </div>
  );
}
