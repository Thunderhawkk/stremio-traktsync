// dashboard-ui/lib/reorderClient.ts
export type RawAddon = any;

export type LoadedAddon = {
  id: string;
  name: string;
  icon?: string;
  url?: string;    // transportUrl/url
  key: string;     // canonical identifier used in order (transportUrl/url, fallback id)
  protected?: boolean;
};

const API = "https://api.strem.io"; // manager calls the public API directly [2]

// ----- internal helpers -----
function vals(x: any): any[] {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "object") return Object.values(x);
  return [];
}

function pickAddonsFrom(json: any): any[] {
  if (json?.result?.addons) return vals(json.result.addons); // common RPC shape [2]
  if (json?.addons) return vals(json.addons);                 // seen in some variants [2]
  if (json?.data?.addons) return vals(json.data.addons);      // fallback [2]
  if (json?.collection) return vals(json.collection);         // legacy [2]
  return [];
}

export function mapAddons(arr: any[]): LoadedAddon[] {
  return (arr || []).map((a: any) => {
    const url = a?.transportUrl || a?.url || ""; // identifier Stremio expects in order [2]
    const id  = a?.id || "";
    const name = a?.name || a?.manifest?.name || a?.descriptor?.name || id || url;
    const icon = a?.logo || a?.icon || a?.manifest?.logo || undefined;
    const protectedFlag = !!(a?.protected || a?.isProtected);
    return { id: String(id || url), name: String(name), icon, url: url || undefined, key: String(url || id), protected: protectedFlag };
  });
}

async function postJson(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body)
  });
  const txt = await r.text().catch(() => "");
  let json: any = {};
  try { json = txt ? JSON.parse(txt) : {}; } catch { json = {}; }
  return { ok: r.ok, json };
}

// ----- public API (manager-compatible) -----
export async function getCollection(authKey: string): Promise<LoadedAddon[]> {
  // Probe 1: RPC body (manager behavior) [2]
  let r1 = await postJson(`${API}/api/addonCollectionGet`, { type: "AddonCollectionGet", authKey, update: true });
  let list = mapAddons(pickAddonsFrom(r1.json));
  if (list.length) return list;

  // Probe 2: minimal body (compat) [2]
  let r2 = await postJson(`${API}/api/addonCollectionGet`, { authKey });
  list = mapAddons(pickAddonsFrom(r2.json));
  if (list.length) return list;

  // Probe 3: plural endpoint (compat) [2]
  let r3 = await postJson(`${API}/api/addonsCollectionGet`, { authKey });
  list = mapAddons(pickAddonsFrom(r3.json));
  return list;
}

export async function setCollection(authKey: string, orderKeys: string[]): Promise<boolean> {
  // Manager posts a full array of transportUrl/url strings (not display IDs). [2]
  const r1 = await postJson(`${API}/api/addonCollectionSet`, { type: "AddonCollectionSet", authKey, order: orderKeys });
  if (r1.ok) return true;

  const r2 = await postJson(`${API}/api/addonsCollectionSet`, { authKey, order: orderKeys }); // compat [2]
  return r2.ok;
}

export async function loginAndGetAuthKey(email: string, password: string): Promise<string | null> {
  const r = await fetch(`${API}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const j: any = await r.json().catch(() => ({}));
  const key = j?.authKey || j?.auth || j?.user?.authKey || j?.result?.authKey || null; // variants [2]
  return r.ok ? (key || null) : null;
}
