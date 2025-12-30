import { useState, type ReactNode } from 'react';

interface LayoutProps {
  header: ReactNode;
  toolbar?: ReactNode;
  sidebar: ReactNode;
  feed: ReactNode;
  children: ReactNode;
}

export function Layout({ header, toolbar, sidebar, feed, children }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-city-bg">
      {/* Header - Slim 48px, responsive padding */}
      <header className="h-12 px-2 sm:px-4 bg-city-surface/80 backdrop-blur-md border-b border-city-border/50 flex items-center justify-between shrink-0 relative z-20">
        {header}
      </header>

      {/* Toolbar - Optional, only shown in editor mode */}
      {toolbar && (
        <div className="shrink-0 relative z-10">
          {toolbar}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden relative">
        {/* Canvas area - takes full width */}
        <main className="absolute inset-0">{children}</main>

        {/* Sidebar toggle button - hidden on mobile, visible on tablet+ */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            right: isSidebarOpen ? '280px' : '0px',
            zIndex: 30,
          }}
          className="hidden md:flex w-6 h-16 bg-city-surface/90 backdrop-blur border border-city-border border-r-0 rounded-l-lg items-center justify-center text-city-text-muted hover:text-city-accent hover:bg-city-surface-hover transition-all duration-300"
          title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-300 ${isSidebarOpen ? 'rotate-0' : 'rotate-180'}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Right sidebar - 280px width on desktop, hidden on mobile */}
        <aside
          className={`hidden md:flex absolute top-0 right-0 h-full w-[280px] bg-city-surface/95 backdrop-blur-md border-l border-city-border/50 flex-col z-20 transition-transform duration-300 ${
            isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Agent profile section */}
          <div className="flex-1 border-b border-city-border/30 overflow-y-auto">
            {sidebar}
          </div>

          {/* Event feed section */}
          <div className="h-[45%] overflow-y-auto">{feed}</div>
        </aside>
      </div>
    </div>
  );
}
