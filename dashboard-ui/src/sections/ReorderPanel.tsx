// dashboard-ui/src/sections/ReorderPanel.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter, DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

type Addon = {
  id: string;            // human-readable or internal id
  name: string;
  icon?: string;
  url?: string;          // transportUrl/url returned by Stremio
  key: string;           // canonical order key: transportUrl/url (fallback id)
  protected?: boolean;   // cannot be deleted
};

const API = "https://api.strem.io";

// ---------- helpers ----------
function pickAuthKey(j: any): string | null {
  return j?.authKey || j?.auth || j?.user?.authKey || j?.result?.authKey || null;
}
function vals(x: any): any[] {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "object") return Object.values(x);
  return [];
}
function pickAddonsFrom(json: any): any[] {
  if (json?.result?.addons) return vals(json.result.addons);
  if (json?.addons) return vals(json.addons);
  if (json?.data?.addons) return vals(json.data.addons);
  if (json?.collection) return vals(json.collection);
  return [];
}
function mapAddons(arr: any[]): Addon[] {
  return (arr || []).map((a: any) => {
    const url = a?.transportUrl || a?.url || "";   // the identifier Stremio expects for order
    const id  = a?.id || "";
    const name = a?.name || a?.manifest?.name || a?.descriptor?.name || id || url;
    const icon = a?.logo || a?.icon || a?.manifest?.logo || undefined;
    const key  = String(url || id);                // always prefer transport/url as the order key
    const prot = !!(a?.protected || a?.isProtected);
    return { id: String(id || url), name: String(name), icon, url: url || undefined, key, protected: prot };
  });
}
async function postJson(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await r.text().catch(() => "");
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  return { ok: r.ok, json };
}

// ---------- row ----------
function SortableRow({ addon, onDelete }: { addon: Addon; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: addon.key });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.92 : 1 };
  return (
    <div ref={setNodeRef} style={style}
         className="flex items-center justify-between rounded-md border border-white/10 bg-[var(--color-surface-1)] px-3 py-2"
         title={addon.url || addon.id}>
      <div className="flex min-w-0 items-center gap-3">
        <button className="cursor-grab px-2 py-1 text-white/70 hover:text-white rounded-md border border-white/10 shrink-0"
                aria-label="Drag" {...attributes} {...listeners}>☰</button>
        {addon.icon ? <img src={addon.icon} alt="" className="h-5 w-5 rounded shrink-0" /> : <div className="h-5 w-5 rounded bg-white/10 shrink-0" />}
        <div className="min-w-0">
          <div className="font-medium truncate max-w-[38rem]">{addon.name}</div>
          <div className="text-xs text-white/50 truncate max-w-[42rem]">{addon.url || addon.id}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <code className="text-xs text-white/50 hidden sm:block truncate max-w-[18rem]">{addon.key}</code>
        <Button variant="destructive" disabled={addon.protected} onClick={() => onDelete(addon.key)}>
          {addon.protected ? "Protected" : "Delete"}
        </Button>
      </div>
    </div>
  );
}

// ---------- panel ----------
export default function ReorderPanel(){
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [authKey, setAuthKey] = useState<string>("");        // one‑time; no storage
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);
  const [note, setNote] = useState<string>("");
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  const [allowDeletes, setAllowDeletes] = useState<boolean>(false);

  // Baseline of order keys captured from a successful load
  const baselineKeysRef = useRef<string[]>([]);

  useEffect(() => { setNote(""); }, [authKey]);

  // Probes multiple shapes to get the collection
  async function probeCollection(key: string): Promise<Addon[]> {
    let r1 = await postJson(`${API}/api/addonCollectionGet`, { type: "AddonCollectionGet", authKey: key, update: true });
    let list = mapAddons(pickAddonsFrom(r1.json));
    if (list.length) return list;

    let r2 = await postJson(`${API}/api/addonCollectionGet`, { authKey: key });
    list = mapAddons(pickAddonsFrom(r2.json));
    if (list.length) return list;

    let r3 = await postJson(`${API}/api/addonsCollectionGet`, { authKey: key });
    list = mapAddons(pickAddonsFrom(r3.json));
    return list;
  }

  async function load(k?: string) {
    const key = (k ?? authKey ?? "").trim();
    if (!key) { setNote("Enter an AuthKey or sign in, then press Load addons."); return; }
    setLoading(true);
    setNote("");
    try {
      const list = await probeCollection(key);
      setAddons(list);
      baselineKeysRef.current = list.map(a => a.key);  // capture complete transportUrl-based order
      setDirty(false);
      if (!list.length) setNote("No addons were returned for this account/key.");
    } catch {
      setNote("Could not load addons. Check the AuthKey or try signing in again.");
    } finally { setLoading(false); }
  }

  function onDragEnd(evt: DragEndEvent){
    const { active, over } = evt;
    if (!over || active.id === over.id) return;
    setAddons(prev => {
      const keys = prev.map(a => a.key);
      const from = keys.indexOf(String(active.id));
      const to   = keys.indexOf(String(over.id));
      const next = arrayMove(prev, from, to);
      setDirty(true);
      return next;
    });
  }

  function deleteAddon(key: string){
    setAddons(prev => {
      const next = prev.filter(a => a.key !== key);
      setDirty(true);
      if (!next.length) setNote("List is empty; press Save to apply removal.");
      return next;
    });
  }

  function completeOrderForSafety(currentKeys: string[]): string[] {
    if (allowDeletes) return currentKeys;                 // caller confirmed deletions
    // Re-append anything from baseline that’s not in the current view (prevents accidental wipes)
    const missing = baselineKeysRef.current.filter(k => !currentKeys.includes(k));
    return [...currentKeys, ...missing];
  }

  async function save(){
    const key = authKey.trim();
    if (!key) { setNote("Enter an AuthKey or sign in first."); return; }

    // Block saving if we never captured a baseline
    if (!baselineKeysRef.current.length) {
      setNote("No baseline loaded. Press Load addons first, then try saving.");
      return;
    }

    const currentKeys = addons.map(a => a.key);
    const removed = baselineKeysRef.current.filter(k => !currentKeys.includes(k));

    if (removed.length && !allowDeletes) {
      setNote("Deletions are disabled. Enable 'Allow deletions' to remove add-ons when saving.");
      return;
    }
    if (removed.length && allowDeletes) {
      const ok = window.confirm(`This will remove ${removed.length} add-on(s) from your account. Continue?`);
      if (!ok) return;
    }

    // Always send transportUrl/url keys; never display IDs
    const order = completeOrderForSafety(currentKeys);

    let r1 = await postJson(`${API}/api/addonCollectionSet`, { type: "AddonCollectionSet", authKey: key, order });
    let ok = r1.ok;
    if (!ok) {
      const r2 = await postJson(`${API}/api/addonsCollectionSet`, { authKey: key, order });
      ok = r2.ok;
    }
    if (!ok) { setNote("Save failed. Try again."); return; }

    await load(key);                   // confirm server truth immediately
    baselineKeysRef.current = order;   // refresh baseline to what we just wrote
    setDirty(false);
    setNote("Order saved in Stremio.");
  }

  // One-time account login
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  async function accountLogin(){
    if (!email || !password) { setNote("Enter both email and password."); return; }
    setNote("");
    const r = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const j = await r.json().catch(()=> ({}));
    const k = pickAuthKey(j) || "";
    if (!r.ok || !k) { setNote("Login failed. Check details and try again."); return; }
    setAuthKey(k);
    setEmail(""); setPassword("");
    await load(k);
  }

  return (
    <div className="space-y-4">
      {/* AuthKey + actions + help */}
      <div className="rounded-lg border border-white/10 p-3 bg-[var(--color-surface-1)]">
        <div className="flex items-center gap-2">
          <Input placeholder="Paste Stremio AuthKey"
                 value={authKey}
                 onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuthKey(e.target.value)} />
          <Button variant="secondary" onClick={() => { const k = authKey.trim(); if (k){ void load(k); } }}>
            Load addons
          </Button>
          <Button onClick={save} disabled={!dirty || !authKey.trim()}>
            Save order
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={allowDeletes} onChange={(e) => setAllowDeletes(e.target.checked)} />
            Allow deletions when saving
          </label>
          <button
            type="button"
            className="h-10 w-10 rounded-md border border-white/10 text-white/80 hover:text-white"
            aria-label="How to get AuthKey"
            onClick={() => setHelpOpen(v => !v)}
            title="How to get AuthKey"
          >
            ?
          </button>
        </div>
        {helpOpen && (
          <div className="mt-2 text-sm text-white/80 space-y-1">
            <div>Sign in below to fetch the key automatically for this session.</div>
            <div>Or on web.stremio.com: sign in, open the browser Console, run
              JSON.parse(localStorage.getItem("profile")).auth.key and paste the value here.</div>
          </div>
        )}
        {note && <p className="mt-2 text-sm text-white/70">{note}</p>}
      </div>

      {/* One‑time account login */}
      <div className="rounded-lg border border-white/10 p-3 bg-[var(--color-surface-1)]">
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Email" value={email}
                 onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password}
                 onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} />
          <Button onClick={accountLogin}>Login and load addons</Button>
        </div>
        <p className="mt-2 text-sm text-white/60">Credentials and keys are used once in this tab and are not stored.</p>
      </div>

      {/* List */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={addons.map(a => a.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {loading ? (
              <div className="text-white/60">Loading…</div>
            ) : addons.length ? (
              addons.map(a => <SortableRow key={a.key} addon={a} onDelete={deleteAddon} />)
            ) : (
              <div className="text-white/60">No addons loaded.</div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
