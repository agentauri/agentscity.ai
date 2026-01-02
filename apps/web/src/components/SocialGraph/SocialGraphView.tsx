/**
 * Social Graph View
 *
 * D3.js force-directed graph visualization of agent relationships.
 * Shows:
 * - Agents as nodes (colored by LLM type)
 * - Edges for interactions (trade, harm, gossip)
 * - Edge thickness based on interaction frequency
 * - Interactive: click nodes to select agent
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { useAgents, useEvents, useWorldStore } from '../../stores/world';
import {
  useSocialGraphSettings,
  useVisualizationStore,
  type SocialEdgeType,
} from '../../stores/visualization';

// Edge type colors
const EDGE_COLORS: Record<SocialEdgeType, string> = {
  trade: '#10b981',    // Green
  harm: '#ef4444',     // Red
  gossip: '#8b5cf6',   // Purple
  trust: '#06b6d4',    // Cyan
  distrust: '#f97316', // Orange
};

// Node interface for D3
interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  llmType: string;
  color: string;
  health: number;
  state: string;
}

// Link interface for D3
interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  type: SocialEdgeType;
  weight: number;
}

export function SocialGraphView() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const agents = useAgents();
  const events = useEvents();
  const { visible, edgeTypes } = useSocialGraphSettings();
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const toggleSocialGraph = useVisualizationStore((s) => s.toggleSocialGraph);

  // Build graph data from events
  const graphData = useMemo(() => {
    // Create nodes from alive agents
    const nodes: GraphNode[] = agents
      .filter((a) => a.state !== 'dead')
      .map((a) => ({
        id: a.id,
        llmType: a.llmType,
        color: a.color,
        health: a.health,
        state: a.state,
      }));

    // Create edges from events
    const edgeMap = new Map<string, GraphLink>();

    // Map event types to edge types
    const eventToEdgeType: Record<string, SocialEdgeType> = {
      agent_trade: 'trade',
      agent_traded: 'trade',
      agent_harm: 'harm',
      agent_harmed: 'harm',
      agent_steal: 'harm',
      agent_stole: 'harm',
      agent_share_info: 'gossip',
      agent_deceive: 'distrust',
      agent_deceived: 'distrust',
    };

    // Process recent events to build edges
    for (const event of events.slice(0, 100)) {
      const edgeType = eventToEdgeType[event.type];
      if (!edgeType) continue;

      const sourceId = event.agentId;
      let targetId = event.payload?.targetId as string | undefined;

      // For some events, target is in different fields
      if (!targetId) {
        targetId = event.payload?.partnerId as string | undefined;
        if (!targetId) continue;
      }

      // Skip if edge type is filtered out
      if (!edgeTypes.has(edgeType)) continue;

      // Create edge key (bidirectional for some types)
      const key =
        edgeType === 'trade' || edgeType === 'gossip'
          ? [sourceId, targetId].sort().join('-') + `-${edgeType}`
          : `${sourceId}-${targetId}-${edgeType}`;

      const existing = edgeMap.get(key);
      if (existing) {
        existing.weight += 1;
      } else {
        edgeMap.set(key, {
          source: sourceId!,
          target: targetId,
          type: edgeType,
          weight: 1,
        });
      }
    }

    // Filter edges to only include nodes that exist
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = Array.from(edgeMap.values()).filter(
      (l) =>
        nodeIds.has(l.source as string) && nodeIds.has(l.target as string)
    );

    return { nodes, links };
  }, [agents, events, edgeTypes]);

  // Render graph with D3
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !visible) return;

    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Clear previous
    svg.selectAll('*').remove();

    // Set up SVG
    svg.attr('width', width).attr('height', height);

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create main group for zoom/pan
    const g = svg.append('g');

    // Create force simulation
    const simulation = d3
      .forceSimulation<GraphNode>(graphData.nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(graphData.links)
          .id((d) => d.id)
          .distance(80)
          .strength((d) => Math.min(0.5, d.weight * 0.1))
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Draw links
    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(graphData.links)
      .enter()
      .append('line')
      .attr('stroke', (d) => EDGE_COLORS[d.type])
      .attr('stroke-width', (d) => Math.min(5, 1 + d.weight * 0.5))
      .attr('stroke-opacity', 0.6);

    // Draw nodes
    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(graphData.nodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (_event, d) => {
        selectAgent(d.id === selectedAgentId ? null : d.id);
      });

    // Node circles
    node
      .append('circle')
      .attr('r', 15)
      .attr('fill', (d) => d.color)
      .attr('stroke', (d) => (d.id === selectedAgentId ? '#ffffff' : '#333'))
      .attr('stroke-width', (d) => (d.id === selectedAgentId ? 3 : 1.5));

    // Node labels
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('fill', '#ffffff')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .text((d) => d.llmType.charAt(0).toUpperCase());

    // Health indicator (small bar below node)
    node
      .append('rect')
      .attr('x', -12)
      .attr('y', 18)
      .attr('width', 24)
      .attr('height', 3)
      .attr('fill', '#333')
      .attr('rx', 1);

    node
      .append('rect')
      .attr('x', -12)
      .attr('y', 18)
      .attr('width', (d) => (d.health / 100) * 24)
      .attr('height', 3)
      .attr('fill', (d) => (d.health > 50 ? '#22c55e' : d.health > 20 ? '#f59e0b' : '#ef4444'))
      .attr('rx', 1);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [graphData, visible, selectedAgentId, selectAgent]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-city-bg/95 backdrop-blur-sm z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-city-border">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-city-text">Social Graph</h2>
          <span className="text-xs text-city-text-muted">
            {graphData.nodes.length} agents, {graphData.links.length} connections
          </span>
        </div>
        <button
          onClick={toggleSocialGraph}
          className="p-2 rounded-lg bg-city-surface border border-city-border hover:bg-city-border text-city-text transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-city-border/50 bg-city-surface/50">
        <span className="text-xs text-city-text-muted">Edge Types:</span>
        <EdgeTypeToggle type="trade" label="Trade" />
        <EdgeTypeToggle type="harm" label="Harm" />
        <EdgeTypeToggle type="gossip" label="Gossip" />
        <EdgeTypeToggle type="distrust" label="Deceive" />
      </div>

      {/* Graph */}
      <div className="flex-1 relative">
        <svg ref={svgRef} className="w-full h-full" />

        {/* Instructions */}
        <div className="absolute bottom-4 left-4 text-xs text-city-text-muted bg-city-surface/80 px-3 py-2 rounded-lg">
          Drag nodes to reposition • Scroll to zoom • Click node to select
        </div>
      </div>
    </div>
  );
}

/**
 * Edge type toggle button
 */
function EdgeTypeToggle({ type, label }: { type: SocialEdgeType; label: string }) {
  const socialGraphEdgeTypes = useVisualizationStore((s) => s.socialGraphEdgeTypes);
  const toggleSocialEdgeType = useVisualizationStore((s) => s.toggleSocialEdgeType);
  const isActive = socialGraphEdgeTypes.has(type);
  const color = EDGE_COLORS[type];

  return (
    <button
      onClick={() => toggleSocialEdgeType(type)}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all ${
        isActive
          ? 'text-white'
          : 'text-city-text-muted bg-city-bg/50 hover:bg-city-border'
      }`}
      style={{
        backgroundColor: isActive ? color : undefined,
        opacity: isActive ? 1 : 0.5,
      }}
    >
      <div
        className="w-3 h-0.5 rounded"
        style={{ backgroundColor: isActive ? '#fff' : color }}
      />
      {label}
    </button>
  );
}

/**
 * Social Graph Button - Opens the graph view
 */
export function SocialGraphButton() {
  const toggleSocialGraph = useVisualizationStore((s) => s.toggleSocialGraph);

  return (
    <button
      onClick={toggleSocialGraph}
      className="p-2 rounded-lg bg-city-surface border border-city-border hover:bg-city-border text-city-text transition-colors"
      title="Social Graph"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="5" r="3" />
        <circle cx="5" cy="19" r="3" />
        <circle cx="19" cy="19" r="3" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m-5.5 0l4-6m7 6l-4-6" />
      </svg>
    </button>
  );
}
