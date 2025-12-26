import { useWorldStore, useAliveAgents } from '../stores/world';
import type { ConnectionStatus } from '../hooks/useSSE';

interface WorldStatsProps {
  connectionStatus: ConnectionStatus;
}

export function WorldStats({ connectionStatus }: WorldStatsProps) {
  const tick = useWorldStore((s) => s.tick);
  const aliveAgents = useAliveAgents();

  const statusClass =
    connectionStatus === 'connected'
      ? 'status-connected'
      : connectionStatus === 'connecting'
        ? 'bg-yellow-500 text-black'
        : 'status-disconnected';

  const statusText =
    connectionStatus === 'connected'
      ? 'Connected'
      : connectionStatus === 'connecting'
        ? 'Connecting...'
        : 'Disconnected';

  return (
    <>
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">🏙️ Agents City</h1>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>
            Tick: <span className="text-white font-mono">{tick}</span>
          </span>
          <span className="text-city-border">|</span>
          <span>
            Agents: <span className="text-white font-mono">{aliveAgents.length}</span>
          </span>
        </div>
      </div>

      <span className={`status-badge ${statusClass}`}>{statusText}</span>
    </>
  );
}
