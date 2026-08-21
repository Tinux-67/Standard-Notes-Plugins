import React, { useState, useEffect, useRef, useCallback, useMemo, memo, Component, createPortal } from "react";
import {
  select,
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  drag,
  SimulationNodeDatum,
  SimulationLinkDatum,
  Simulation,
} from "d3";
import snApi from "sn-extension-api";

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

interface NoteNode {
  id: string;
  title: string;
  tags: string[];
  x?: number;
  y?: number;
}

interface TagLink {
  source: string;
  target: string;
  value: number;
}

interface GraphData {
  nodes: NoteNode[];
  links: TagLink[];
}

type D3Node = SimulationNodeDatum & NoteNode;
type D3Link = SimulationLinkDatum<D3Node> & TagLink;

// ============================================================================
// CONSTANTS
// ============================================================================

const D3_CONFIG = {
  NODE_RADIUS: 20,
  LINK_DISTANCE: 100,
  CHARGE_STRENGTH: -200,
  COLLISION_RADIUS: 30,
  COLORS: ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"],
  MAX_TAGS_IN_TOOLTIP: 10,
  MAX_TAG_BADGES: 2,
  RESIZE_DEBOUNCE_MS: 200,
  MAX_NODES_FOR_FULL_RENDER: 100,
  MAX_CONNECTIONS_PER_NODE: 20,
  MAX_NOTES_TO_SAMPLE: 300,
  NOISE_TAG_THRESHOLD: 0.3, // Prune tags that appear in more than 30% of notes
} as const;

// ============================================================================
// ERROR BOUNDARY
// ============================================================================

class VisualizerErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("TagVisualizer Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback">
          <h3>Something went wrong with the visualization</h3>
          <p>The graph could not be rendered. Please try refreshing or adjusting your filters.</p>
          <button onClick={() => this.setState({ hasError: false })}>Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// MEMOIZED COMPONENTS
// ============================================================================

// Memoized TagChip component - voorkomt onnodige re-renders
interface TagChipProps {
  tag: string;
  isSelected: boolean;
  onClick: (tag: string) => void;
}

const TagChip = memo(({ tag, isSelected, onClick }: TagChipProps) => {
  return (
    <span
      className={`tag-chip ${isSelected ? "selected" : ""}`}
      onClick={() => onClick(tag)}
    >
      {tag}
    </span>
  );
});

TagChip.displayName = 'TagChip';

// Memoized NoteTag component - voorkomt onnodige re-renders
interface NoteTagProps {
  tag: string;
  onClick: (tag: string) => void;
}

const NoteTag = memo(({ tag, onClick }: NoteTagProps) => {
  return (
    <span
      className="note-tag"
      onClick={() => onClick(tag)}
    >
      {tag}
    </span>
  );
});

NoteTag.displayName = 'NoteTag';

// Memoized NoteCard component - voorkomt onnodige re-renders
interface NoteCardProps {
  note: NoteNode;
  graphData: GraphData;
  onTagClick: (tag: string) => void;
}

const NoteCard = memo(({ note, graphData, onTagClick }: NoteCardProps) => {
  // Memoize connection count calculation
  const connectionCount = useMemo(() => {
    return graphData.links.filter((l) => l.source === note.id || l.target === note.id).length;
  }, [note.id, graphData.links]);

  return (
    <div key={note.id} className="note-card">
      <div className="note-title">{note.title}</div>
      <div className="note-tags">
        {note.tags.map((tag) => (
          <NoteTag key={tag} tag={tag} onClick={onTagClick} />
        ))}
      </div>
      <div className="note-connections">
        Connected to {connectionCount} notes
      </div>
    </div>
  );
});

NoteCard.displayName = 'NoteCard';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Pure function - geen side effects, altijd zelfde output voor zelfde input
const createGraphData = (noteNodes: NoteNode[]): GraphData => {
  const tagToNotes = new Map<string, Set<string>>();
  const noteMap = new Map<string, NoteNode>();
  const linkMap = new Map<string, { source: string; target: string; value: number }>();

  // O(n) - Bouw maps voor snelle lookups
  noteNodes.forEach((node) => {
    noteMap.set(node.id, node);
    node.tags.forEach((tag) => {
      if (!tagToNotes.has(tag)) tagToNotes.set(tag, new Set());
      tagToNotes.get(tag)!.add(node.id);
    });
  });

  // Edge Pruning: Identify "noise" tags (too common to be meaningful)
  const totalNotes = noteNodes.length;
  const noiseTags = new Set<string>();
  tagToNotes.forEach((noteIds, tag) => {
    if (noteIds.size / totalNotes > D3_CONFIG.NOISE_TAG_THRESHOLD) {
      noiseTags.add(tag);
    }
  });

  // O(n) - Genereer links tussen notes die tags delen
  tagToNotes.forEach((noteIds, tag) => {
    if (noiseTags.has(tag)) return; // Prune links from noise tags

    const ids = Array.from(noteIds);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const source = ids[i];
        const target = ids[j];
        const key = source < target ? `${source}<->${target}` : `${target}<->${source}`;

        // Optimize: Instead of filtering all tags, just increment based on current tag
        // We will add more value later if they share more tags
        const currentVal = linkMap.get(key)?.value || 0;
        linkMap.set(key, { source: source < target ? source : target, target: source < target ? target : source, value: currentVal + 1 });
      }
    }
  });

  // Connection Pruning: Limit number of connections per node to avoid "hairball" effect
  const nodeConnections = new Map<string, number>();
  const finalLinks: TagLink[] = [];

  // Sort links by value (strongest connections first)
  const sortedLinks = Array.from(linkMap.values()).sort((a, b) => b.value - a.value);

  for (const link of sortedLinks) {
    const sCount = nodeConnections.get(link.source) || 0;
    const tCount = nodeConnections.get(link.target) || 0;

    if (sCount < D3_CONFIG.MAX_CONNECTIONS_PER_NODE && tCount < D3_CONFIG.MAX_CONNECTIONS_PER_NODE) {
      finalLinks.push(link);
      nodeConnections.set(link.source, sCount + 1);
      nodeConnections.set(link.target, tCount + 1);
    }
  }

  return {
    nodes: noteNodes,
    links: finalLinks
  };
};

// Memoized filter function voor notes
const filterNotes = (
  notes: NoteNode[],
  searchQuery: string,
  selectedTags: string[]
): NoteNode[] => {
  return notes.filter((node) => {
    const matchesSearch =
      searchQuery.trim() === "" ||
      node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesTags =
      selectedTags.length === 0 || selectedTags.some((tag) => node.tags.includes(tag));
    
    return matchesSearch && matchesTags;
  });
};

// Memoized filter function voor graph data
const filterGraphData = (
  graphData: GraphData,
  searchQuery: string,
  selectedTags: string[]
): GraphData => {
  let filteredNodes = [...graphData.nodes];
  let filteredLinks = [...graphData.links];

  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filteredNodes = filteredNodes.filter(
      (node) =>
        node.title.toLowerCase().includes(query) ||
        node.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  // Apply tag filter
  if (selectedTags.length > 0) {
    const selectedTagsSet = new Set(selectedTags);
    filteredNodes = filteredNodes.filter((node) =>
      node.tags.some((tag) => selectedTagsSet.has(tag))
    );
  }

  // Filter links to only include those between filtered nodes
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  filteredLinks = filteredLinks.filter((link) => {
    return filteredNodeIds.has(link.source) && filteredNodeIds.has(link.target);
  });

  return { nodes: filteredNodes, links: filteredLinks };
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const TagVisualizer: React.FC = () => {
  // Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<Simulation<D3Node, D3Link> | null>(null);

  // State
  const [notes, setNotes] = useState<NoteNode[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [tooltipData, setTooltipData] = useState<{
    title: string;
    tags: string[];
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    graphGenerationTime: 0,
    renderTime: 0,
  });

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  // Memoized fetch function
  const fetchNotes = useCallback(async () => {
    const startTime = performance.now();
    try {
      setIsLoading(true);
      setError(null);
      
      const items = await snApi.getItems?.();

      if (!items) {
        throw new Error("Standard Notes API not available");
      }

      if (!Array.isArray(items)) {
        throw new Error("Invalid response from Standard Notes");
      }

      const noteNodes: NoteNode[] = [];
      const tagSet = new Set<string>();

      items.forEach((item: any) => {
        if (item.content_type === "Note") {
          const title = item.content?.title || "Untitled";
          const tags = item.content?.tags || [];

          noteNodes.push({
            id: item.uuid,
            title,
            tags,
          });

          tags.forEach((tag: string) => {
            tagSet.add(tag);
          });
        }
      });

      setNotes(noteNodes);
      setAllTags(Array.from(tagSet).sort());

      // Create graph data met geoptimaliseerde functie
      const graphStart = performance.now();
      const newGraphData = createGraphData(noteNodes);
      const graphTime = performance.now() - graphStart;

      setGraphData(newGraphData);
      setPerformanceMetrics({
        graphGenerationTime: graphTime,
        renderTime: performance.now() - startTime,
      });

      setIsLoading(false);
    } catch (err) {
      console.error("Error fetching notes:", err);
      setError(err instanceof Error ? err.message : "Failed to load notes");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // ==========================================================================
  // MEMOIZED DERIVED DATA
  // ==========================================================================

  // Memoized graph data - alleen herberekenen als notes veranderen
  const fullGraphData = useMemo(() => graphData, [graphData]);

  // Memoized filtered graph data
  const filteredGraphData = useMemo(() => {
    return filterGraphData(fullGraphData, searchQuery, selectedTags);
  }, [fullGraphData, searchQuery, selectedTags]);

  // Memoized filtered notes voor list view
  const filteredNotes = useMemo(() => {
    return filterNotes(notes, searchQuery, selectedTags);
  }, [notes, searchQuery, selectedTags]);

  // Memoized allTags voor snellere rendering
  const allTagsMemoized = useMemo(() => allTags, [allTags]);

  // ==========================================================================
  // D3.JS RENDERING
  // ==========================================================================

  // Render graph function - memoized met useCallback
  const renderGraph = useCallback((
    nodes: D3Node[],
    links: D3Link[],
    width: number,
    height: number
  ) => {
    if (!svgRef.current) return null;

    const svg = select(svgRef.current);
    
    // Stop bestaande simulation als die bestaat
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    // Clear SVG
    svg.selectAll("*").remove();

    if (nodes.length === 0) return null;

    // Create a force simulation
    const simulation = forceSimulation(nodes as any)
      .force(
        "link",
        forceLink(links as any)
          .id((d: any) => d.id)
          .distance(D3_CONFIG.LINK_DISTANCE)
      )
      .force("charge", forceManyBody().strength(D3_CONFIG.CHARGE_STRENGTH))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collision", forceCollide().radius(D3_CONFIG.COLLISION_RADIUS));

    // Store simulation reference for cleanup
    simulationRef.current = simulation;

    // Create links group
    const linkGroup = svg.append("g").attr("class", "links");
    const link = linkGroup
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d: any) => Math.min(Math.sqrt(d.value), 5));

    // Create nodes group
    const nodeGroup = svg.append("g").attr("class", "nodes");
    const node = nodeGroup
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .call(
        drag().on("start", (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        }).on("drag", (event: any, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        }).on("end", (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    // Add circles for nodes
    node
      .append("circle")
      .attr("r", D3_CONFIG.NODE_RADIUS)
      .attr("fill", (d: any) => {
        if (d.tags.length === 0) return "#ccc";
        return D3_CONFIG.COLORS[d.tags.length % D3_CONFIG.COLORS.length];
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // Add text labels
    node
      .append("text")
      .text((d: any) => (d.title.length > 12 ? d.title.substring(0, 10) + "..." : d.title))
      .attr("text-anchor", "middle")
      .attr("dy", 40)
      .attr("font-size", 10)
      .attr("fill", "#333");

    // Add tag badges (max 2 voor performance)
    node
      .append("g")
      .attr("transform", "translate(0, -30)")
      .selectAll("text")
      .data((d: any) => d.tags.slice(0, D3_CONFIG.MAX_TAG_BADGES))
      .enter()
      .append("text")
      .text((tag: string) => (tag.length > 8 ? tag.substring(0, 6) + "..." : tag))
      .attr("text-anchor", "middle")
      .attr("dy", (_: any, i: number) => i * -12)
      .attr("font-size", 8)
      .attr("fill", "#666")
      .attr("class", "tag-label");

    // Add hover effects
    node
      .on("mouseover", (event: any, d: any) => {
        setTooltipData({
          title: d.title,
          tags: d.tags,
          x: event.pageX + 10,
          y: event.pageY - 28,
          visible: true,
        });
      })
      .on("mousemove", (event: any, d: any) => {
        setTooltipData((prev) => prev ? {
          ...prev,
          x: event.pageX + 10,
          y: event.pageY - 28,
        } : null);
      })
      .on("mouseout", () => {
        setTooltipData(null);
      });

    // Update positions on each tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => (d.source as any).x)
        .attr("y1", (d: any) => (d.source as any).y)
        .attr("x2", (d: any) => (d.target as any).x)
        .attr("y2", (d: any) => (d.target as any).y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Return cleanup function
    return () => {
      simulation.stop();
    };
  }, []);

  // Main rendering effect - alleen uitvoeren als filtered data verandert
  useEffect(() => {
    if (!svgRef.current || filteredGraphData.nodes.length === 0) return;

    try {
      const width = svgRef.current.clientWidth || 800;
      const height = svgRef.current.clientHeight || 600;
      
      // Implementation of Sophisticated Sampling Strategy
      let nodes: D3Node[] = filteredGraphData.nodes.map((n) => ({ ...n }));
      let links: D3Link[] = filteredGraphData.links.map((l) => ({ ...l }));

      if (nodes.length > D3_CONFIG.MAX_NOTES_TO_SAMPLE) {
        // Strategy: Priority Sampling
        // 1. Keep nodes with the most connections (central hubs)
        // 2. Fill the rest with random samples to maintain representativeness
        
        const connectionCounts = new Map<string, number>();
        links.forEach(l => {
          const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
          const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
          connectionCounts.set(s, (connectionCounts.get(s) || 0) + 1);
          connectionCounts.set(t, (connectionCounts.get(t) || 0) + 1);
        });

        const sortedNodes = [...nodes].sort((a, b) => 
          (connectionCounts.get(b.id) || 0) - (connectionCounts.get(a.id) || 0)
        );

        const hubs = sortedNodes.slice(0, Math.floor(D3_CONFIG.MAX_NOTES_TO_SAMPLE * 0.6));
        const remaining = sortedNodes.slice(Math.floor(D3_CONFIG.MAX_NOTES_TO_SAMPLE * 0.6));
        const samples = remaining.sort(() => 0.5 - Math.random()).slice(0, D3_CONFIG.MAX_NOTES_TO_SAMPLE - hubs.length);
        
        const sampledNodeIds = new Set([...hubs, ...samples].map(n => n.id));
        nodes = nodes.filter(n => sampledNodeIds.has(n.id));
        links = links.filter(l => {
          const s = typeof l.source === 'string' ? l.source : (l.source as any).id;
          const t = typeof l.target === 'string' ? l.target : (l.target as any).id;
          return sampledNodeIds.has(s) && sampledNodeIds.has(t);
        });
      }

      const cleanup = renderGraph(nodes, links, width, height);
      return cleanup;
    } catch (d3Error) {
      console.error("D3.js error:", d3Error);
    }

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
    };
  }, [filteredGraphData, renderGraph]);

  // ==========================================================================
  // EVENT HANDLERS (allemaal memoized met useCallback)
  // ==========================================================================

  // Handle window resize met debounce
  useEffect(() => {
    let resizeTimeout: number | null = null;
    
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = window.setTimeout(() => {
        // Force re-render door state te updaten
        if (svgRef.current) {
          const svg = select(svgRef.current);
          svg.selectAll("*").remove();
        }
      }, D3_CONFIG.RESIZE_DEBOUNCE_MS);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Memoized tag selection handler
  const toggleTagSelection = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      return [...prev, tag];
    });
  }, []);

  // Memoized clear filters handler
  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTags([]);
  }, []);

  // Memoized view mode toggle handlers
  const setGraphView = useCallback(() => setViewMode("graph"), []);
  const setListView = useCallback(() => setViewMode("list"), []);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="tag-visualizer">
      {/* Header */}
      <div className="tag-visualizer-header">
        <h2>Tag Relationship Visualizer</h2>
        <div className="tag-visualizer-controls">
          <div className="view-mode-toggle">
            <button
              className={viewMode === "graph" ? "active" : ""}
              onClick={setGraphView}
            >
              Graph View
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              onClick={setListView}
            >
              List View
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="tag-visualizer-filters">
        <div className="search-filter">
          <input
            type="text"
            placeholder="Search notes or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="tag-filter">
          <div className="tag-filter-header">
            <span>Filter by Tags:</span>
            {selectedTags.length > 0 && (
              <button className="clear-filters" onClick={clearFilters}>
                Clear All
              </button>
            )}
          </div>
          <div className="tag-chips">
            {allTagsMemoized.map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                isSelected={selectedTags.includes(tag)}
                onClick={toggleTagSelection}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="loading">Loading notes...</div>
      ) : error ? (
        <div className="error">Error: {error}</div>
      ) : (
        <div className="tag-visualizer-content">
          {viewMode === "graph" ? (
            <div className="graph-container">
              <svg ref={svgRef} width="100%" height="600" className="tag-visualizer-svg" />
              {filteredNotes.length === 0 && (
                <div className="no-results">No notes match your filters</div>
              )}
            </div>
          ) : (
            <div className="list-container">
              <div className="notes-list">
                {filteredNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    graphData={graphData}
                    onTagClick={toggleTagSelection}
                  />
                ))}
                {filteredNotes.length === 0 && (
                  <div className="no-results">No notes match your filters</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="tag-visualizer-footer">
        <div className="stats">
          <span>Total Notes: {notes.length}</span>
          <span>Total Tags: {allTags.length}</span>
          <span>Connections: {graphData.links.length}</span>
          {performanceMetrics.graphGenerationTime > 0 && (
            <span>Graph generated in: {performanceMetrics.graphGenerationTime.toFixed(2)}ms</span>
          )}
        </div>
      </div>

      {/* Tooltip Portal */}
      {tooltipData && createPortal(
        <div 
          className="tag-visualizer-tooltip" 
          style={{ 
            left: tooltipData.x, 
            top: tooltipData.y,
            position: 'absolute',
            pointerEvents: 'none'
          }}
        >
          <div><strong>{tooltipData.title}</strong></div>
          <div>
            {tooltipData.tags.length > 0 
              ? "Tags: " + tooltipData.tags.slice(0, D3_CONFIG.MAX_TAGS_IN_TOOLTIP).join(", ")
              : "No tags"}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default TagVisualizer;
