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
// PersonalizedLists removed

// Custom Error Boundary Component
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Dashboard Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted mb-4">The dashboard encountered an error. Please refresh the page.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function GlobalBanner(){
  const { note, clear } = useNotify();
  if (!note) return null;
  return (
    <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-40 max-w-md w-full mx-4">
      <Banner kind={note.kind} polite={note.kind!="err"}>
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm flex-1">{note.text}</span>
          <button 
            className="text-xs px-2 py-1 rounded-md bg-surface-2 border border-white/10 hover:bg-surface-3 transition-colors flex-shrink-0" 
            onClick={clear}
            aria-label="Dismiss notification"
          >
            Dismiss
          </button>
        </div>
      </Banner>
    </div>
  );
}

function Shell(){
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("lists");
  
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/auth/me?ts=${Date.now()}`, { 
          credentials: "include", 
          cache: "no-store" 
        });
        if (!r.ok) { 
          window.location.href = "/login"; 
          return; 
        }
        const userData = await r.json().catch(() => null);
        setMe(userData);
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        window.location.href = "/login";
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </main>
    );
  }
  
  if (!me?.user) return null;

  return (
    <main className="max-w-[1160px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-12 space-y-4 sm:space-y-6 animate-elevate">
      <TraktCard />
      <CatalogSettings />   {/* New card between Trakt and Lists */}
      <div className="rounded-lg bg-surface-1 border border-white/10 shadow-card animate-elevate surface-elevated hover-lift">
        <div className="px-4 sm:px-6 pt-4 sm:pt-6">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="bg-surface-2 border border-white/10 rounded-lg grid grid-cols-4 w-full sm:w-auto sm:grid-cols-none sm:flex glass">
              <TabsTrigger value="lists" className="text-xs sm:text-sm px-2 sm:px-4 mobile-touch transition-all duration-200 hover:bg-white/5">Lists</TabsTrigger>
              <TabsTrigger value="import" className="text-xs sm:text-sm px-2 sm:px-4 mobile-touch transition-all duration-200 hover:bg-white/5">My Trakt</TabsTrigger>
              <TabsTrigger value="addon" className="text-xs sm:text-sm px-2 sm:px-4 mobile-touch transition-all duration-200 hover:bg-white/5">Addon</TabsTrigger>
              <TabsTrigger value="reorder" className="text-xs sm:text-sm px-2 sm:px-4 mobile-touch transition-all duration-200 hover:bg-white/5">Reorder</TabsTrigger>
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
    <AppErrorBoundary>
      <NotifyProvider>
        <div className="min-h-screen bg-gradient-to-br from-surface-0 to-surface-1">
          <TopBar />
          <GlobalBanner />
          <Shell />
        </div>
      </NotifyProvider>
    </AppErrorBoundary>
  );
}
