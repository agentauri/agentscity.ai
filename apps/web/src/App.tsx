import { useEffect } from 'react';
import { useSSE } from './hooks/useSSE';
import { useWorldStore } from './stores/world';
import { Layout } from './components/Layout';
import { IsometricCanvas } from './components/Canvas/IsometricCanvas';
import { EventFeed } from './components/EventFeed';
import { AgentProfile } from './components/AgentProfile';
import { WorldStats } from './components/WorldStats';

export default function App() {
  const { status, connect, disconnect } = useSSE();
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <Layout
      header={<WorldStats connectionStatus={status} />}
      sidebar={
        selectedAgentId ? (
          <AgentProfile agentId={selectedAgentId} />
        ) : (
          <div className="p-4 text-gray-400 text-sm">
            Click an agent to view details
          </div>
        )
      }
      feed={<EventFeed />}
    >
      <IsometricCanvas />
    </Layout>
  );
}
