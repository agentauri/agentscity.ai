/**
 * MobileNav - Bottom navigation for mobile devices
 *
 * Provides tab-based navigation between:
 * - Canvas (main view)
 * - Agents (summary table)
 * - Events (event feed)
 * - Profile (selected agent)
 */

import type { ReactNode } from 'react';

export type MobileView = 'canvas' | 'agents' | 'events' | 'profile' | 'decisions';

interface MobileNavProps {
  currentView: MobileView;
  onViewChange: (view: MobileView) => void;
  hasSelectedAgent: boolean;
  agentCount: number;
  eventCount: number;
}

interface NavItem {
  id: MobileView;
  label: string;
  icon: ReactNode;
  badge?: number;
}

export function MobileNav({
  currentView,
  onViewChange,
  hasSelectedAgent,
  agentCount,
  eventCount
}: MobileNavProps) {
  const navItems: NavItem[] = [
    {
      id: 'canvas',
      label: 'Map',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      ),
    },
    {
      id: 'agents',
      label: 'Agents',
      badge: agentCount,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      id: 'events',
      label: 'Events',
      badge: eventCount > 0 ? Math.min(eventCount, 99) : undefined,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      id: 'decisions',
      label: 'Decisions',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
  ];

  // Add profile tab if an agent is selected
  if (hasSelectedAgent) {
    navItems.push({
      id: 'profile',
      label: 'Profile',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-city-surface/95 backdrop-blur-md border-t border-city-border/50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full py-2 px-1 relative transition-colors ${
                isActive
                  ? 'text-city-accent'
                  : 'text-city-text-muted hover:text-city-text'
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold bg-city-accent text-white rounded-full">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-1 font-medium ${isActive ? 'text-city-accent' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-city-accent rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
