// dashboard-ui/src/sections/TraktCard.tsx
import React, { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Modal } from "../components/ui/modal";
import { useNotify } from "../context/notify";

type TraktStatus = {
  connected?: boolean;
  expires_at?: string;               // ISO string
  last_auto_refresh_at?: string;     // ISO string
};

type TraktDevice = {
  user_code?: string;
  verification_url?: string;
  interval?: number;
  expires_in?: number;
  device_code?: string;
};

type TraktSchedule = {
  next_sweep_at?: string;            // ISO
  user_auto_refresh_at?: string;     // ISO (optional; UI also computes locally)
  interval_ms?: number;
  skew_ms?: number;
};

export default function TraktCard() {
  const { show } = useNotify();

  // Server state
  const [status, setStatus] = useState<TraktStatus>({ connected: false });
  const [sched, setSched] = useState<TraktSchedule | null>(null);

  // Local rolling anchors for countdowns
  const [now, setNow] = useState<number>(Date.now());
  const [nextSweep, setNextSweep] = useState<number | null>(null);
  const [intervalMs, setIntervalMs] = useState<number>(0);

  // UI & device auth state
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<TraktDevice | null>(null);
  const pollRef = useRef<number | null>(null);

  // 1) Heartbeat for countdowns
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []); // single 1s ticker with cleanup [13]

  // 2) Load status + schedule
  async function load() {
    try {
      const r = await fetch(`/api/trakt/token/status?ts=${Date.now()}`, { credentials: "include", cache: "no-store" });
      setStatus(r.ok ? (await r.json()) : { connected: false });
    } catch {
      setStatus({ connected: false });
    }
    try {
      const s = await fetch(`/api/trakt/schedule?ts=${Date.now()}`, { credentials: "include", cache: "no-store" });
      if (s.ok) {
        const j = await s.json();
        setSched(j);
        const t = Date.parse(j?.next_sweep_at || "");
        setNextSweep(Number.isFinite(t) ? t : null);
        setIntervalMs(Number(j?.interval_ms || 0));
      } else {
        setSched(null);
        setNextSweep(null);
        setIntervalMs(0);
      }
    } catch {
      setSched(null);
      setNextSweep(null);
      setIntervalMs(0);
    }
  }
  useEffect(() => { void load(); }, []); // initial fetch [12]

  // 3) Light polling so UI reflects background refresh without a reload
  useEffect(() => {
    const id = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(id);
  }, []); // 30s background sync [2]

  // 4) Roll “next sweep” forward so it never sticks at “due”
  useEffect(() => {
    if (!nextSweep || !intervalMs) return;
    if (now >= nextSweep) {
      const cycles = Math.ceil((now - nextSweep) / intervalMs);
      setNextSweep(nextSweep + cycles * intervalMs);
    }
  }, [now, nextSweep, intervalMs]); // rolling schedule prevents “due” stall [4]

  // Helpers
  function fmtETA(msTarget?: number | null) {
    if (!msTarget) return null;
    const ms = msTarget - now;
    if (ms <= 0) return "due";
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h >= 1 ? `${h}h ${m}m` : `${m}m ${s}s`;
  }

  function safeDateText(iso?: string) {
    const t = Date.parse(iso || "");
    if (!iso || !Number.isFinite(t)) return null;
    return new Date(t).toLocaleString();
  } // avoids “1970” on bad data [6]

  // Prefer local compute from expires_at and server skew
  function autoRefreshAtMs() {
    const skew = Number(sched?.skew_ms || 0);
    const exp = Date.parse(status?.expires_at || "");
    if (Number.isFinite(exp)) return exp - (Number.isFinite(skew) ? skew : 0);
    const fallback = Date.parse(sched?.user_auto_refresh_at || "");
    return Number.isFinite(fallback) ? fallback : null;
  }

  const etaAuto = fmtETA(autoRefreshAtMs());
  const etaSweep = fmtETA(nextSweep);

  // Device auth helpers
  function stopPoll() { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; } }

  async function connect() {
    setBusy(true); show(null);
    try {
      const r = await fetch(`/api/trakt/auth/init`, { method: "POST", credentials: "include" });
      if (!r.ok) { show({ kind: "err", text: "Could not start authorization. Try again." }); return; }
      const data: TraktDevice = await r.json();
      setDevice(data); setOpen(true);

      const intervalMs = Math.max(5000, (data?.interval || 5) * 1000);
      const deadline = Date.now() + (data?.expires_in || 600) * 1000;

      stopPoll();
      pollRef.current = window.setInterval(async () => {
        if (Date.now() > deadline) {
          stopPoll(); setOpen(false);
          show({ kind: "err", text: "Authorization code expired. Start again." });
          return;
        }
        const rr = await fetch(`/api/trakt/auth/poll`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code: data?.device_code })
        });
        if (rr.status === 202) return;
        const out = await rr.json().catch(() => ({}));
        if (rr.ok && (out as any)?.authorized) {
          stopPoll(); setOpen(false);
          await load();
          show({ kind: "ok", text: "Trakt connected." });
        } else {
          stopPoll(); setOpen(false);
          show({ kind: "err", text: (out as any)?.error || "Authorization failed." });
        }
      }, intervalMs);
    } finally {
      setBusy(false);
    }
  }

  async function doPost(url: string, okText: string, errText: string) {
    setBusy(true); show(null);
    try {
      const r = await fetch(url, { method: "POST", credentials: "include" });
      if (!r.ok) {
        let msg = errText;
        try { const d = await r.json(); if ((d as any)?.error) msg = (d as any).error; } catch {}
        show({ kind: "err", text: msg });
      } else {
        await load();
        show({ kind: "ok", text: okText });
      }
    } finally {
      setBusy(false);
    }
  }

  const expiresText = (() => {
    const nice = safeDateText(status?.expires_at);
    if (nice) return `Token expires: ${nice}`;
    return status.connected ? "Token active" : "Not connected";
  })(); // UI-stable formatting [6]

  return (
    <>
      <Card className="bg-surface-1 border-white/10 shadow-card animate-elevate">
        <CardHeader className="pb-2">
          {status.connected && etaAuto && (
            <div className="mb-2">
              <div className="banner info" role="status" aria-live="polite">
                Token will auto‑refresh in {etaAuto}{etaSweep ? ` (next check in ${etaSweep})` : ""}.
              </div>
            </div>
          )}
          <CardTitle className="text-lg">Trakt account</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm text-muted">{expiresText}</p>
          <div className="flex gap-2">
            <Button onClick={connect} disabled={busy}>Connect</Button>
            <Button
              variant="secondary"
              onClick={() => doPost(`/api/trakt/token/refresh`, "Token refreshed.", "Refresh failed.")}
              disabled={busy}
            >
              Refresh token
            </Button>
            <Button
              variant="destructive"
              onClick={() => doPost(`/api/trakt/token/clear`, "Disconnected.", "Disconnect failed (see server logs).")}
              disabled={busy}
            >
              Disconnect
            </Button>
            <Button variant="secondary" onClick={() => { void load(); }} disabled={busy}>Check</Button>
          </div>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => { setOpen(false); stopPoll(); }} title="Authorize this device">
        <div className="space-y-2">
          <div className="text-sm">User code:</div>
          <div className="text-xl font-mono px-2 py-1 rounded-md bg-surface-2 border border-white/10 inline-block">
            {device?.user_code || "—"}
          </div>
          <div className="text-sm mt-3">Open verification URL:</div>
          <a className="text-primary underline break-all" href={device?.verification_url} target="_blank" rel="noreferrer">
            {device?.verification_url}
          </a>
          <p className="text-xs text-muted mt-2">Leave this window open; authorization completes automatically once approved.</p>
        </div>
      </Modal>
    </>
  );
}
