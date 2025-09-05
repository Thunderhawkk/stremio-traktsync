import React, { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import WatchlistAnalytics from '../sections/WatchlistAnalytics';

export default function AnalyticsModal() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3 rounded-lg hover:bg-white/10 focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all duration-300 group"
        >
          <svg className="h-4 w-4 mr-1 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
          </svg>
          <span className="text-xs hidden sm:inline">Analytics</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl w-full h-[90vh] max-h-screen overflow-hidden">
        <DialogHeader>
          <DialogTitle>Watchlist Analytics</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          <WatchlistAnalytics />
        </div>
      </DialogContent>
    </Dialog>
  );
}