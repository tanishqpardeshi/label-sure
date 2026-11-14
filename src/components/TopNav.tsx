import React, { useState } from 'react';
import { Menu, ShieldCheck, X } from 'lucide-react';
import { DEMO_SESSIONS } from '../lib/rbac';
import type { UserRole } from '../types/compliance';

export type AppTab = 'workbench' | 'rules' | 'hitl' | 'records' | 'schema';

interface TopNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onNewAnalysis: () => void;
  hitlPendingCount: number;
  activeRole: UserRole;
  onChangeRole: (role: UserRole) => void;
}

const NAV_ITEMS: Array<{ id: AppTab; label: string }> = [
  { id: 'workbench', label: 'Workbench' },
  { id: 'rules', label: 'Rule Repository' },
  { id: 'hitl', label: 'HITL Queue' },
  { id: 'records', label: 'Records & Tests' },
  { id: 'schema', label: 'SRS Schema' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onSelectTab,
  onNewAnalysis,
  hitlPendingCount,
  activeRole,
  onChangeRole,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (tab: AppTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="no-print sticky top-0 z-40 border-b border-[#DDD5CD] bg-[#FAF7F2]/95 backdrop-blur-xs shadow-[0_1px_2px_rgba(46,46,46,0.04)]">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-line brand wordmark */}
        <button
          type="button"
          onClick={() => handleNavClick('workbench')}
          className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight text-[#2E2E2E] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7D4047]"
        >
          <ShieldCheck className="h-5 w-5 text-[#7D4047]" aria-hidden="true" />
          <span>LabelSure</span>
        </button>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const showCount = item.id === 'hitl' && hitlPendingCount > 0 && activeRole !== 'VISITOR';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4047] ${
                  isActive
                    ? 'text-[#7D4047] font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#7D4047]'
                    : 'text-[#2E2E2E]/70 hover:text-[#2E2E2E]'
                }`}
              >
                {item.label}
                {showCount && (
                  <span className="ml-1 font-mono text-xs tabular-nums text-[#7D4047] font-semibold">
                    ({hitlPendingCount})
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Controlled Demo Role Switcher + Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <label htmlFor="demo-role-select" className="sr-only">
              Active Demo Session Role
            </label>
            <select
              id="demo-role-select"
              aria-label="Active Demo Session Role"
              data-testid="role-switcher"
              value={activeRole}
              onChange={(e) => onChangeRole(e.target.value as UserRole)}
              className="h-9 rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 text-xs font-medium text-[#2E2E2E] focus:border-[#7D4047] focus:outline-none"
            >
              {(Object.keys(DEMO_SESSIONS) as UserRole[]).map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {DEMO_SESSIONS[roleKey].displayName}
                </option>
              ))}
            </select>
          </div>

          {activeRole !== 'VISITOR' && (
            <button
              type="button"
              onClick={onNewAnalysis}
              className="hidden sm:inline-flex items-center justify-center rounded-lg bg-[#7D4047] px-4 py-2 text-xs font-semibold text-[#FAF7F2] transition-colors hover:bg-[#663238] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4047]"
            >
              New Analysis
            </button>
          )}

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#DDD5CD] text-[#2E2E2E] hover:bg-[#DDD5CD]/40 lg:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav
          aria-label="Mobile navigation"
          className="border-t border-[#DDD5CD] bg-[#FAF7F2] px-4 py-3 lg:hidden"
        >
          <div className="mb-3">
            <label htmlFor="mobile-role-select" className="block text-[11px] font-medium text-[#2E2E2E]/70">
              Controlled Demo Session Role
            </label>
            <select
              id="mobile-role-select"
              value={activeRole}
              onChange={(e) => onChangeRole(e.target.value as UserRole)}
              className="mt-1 h-10 w-full rounded-lg border border-[#DDD5CD] bg-[#F1ECE6] px-2.5 text-xs font-medium text-[#2E2E2E]"
            >
              {(Object.keys(DEMO_SESSIONS) as UserRole[]).map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {DEMO_SESSIONS[roleKey].displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`flex min-h-[44px] items-center justify-between rounded-lg px-3 text-sm font-medium ${
                    isActive
                      ? 'bg-[#7D4047]/10 text-[#7D4047] font-semibold'
                      : 'text-[#2E2E2E]/80 hover:bg-[#DDD5CD]/40'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === 'hitl' && hitlPendingCount > 0 && activeRole !== 'VISITOR' && (
                    <span className="font-mono text-xs tabular-nums text-[#7D4047]">
                      {hitlPendingCount} pending
                    </span>
                  )}
                </button>
              );
            })}
            {activeRole !== 'VISITOR' && (
              <button
                type="button"
                onClick={() => {
                  onNewAnalysis();
                  setMobileMenuOpen(false);
                }}
                className="mt-2 flex min-h-[44px] items-center justify-center rounded-lg bg-[#7D4047] px-4 text-sm font-semibold text-[#FAF7F2] hover:bg-[#663238]"
              >
                New Analysis
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
};
