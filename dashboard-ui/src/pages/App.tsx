import React, { useEffect, useState } from "react";
import TopBar from "../sections/TopBar";
import TraktCard from "../sections/TraktCard";
import ListsPanel from "../sections/ListsPanel";
import AddonPanel from "../sections/AddonPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { NotifyProvider, useNotify } from "../context/notify";
import { Banner } from "../components/ui/banner";
import CatalogSettings from "../sections/CatalogSettings";
import MyTraktLists from "../sections/MyTraktLists";
import ReorderPanel from "../sections/ReorderPanel";

function GlobalBanner(){
  const { note, clear } = useNotify();
  if (!note) return null;
  return (
    <div className="max-w-[1160px] mx-auto px-8 pt-4">
      <Banner kind={note.kind} polite={note.kind!=="err"}>
        <div className="flex items-start justify-between gap-3">
          <span>{note.text}</span>
          <button className="text-xs px-2 py-1 rounded-md bg-surface-2 border border-white/10" onClick={clear}>Dismiss</button>
        </div>
      </Banner>
    </div>
  );
}

function Shell(){
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState("lists");
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/auth/me?ts=${Date.now()}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) { window.location.href = "/login"; return; }
      setMe(await r.json().catch(() => null));
    })();
  }, []);
  if (!me?.user) return null;

  return (
    <main className="max-w-[1160px] mx-auto px-6 pt-20 pb-12 space-y-6 animate-elevate">
  <TraktCard />
  <CatalogSettings />   {/* New card between Trakt and Lists */}
  <div className="rounded-lg bg-surface-1 border border-white/10 shadow-card animate-elevate">
    <div className="px-6 pt-6">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-surface-2 border border-white/10 rounded-lg">
          <TabsTrigger value="lists">Lists</TabsTrigger>
          <TabsTrigger value="import">My Trakt Lists</TabsTrigger>
          <TabsTrigger value="addon">Addon</TabsTrigger>
          <TabsTrigger value="reorder">Reorder</TabsTrigger>
        </TabsList>
        <div className="mt-4" />
        <TabsContent value="lists"><ListsPanel /></TabsContent>
        <TabsContent value="import"><MyTraktLists /></TabsContent>
        <TabsContent value="addon"><AddonPanel /></TabsContent>
        <TabsContent value="reorder"><ReorderPanel /></TabsContent>
      </Tabs>
    </div>
    <div className="pb-4" />
  </div>
</main>
  );
}

export default function App(){
  return (
    <NotifyProvider>
      <TopBar />
      <Shell />
    </NotifyProvider>
  );
}
