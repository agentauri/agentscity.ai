import { useAgent, useWorldStore } from '../stores/world';

interface AgentProfileProps {
  agentId: string;
}

interface StatBarProps {
  label: string;
  value: number;
  max?: number;
  color: string;
}

function StatBar({ label, value, max = 100, color }: StatBarProps) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-mono">{Math.round(value)}</span>
      </div>
      <div className="stat-bar">
        <div
          className="stat-fill"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function AgentProfile({ agentId }: AgentProfileProps) {
  const agent = useAgent(agentId);
  const selectAgent = useWorldStore((s) => s.selectAgent);

  if (!agent) {
    return (
      <div className="p-4 text-gray-400 text-sm">Agent not found</div>
    );
  }

  const stateLabel = agent.state.charAt(0).toUpperCase() + agent.state.slice(1);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full border-2 border-white"
            style={{ backgroundColor: agent.color }}
          />
          <div>
            <h3 className="font-bold text-lg">{agent.llmType}</h3>
            <span className="text-xs text-gray-400">ID: {agent.id.slice(0, 8)}...</span>
          </div>
        </div>
        <button
          onClick={() => selectAgent(null)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* State */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">State:</span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            agent.state === 'idle'
              ? 'bg-gray-600'
              : agent.state === 'walking'
                ? 'bg-green-600'
                : agent.state === 'working'
                  ? 'bg-yellow-600'
                  : agent.state === 'sleeping'
                    ? 'bg-purple-600'
                    : 'bg-red-600'
          }`}
        >
          {stateLabel}
        </span>
      </div>

      {/* Position */}
      <div className="text-sm">
        <span className="text-gray-400">Position:</span>{' '}
        <span className="font-mono">({agent.x}, {agent.y})</span>
      </div>

      {/* Stats */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Needs
        </h4>
        <StatBar
          label="Hunger"
          value={agent.hunger}
          color={agent.hunger < 30 ? '#ef4444' : '#10b981'}
        />
        <StatBar
          label="Energy"
          value={agent.energy}
          color={agent.energy < 30 ? '#f59e0b' : '#3b82f6'}
        />
        <StatBar
          label="Health"
          value={agent.health}
          color={agent.health < 30 ? '#ef4444' : '#22c55e'}
        />
      </div>

      {/* Balance */}
      <div className="pt-2 border-t border-city-border">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Balance</span>
          <span className="text-lg font-bold text-yellow-400">
            {agent.balance} CITY
          </span>
        </div>
      </div>
    </div>
  );
}
