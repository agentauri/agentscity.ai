import { useWorldStore, useSelectedLocation, useAgents } from '../stores/world';

// Location type configurations
const LOCATION_CONFIG: Record<string, { color: string; icon: string; multiplier: number }> = {
  commercial: { color: '#f2cc8f', icon: 'S', multiplier: 1.5 },
  industrial: { color: '#6a8caf', icon: 'I', multiplier: 1.2 },
  civic: { color: '#81b29a', icon: 'C', multiplier: 1.0 },
  residential: { color: '#e07a5f', icon: 'R', multiplier: 0.8 },
};

interface LocationProfileProps {
  locationId: string;
}

export function LocationProfile({ locationId }: LocationProfileProps) {
  const location = useSelectedLocation();
  const agents = useAgents();
  const selectLocation = useWorldStore((s) => s.selectLocation);

  if (!location) {
    return (
      <div className="p-6 text-city-text-muted text-sm text-center">
        <p>Location not found</p>
      </div>
    );
  }

  const config = LOCATION_CONFIG[location.type] || LOCATION_CONFIG.civic;

  // Count agents at this location
  const agentsHere = agents.filter(
    (a) => a.x === location.x && a.y === location.y && a.health > 0
  );

  return (
    <div className="p-4 space-y-5">
      {/* Header with icon */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Location icon */}
          <div className="avatar-ring">
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center text-lg font-bold text-white"
              style={{ backgroundColor: config.color }}
            >
              {config.icon}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-city-text text-base">
              {location.name}
            </h3>
            <span className="text-xs text-city-text-muted capitalize">
              {location.type}
            </span>
          </div>
        </div>
        <button
          onClick={() => selectLocation(null)}
          className="w-6 h-6 rounded flex items-center justify-center text-city-text-muted hover:text-city-accent hover:bg-city-surface-hover transition-colors"
          title="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Position */}
      <div className="flex items-center gap-3">
        <span
          className="px-2.5 py-1 rounded-full text-xs font-medium border border-current/20"
          style={{ backgroundColor: `${config.color}20`, color: config.color }}
        >
          {location.type.charAt(0).toUpperCase() + location.type.slice(1)}
        </span>
        <span className="text-xs text-city-text-muted">
          at{' '}
          <span className="font-mono text-city-text">
            ({location.x}, {location.y})
          </span>
        </span>
      </div>

      {/* Stats Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-medium text-city-text-muted uppercase tracking-wider">
          Statistics
        </h4>

        {/* Work Multiplier */}
        <div className="flex items-center justify-between py-2 border-b border-city-border/30">
          <div className="flex items-center gap-2 text-city-text-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span className="text-xs">Work Multiplier</span>
          </div>
          <span className="text-sm font-bold" style={{ color: config.color }}>
            {config.multiplier}x
          </span>
        </div>

        {/* Agents Present */}
        <div className="flex items-center justify-between py-2 border-b border-city-border/30">
          <div className="flex items-center gap-2 text-city-text-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="text-xs">Agents Present</span>
          </div>
          <span className="text-sm font-bold text-city-text">
            {agentsHere.length}
          </span>
        </div>
      </div>

      {/* Agents at location */}
      {agentsHere.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-city-text-muted uppercase tracking-wider">
            Agents Here
          </h4>
          <div className="space-y-2">
            {agentsHere.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 p-2 rounded bg-city-surface-hover/50"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.llmType.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-city-text capitalize">
                  {agent.llmType}
                </span>
                <span className="text-xs text-city-text-muted ml-auto">
                  {agent.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Location Type Info */}
      <div className="pt-4 border-t border-city-border/30">
        <div className="text-xs text-city-text-muted">
          {location.type === 'commercial' && (
            <p>Agents can buy items here. Best work pay (1.5x).</p>
          )}
          {location.type === 'industrial' && (
            <p>Factory work available. Good pay (1.2x).</p>
          )}
          {location.type === 'civic' && (
            <p>Public services. Standard work pay (1.0x).</p>
          )}
          {location.type === 'residential' && (
            <p>Housing area. Lower work pay (0.8x).</p>
          )}
        </div>
      </div>
    </div>
  );
}
