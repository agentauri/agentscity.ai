import type { ReactNode } from 'react';

interface LayoutProps {
  header: ReactNode;
  sidebar: ReactNode;
  feed: ReactNode;
  children: ReactNode;
}

export function Layout({ header, sidebar, feed, children }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 px-4 bg-city-surface border-b border-city-border flex items-center justify-between shrink-0">
        {header}
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <main className="flex-1 relative">{children}</main>

        {/* Right sidebar */}
        <aside className="w-80 bg-city-surface border-l border-city-border flex flex-col shrink-0">
          {/* Agent profile section */}
          <div className="h-1/2 border-b border-city-border overflow-y-auto">
            {sidebar}
          </div>

          {/* Event feed section */}
          <div className="h-1/2 overflow-y-auto">{feed}</div>
        </aside>
      </div>
    </div>
  );
}
