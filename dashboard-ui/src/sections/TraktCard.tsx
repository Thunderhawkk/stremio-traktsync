import React, { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Modal } from "../components/ui/modal";
import { useNotify } from "../context/notify";

type TraktStatus = { connected?: boolean; expires_at?: string; last_auto_refresh_at?: string; };

export default function TraktCard(){
  const { show } = useNotify();
  const [status, setStatus] = useState<TraktStatus>({ connected:false });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<{ user_code?:string; verification_url?:string; interval?:number; expires_in?:number; device_code?:string }|null>(null);
  const pollRef = useRef<number | null>(null);

  async function load(){
    const r = await fetch(`/api/trakt/token/status?ts=${Date.now()}`, { credentials:"include", cache:"no-store" });
    setStatus(r.ok ? (await r.json()) : { connected:false });
  }
  useEffect(()=>{ load(); }, []); /* [13] */

  function stopPoll(){ if (pollRef.current){ window.clearInterval(pollRef.current); pollRef.current = null; } }

  async function connect(){
    setBusy(true); show(null);
    try{
      const r = await fetch(`/api/trakt/auth/init`, { method:"POST", credentials:"include" });
      if (!r.ok) { show({kind:"err", text:"Could not start authorization. Try again."}); return; }
      const data = await r.json();
      setDevice(data); setOpen(true);
      const intervalMs = Math.max(5000, (data?.interval || 5)*1000);
      const deadline = Date.now() + (data?.expires_in || 600)*1000;
      stopPoll();
      pollRef.current = window.setInterval(async ()=>{
        if (Date.now() > deadline){ stopPoll(); setOpen(false); show({kind:"err", text:"Authorization code expired. Start again."}); return; }
        const rr = await fetch(`/api/trakt/auth/poll`, { method:"POST", credentials:"include", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ device_code: data?.device_code }) });
        if (rr.status === 202) return; /* [10] */
        const out = await rr.json().catch(()=> ({}));
        if (rr.ok && out?.authorized){
          stopPoll(); setOpen(false);
          await load();
          show({ kind:"ok", text:"Trakt connected." });
        } else {
          stopPoll(); setOpen(false);
          show({ kind:"err", text: out?.error || "Authorization failed." });
        }
      }, intervalMs);
    } finally { setBusy(false); }
  }

  async function doPost(url:string, okText:string, errText:string){
    setBusy(true); show(null);
    try{
      const r = await fetch(url, { method:"POST", credentials:"include" });
      if (!r.ok){
        let msg = errText;
        try { const d = await r.json(); if (d?.error) msg = d.error; } catch {}
        show({ kind:"err", text: msg });
      } else {
        await load();
        show({ kind:"ok", text: okText });
      }
    } finally { setBusy(false); }
  }

  const expires = status?.expires_at ? new Date(status.expires_at).toLocaleString() : null;

  return (
    <>
      <Card className="bg-surface-1 border-white/10 shadow-card animate-elevate">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Trakt account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted">
            {status.connected && expires ? `Token expires: ${expires}` : (status.connected ? "Token active" : "Not connected")}
          </p>
          <div className="flex gap-2">
            <Button onClick={connect} disabled={busy}>Connect</Button>
            <Button variant="secondary" onClick={()=>doPost(`/api/trakt/token/refresh`, "Token refreshed.", "Refresh failed.")} disabled={busy}>Refresh token</Button>
            <Button variant="destructive" onClick={()=>doPost(`/api/trakt/token/clear`, "Disconnected.", "Disconnect failed (see server logs).")} disabled={busy}>Disconnect</Button>
            <Button variant="secondary" onClick={load} disabled={busy}>Check</Button>
          </div>
        </CardContent>
      </Card>

      <Modal open={open} onClose={()=>{ setOpen(false); stopPoll(); }} title="Authorize this device">
        <div className="space-y-2">
          <div className="text-sm">User code:</div>
          <div className="text-xl font-mono px-2 py-1 rounded-md bg-surface-2 border border-white/10 inline-block">{device?.user_code || "—"}</div>
          <div className="text-sm mt-3">Open verification URL:</div>
          <a className="text-primary underline break-all" href={device?.verification_url} target="_blank" rel="noreferrer">{device?.verification_url}</a>
          <p className="text-xs text-muted mt-2">Leave this window open; authorization completes automatically once approved. </p>
        </div>
      </Modal>
    </>
  );
}
