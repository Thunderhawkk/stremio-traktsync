// dashboard-ui/src/sections/ListsPanel.tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { createPortal } from "react-dom";

/* ----------------------------- Types ------------------------------ */
type ListItem = {
  id?: string;
  name?: string;
  url?: string;
  type?: "movie" | "series";
  enabled?: boolean;
  sortBy?: string;
  sortOrder?: string;
  genre?: string;
  yearMin?: string;
  yearMax?: string;
  ratingMin?: string;
  ratingMax?: string;
  hideUnreleased?: boolean;
};

const rowId = (it: ListItem, idx: number) => it.id || `idx-${idx}`;

/* ------------------------- Sortable wrapper ------------------------ */
function SortableWrapper({
  id,
  children
}: {
  id: string;
  children: (
    dragHandle: React.ReactNode,
    refCb: (el: HTMLElement | null) => void,
    style: React.CSSProperties
  ) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1
  };
  const dragHandle = (
    <button
      className="cursor-grab px-2 py-1 text-white/70 hover:text-white rounded-md border border-white/10"
      aria-label="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      ☰
    </button>
  );
  return <>{children(dragHandle, setNodeRef, style)}</>;
}

/* ------------------------ Fixed portal (panel + tab) ---------------------- */
/* IMPORTANT: Button and panel positions are preserved exactly. */
function GenresPortal({
  anchorRef,
  open,
  onToggle,
  genres,
  onEnsureGenres
}: {
  anchorRef: React.RefObject<HTMLElement>;
  open: boolean;
  onToggle: () => void;
  genres: string[];
  onEnsureGenres: () => Promise<void>;
}) {
  const PANEL_W = 320;      // px
  const PANEL_GAP = 8;      // px (visible gap from the Lists border)
  const TAB_W   = 36;       // px
  const BTN_OFFSET_Y = 24;  // px

  const [rect, setRect] = useState<{ top: number; right: number; height: number } | null>(null);

  // Resolve outermost bordered ancestor (Lists card) and measure via viewport-aligned DOMRect. 
  function resolveOuterBordered(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    let cur: HTMLElement | null = el;
    let last: HTMLElement | null = null;
    while (cur && cur !== document.body) {
      const cs = getComputedStyle(cur);
      const bw =
        (parseFloat(cs.borderTopWidth || "0") || 0) +
        (parseFloat(cs.borderRightWidth || "0") || 0) +
        (parseFloat(cs.borderBottomWidth || "0") || 0) +
        (parseFloat(cs.borderLeftWidth || "0") || 0);
      if (bw > 0 && cs.borderStyle !== "none") last = cur;
      cur = cur.parentElement;
    }
    return last || el;
  }

  useLayoutEffect(() => {
    const measure = () => {
      const base = resolveOuterBordered(anchorRef.current);
      if (!base) return;
      const r = base.getBoundingClientRect(); // viewport coordinates of the Lists card border box
      setRect({ top: Math.round(r.top), right: Math.round(r.right), height: Math.round(r.height) });
    };
    const ro = new ResizeObserver(measure);
    const base = resolveOuterBordered(anchorRef.current);
    if (base) ro.observe(base);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      if (base) ro.unobserve(base);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [anchorRef]);

  // Ensure content exists when first opening.
  useEffect(() => {
    if (open && (!genres || genres.length === 0)) void onEnsureGenres();
  }, [open, genres, onEnsureGenres]);

  if (!rect) return null;

  /* POSITIONS (DO NOT CHANGE): 
     - Button: closed at Lists border (rect.right), open on panel right edge (rect.right + PANEL_GAP + PANEL_W).
     - Panel: fixed just outside Lists border (left = rect.right + PANEL_GAP). */
  const buttonLeft = open ? rect.right + PANEL_GAP + PANEL_W : rect.right;
  const buttonStyle: React.CSSProperties = {
    position: "fixed",
    top: rect.top + BTN_OFFSET_Y,
    left: buttonLeft,
    width: TAB_W,
    height: TAB_W,
    transition: "left 300ms ease-out",
    zIndex: 1001
  };

  // Panel anchor and sizing (no position changes), reveal via left-anchored clip-path with anti-fringe. 
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: rect.top,
    left: rect.right + PANEL_GAP,
    width: PANEL_W,
    height: "auto",                 // shrink-wrap content; no extra bottom space
    maxHeight: rect.height,         // clamp to Lists card height
    overflow: "hidden",             // outer mask; inner wrapper scrolls only when needed
    clipPath: open ? "inset(0 0 0 0)" : "inset(0 calc(100% + 1px) 0 0)", // reveal from left; hide fully with 1px nudge
    transition: open
      ? "clip-path 300ms ease-out, visibility 0s linear 0s"
      : "clip-path 300ms ease-out, visibility 0s linear 300ms",          // hide after close completes
    visibility: open ? "visible" : "hidden",                              // never paint when closed
    willChange: "clip-path",
    zIndex: 1000
  };

  return createPortal(
    <>
      <aside
        role="region"
        aria-label="Supported genres and filter syntax"
        className="bg-[var(--color-surface-2)]/95 backdrop-blur border border-white/10 shadow-xl rounded-md"
        style={panelStyle}
      >
        {/* Inner content wrapper: compact padding, no margin gaps at edges, scroll only when needed. */}
        <div
          className="rail-content"
          style={{
            maxHeight: "inherit",       // follow panel clamp
            overflowY: "auto",          // scroll only if needed
            padding: "8px 12px",        // tighter vertical padding
            display: "flow-root"        // BFC to prevent margin collapsing
          }}
        >
          <style>{`
            .rail-content > :first-child { margin-top: 0; }   /* remove top gap from first child margins */ 
            .rail-content > :last-child  { margin-bottom: 0; }/* remove bottom gap from last child margins */
            .rail-content h3 { margin: 0 0 8px 0; }           /* compact heading spacing */
            .rail-content h4 { margin: 12px 0 6px 0; }        /* tidy subheading spacing */
          `}</style>

          <h3 className="text-sm font-semibold">Supported genres</h3>
          <p className="text-xs text-white/80 leading-relaxed">
            {Array.isArray(genres) && genres.length ? genres.join(", ") : "—"}
          </p>

          <div className="mt-3 h-px bg-white/10" />

          <h4 className="text-sm font-semibold">Filter syntax</h4>
          <ul className="mt-2 list-disc pl-5 text-xs text-white/80 space-y-1">
            <li>AND: “+”, e.g. <code>Comedy + Horror</code>.</li>
            <li>OR: “,”, e.g. <code>Comedy, Horror</code>.</li>
            <li>Single: <code>Action</code>.</li>
          </ul>
        </div>
      </aside>

      {/* Toggle: closed shows “>” at the Lists border; open shows “x” at the panel’s right edge. */}
      <button
        type="button"
        aria-label={open ? "Close panel" : "Open panel"}
        aria-expanded={open}
        onClick={onToggle}
        className="grid place-items-center rounded-r-md bg-[var(--color-surface-2)] border border-white/10 border-l-0 text-white/80 hover:bg-[var(--color-surface-3)] shadow-lg"
        style={buttonStyle}
      >
        {open ? "x" : ">"}
      </button>
    </>,
    document.body
  );
}

/* ------------------------------ Main ------------------------------- */
export default function ListsPanel() {
  const [lists, setLists] = useState<ListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [hideAll, setHideAll] = useState(false);
  const [supportedGenres, setSupportedGenres] = useState<string[]>([]);
  const [showGenres, setShowGenres] = useState(false);

  // Toggle whether the Lists panel shows an inner border around heading/buttons/lists.
  const WITH_INNER_BORDER = false; // set true to keep inner border; false to remove (revert)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Initial load (config + optional genres).
  async function load() {
    setBusy(true);
    try {
      const [cfgR, gR] = await Promise.all([
        fetch(`/api/config?ts=${Date.now()}`, { credentials: "include", cache: "no-store" }),
        fetch(`/api/genres?ts=${Date.now()}`, { credentials: "include", cache: "no-store" })
      ]);
      const data = cfgR.ok ? await cfgR.json() : { lists: [] };
      setLists((data.lists as ListItem[]) || []);
      setHideAll(!!data.hideUnreleasedAll);
      if (gR.ok) {
        const gj = await gR.json().catch(() => null);
        if (gj && Array.isArray(gj.genres)) setSupportedGenres(gj.genres);
      }
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Lazy genre loader for first open. 
  const ensureGenres = async () => {
    if (supportedGenres.length) return;
    const r = await fetch(`/api/genres?ts=${Date.now()}`, { credentials: "include", cache: "no-store" });
    if (r.ok) {
      const gj = await r.json().catch(() => null);
      if (gj && Array.isArray(gj.genres)) setSupportedGenres(gj.genres);
    }
  };

  useEffect(() => {
    function onCfg(ev: Event) {
      const det = (ev as CustomEvent)?.detail;
      if (det && typeof det.hideUnreleasedAll === "boolean") setHideAll(!!det.hideUnreleasedAll);
    }
    window.addEventListener("config:updated", onCfg as EventListener);
    return () => window.removeEventListener("config:updated", onCfg as EventListener);
  }, []);

  function updateItem(idx: number, patch: Partial<ListItem>) {
    setLists(prev => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }
  function add() {
    setLists(prev => [{ id: "", name: "New list", url: "", type: "movie", enabled: true }, ...prev]);
  }
  async function save() {
    const body = { lists: lists.map((x, i) => ({ ...x, order: i })) };
    await fetch(`/api/config`, { method:"POST", credentials:"include", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
  }
  async function removeItem(it: ListItem) {
    if (!it.id) { setLists(prev => prev.filter(x => x !== it)); return; }
    await fetch(`/api/config/${encodeURIComponent(it.id)}`, { method: "DELETE", credentials: "include" });
    await load();
  }
  async function validate(it: ListItem) {
    const body = {
      url: it.url?.trim() || "",
      type: it.type || "movie",
      extras: {
        sort: it.sortBy || "",
        order: it.sortOrder || "desc",
        genre: it.genre || "",
        yearMin: it.yearMin || "",
        yearMax: it.yearMax || "",
        ratingMin: it.ratingMin || "",
        ratingMax: it.ratingMax || ""
      }
    };
    await fetch(`/api/validate-list`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
  async function validateAll(){
    const r = await fetch(`/api/validate-all`, { method:"POST", credentials:"include" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return;
  }
  async function preview(it: ListItem) {
    const body = {
      url: it.url?.trim() || "",
      type: it.type || "movie",
      extras: {
        sort: it.sortBy || "",
        order: it.sortOrder || "desc",
        genre: it.genre || "",
        yearMin: it.yearMin || "",
        yearMax: it.yearMax || "",
        ratingMin: it.ratingMin || "",
        ratingMax: it.ratingMax || ""
      }
    };
    await fetch(`/api/preview-list`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
  async function persistOrder(next: ListItem[]) {
    const body = { lists: next.map((x, i) => ({ ...x, order: i })) };
    await fetch(`/api/config`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
  function onDragEnd(ev: any) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    setLists(prev => {
      const keys = prev.map(rowId);
      const oldIndex = keys.indexOf(active.id);
      const newIndex = keys.indexOf(over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      void persistOrder(next);
      return next;
    });
  }

  // OUTER Lists card ref: the portal measures this for exact border coordinates. 
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative overflow-visible">
      {/* OUTER Lists card wrapper (inner border toggle) */}
      <div
        id="lists-panel-anchor"
        ref={cardRef}
        className={WITH_INNER_BORDER ? "rounded-lg border border-white/10 p-3" : "rounded-lg p-3"}
      >
        {/* Heading + actions row: add bottom margin so lists don't touch */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Manage Trakt lists that power the addon.</h2>
          <div className="flex gap-2">
            <Button onClick={add}>Add list</Button>
            <Button variant="secondary" onClick={save} disabled={busy}>Save changes</Button>
            <Button variant="secondary" onClick={validateAll} disabled={busy}>Validate all</Button>
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          {/* Add a small top margin so the first list never touches the header row */}
          <SortableContext items={lists.map(rowId)} strategy={verticalListSortingStrategy}>
            <Accordion.Root type="single" collapsible className="w-full space-y-3 mt-3">
              {lists.map((it, idx) => {
                const id = rowId(it, idx);
                return (
                  <SortableWrapper id={id} key={id}>
                    {(dragHandle, refCb, style) => (
                      <Accordion.Item
                        ref={refCb as any}
                        value={id}
                        style={style}
                        className="rounded-lg border border-white/10 bg-[var(--color-surface-1)]"
                      >
                        <Accordion.Header className="flex items-center justify-between w-full px-3 py-2">
                          <Accordion.Trigger className="flex items-center gap-2 flex-1 text-left">
                            {dragHandle}
                            <span className="font-medium">{it.name || "Untitled"}</span>
                            <span className="ml-3 text-white/60 text-sm">
                              {it.type === "series" ? "Series" : "Movies"}
                            </span>
                          </Accordion.Trigger>
                          <div
                            className="pl-3"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Switch
                              checked={!!it.enabled}
                              onCheckedChange={(v: boolean) => updateItem(idx, { enabled: v })}
                            />
                          </div>
                        </Accordion.Header>

                        <Accordion.Content className="accordion-content px-3 pb-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <label className="text-sm text-white/70">Name</label>
                              <Input
                                value={it.name || ""}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateItem(idx, { name: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm text-white/70">Type</label>
                              <select
                                className="h-10 w-full rounded-md bg-[var(--color-surface-2)] border border-white/10 px-3"
                                value={it.type || "movie"}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                  updateItem(idx, { type: e.target.value as "movie" | "series" })
                                }
                              >
                                <option value="movie">Movies</option>
                                <option value="series">Series</option>
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-sm text-white/70">URL (Trakt/mdblist or username/lists/slug)</label>
                              <Input
                                value={it.url || ""}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateItem(idx, { url: e.target.value })
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <div>
                              <label className="text-sm text-white/70">Sort</label>
                              <select
                                className="h-10 w-full rounded-md bg-[var(--color-surface-2)] border border-white/10 px-3"
                                value={it.sortBy || ""}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                  updateItem(idx, { sortBy: e.target.value })
                                }
                              >
                                <option value="">—</option>
                                <option value="rating">Rating</option>
                                <option value="year">Year</option>
                                <option value="runtime">Runtime</option>
                                <option value="name">Name</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-sm text-white/70">Order</label>
                              <select
                                className="h-10 w-full rounded-md bg-[var(--color-surface-2)] border border-white/10 px-3"
                                value={it.sortOrder || "desc"}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                                  updateItem(idx, { sortOrder: e.target.value })
                                }
                              >
                                <option value="desc">Desc</option>
                                <option value="asc">Asc</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-sm text-white/70">Genre filter</label>
                              <Input
                                value={it.genre || ""}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateItem(idx, { genre: e.target.value })
                                }
                                placeholder="e.g., Action+Comedy or Action,Comedy"
                              />
                            </div>
                            <div>
                              <label className="text-sm text-white/70">Year min</label>
                              <Input
                                value={it.yearMin || ""}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateItem(idx, { yearMin: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm text-white/70">Year max</label>
                              <Input
                                value={it.yearMax || ""}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateItem(idx, { yearMax: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm text-white/70">Rating min</label>
                              <Input
                                value={it.ratingMin || ""}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateItem(idx, { ratingMin: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm text-white/70">Rating max</label>
                              <Input
                                value={it.ratingMax || ""}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                  updateItem(idx, { ratingMax: e.target.value })
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-2">
                            <label className="text-sm text-white/70">Hide unreleased</label>
                            <div className="h-10 flex items-center">
                              <Switch
                                checked={hideAll || !!it.hideUnreleased}
                                onCheckedChange={(v: boolean) => updateItem(idx, { hideUnreleased: v })}
                                disabled={hideAll}
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex gap-2">
                            <Button variant="secondary" onClick={() => validate(it)}>Validate</Button>
                            <Button variant="secondary" onClick={() => preview(it)}>Preview</Button>
                            <Button variant="destructive" onClick={() => removeItem(it)}>Delete</Button>
                          </div>
                        </Accordion.Content>
                      </Accordion.Item>
                    )}
                  </SortableWrapper>
                );
              })}
            </Accordion.Root>
          </SortableContext>
        </DndContext>

        {!lists.length && <div className="text-white/60 mt-3">No lists yet.</div>}
      </div>

      {/* Fixed portal pinned to the Lists card border (positions preserved) */}
      <GenresPortal
        anchorRef={cardRef}
        open={showGenres}
        onToggle={() => setShowGenres(v => !v)}
        genres={supportedGenres}
        onEnsureGenres={ensureGenres}
      />
    </div>
  );
}
