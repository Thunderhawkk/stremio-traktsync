// dashboard-ui/src/sections/ListsPanel.tsx

import React, { useEffect, useState } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";

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
};

const rowId = (it: ListItem, idx: number) => it.id || `idx-${idx}`;

/* Sortable wrapper that preserves original row UI */
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

export default function ListsPanel() {
  const [lists, setLists] = useState<ListItem[]>([]);
  const [busy, setBusy] = useState(false);

  // Small drag threshold to avoid accidental drags on click
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } })); // [12]

  async function load() {
    setBusy(true);
    try {
      const r = await fetch(`/api/config?ts=${Date.now()}`, { credentials: "include", cache: "no-store" });
      const data = r.ok ? await r.json() : { lists: [] };
      setLists((data.lists as ListItem[]) || []);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function updateItem(idx: number, patch: Partial<ListItem>) {
    setLists(prev => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function add() {
    setLists(prev => [{ id: "", name: "New list", url: "", type: "movie", enabled: true }, ...prev]);
  }

  async function save() {
    const body = { lists: lists.map((x, i) => ({ ...x, order: i })) };
    const r = await fetch(`/api/config`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (r.ok) await load();
  }

  async function removeItem(it: ListItem) {
    if (!it.id) {
      setLists(prev => prev.filter(x => x !== it));
      return;
    }
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

  return (
    <div className="space-y-3">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Manage Trakt lists that power the addon.</h2>
        <div className="flex gap-2">
          <Button onClick={add}>Add list</Button>
          <Button variant="secondary" onClick={save} disabled={busy}>
            Save changes
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={lists.map(rowId)} strategy={verticalListSortingStrategy}>
          <Accordion.Root type="single" collapsible className="w-full space-y-3">
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
                      {/* Header split: Trigger (left) + Switch (right) so the switch doesn't toggle the row */}
                      <Accordion.Header className="flex items-center justify-between w-full px-3 py-2">
                        <Accordion.Trigger className="flex items-center gap-2 flex-1 text-left">
                          {dragHandle}
                          <span className="font-medium">{it.name || "Untitled"}</span>
                          <span className="ml-3 text-white/60 text-sm">
                            {it.type === "series" ? "Series" : "Movies"}
                          </span>
                        </Accordion.Trigger>

                        {/* Keep switch OUTSIDE Trigger and stop bubbling */}
                        <div
                          className="pl-3"
                          onPointerDown={(e) => e.stopPropagation()}  // prevent accordion toggle on pointer down [13]
                          onClick={(e) => e.stopPropagation()}        // prevent click from toggling the row [13]
                        >
                          <Switch
                            checked={!!it.enabled}
                            onCheckedChange={(v: boolean) => updateItem(idx, { enabled: v })}
                          />
                        </div>
                      </Accordion.Header>

                      <Accordion.Content className="accordion-content px-3 pb-3">
                        {/* Name + Type + URL */}
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

                        {/* Sorting + Filters */}
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

                        {/* Row actions */}
                        <div className="mt-3 flex gap-2">
                          <Button variant="secondary" onClick={() => validate(it)}>
                            Validate
                          </Button>
                          <Button variant="secondary" onClick={() => preview(it)}>
                            Preview
                          </Button>
                          <Button variant="destructive" onClick={() => removeItem(it)}>
                            Delete
                          </Button>
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

      {!lists.length && <div className="text-white/60">No lists yet.</div>}
    </div>
  );
}
