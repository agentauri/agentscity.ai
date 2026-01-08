/**
 * FallbackModeInfo Component
 *
 * Warning banner shown when no LLM API keys are configured.
 * Explains what fallback mode means for the simulation.
 */

interface FallbackModeInfoProps {
  isTestMode?: boolean;
}

export function FallbackModeInfo({ isTestMode }: FallbackModeInfoProps) {
  if (isTestMode) {
    return (
      <div className="mx-4 my-3 p-3 rounded-lg bg-blue-900/30 border border-blue-700/50">
        <div className="flex items-start gap-2">
          <span className="text-blue-400 text-lg" aria-hidden="true">
            🧪
          </span>
          <div className="flex-1">
            <h3 className="font-medium text-blue-200 text-sm">Test Mode Active</h3>
            <p className="text-xs text-blue-300/80 mt-1">
              LLM calls are disabled. Agents use rule-based fallback decisions.
              No API costs while testing.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 my-3 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700/50">
      <div className="flex items-start gap-2">
        <span className="text-yellow-400 text-lg" aria-hidden="true">
          ⚠️
        </span>
        <div className="flex-1">
          <h3 className="font-medium text-yellow-200 text-sm">Fallback Mode Active</h3>
          <p className="text-xs text-yellow-300/80 mt-1">
            No LLM API keys configured. Agents use simple rule-based decisions:
          </p>
          <ul className="text-xs text-yellow-300/70 mt-2 space-y-0.5 list-disc list-inside">
            <li>Eat when hungry</li>
            <li>Sleep when tired</li>
            <li>Work when poor</li>
            <li>Explore otherwise</li>
          </ul>
          <p className="text-xs text-yellow-300/60 mt-2">
            Add an API key below to enable intelligent agent behavior.
          </p>
        </div>
      </div>
    </div>
  );
}

export default FallbackModeInfo;
