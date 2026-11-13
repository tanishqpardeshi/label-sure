import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

export type AppTab = 'scanner' | 'rules' | 'hitl' | 'analytics' | 'code';

interface TopNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onNewInspection: () => void;
  hitlPendingCount: number;
}

const NAV_ITEMS: Array<{ id: AppTab; label: string }> = [
  { id: 'scanner', label: 'Scanner' },
  { id: 'rules', label: 'Rule Engine' },
  { id: 'hitl', label: 'HITL Queue' },
  { id: 'analytics', label: 'Analytics & API' },
  { id: 'code', label: 'Code Exporter' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onSelectTab,
  onNewInspection,
  hitlPendingCount,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (tab: AppTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-line brand wordmark */}
        <button
          type="button"
          onClick={() => handleNavClick('scanner')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
        >
          LabelSure
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const suffix =
              item.id === 'hitl' && hitlPendingCount > 0 ? ` (${hitlPendingCount})` : '';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                  isActive
                    ? 'text-blue-900 font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-blue-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {suffix && (
                  <span className="ml-1 font-mono text-xs tabular-nums text-amber-700">
                    {suffix}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onNewInspection}
            className="hidden sm:inline-flex items-center justify-center rounded-md bg-blue-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            New Inspection
          </button>

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 md:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav
          aria-label="Mobile navigation"
          className="border-t border-slate-200 bg-white px-4 py-3 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`flex min-h-[44px] items-center justify-between rounded-md px-3 text-sm font-medium ${
                    isActive
                      ? 'bg-blue-50 text-blue-900 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === 'hitl' && hitlPendingCount > 0 && (
                    <span className="font-mono text-xs tabular-nums text-amber-700">
                      {hitlPendingCount} pending
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                onNewInspection();
                setMobileMenuOpen(false);
              }}
              className="mt-2 flex min-h-[44px] items-center justify-center rounded-md bg-blue-900 px-4 text-sm font-semibold text-white hover:bg-blue-800"
            >
              New Inspection
            </button>
          </div>
        </nav>
      )}
    </header>
  );
};
