import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

// Constants voor D3.js configuratie
const D3_CONFIG = {
  NODE_RADIUS: 20,
  LINK_DISTANCE: 100,
  CHARGE_STRENGTH: -200,
  COLLISION_RADIUS: 30,
  COLORS: ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"],
  // Performance: Beperk het aantal tags dat getoond wordt in tooltips
  MAX_TAGS_IN_TOOLTIP: 10,
  // Performance: Beperk het aantal tags dat getoond wordt als badge
  MAX_TAG_BADGES: 2,
  // Performance: Debounce tijd voor resize
  RESIZE_DEBOUNCE_MS: 200,
  // Performance: Maximaal aantal nodes voor full graph rendering
  MAX_NODES_FOR_FULL_RENDER: 100,
};

// Helper functie om graph data te genereren met O(n²) complexiteit
// Geoptimaliseerd met Maps voor snellere lookups
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

  // O(n) - Genereer links tussen notes die tags delen
  tagToNotes.forEach((noteIds) => {
    const ids = Array.from(noteIds);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const source = ids[i];
        const target = ids[j];
        const key = `${source}<->${target}`;

        const sharedTags = noteMap.get(source)!.tags.filter(
          tag => noteMap.get(target)!.tags.includes(tag)
        );

        if (linkMap.has(key)) {
          linkMap.get(key)!.value += sharedTags.length;
        } else {
          linkMap.set(key, { source, target, value: sharedTags.length });
        }
      }
    }
  });

  return {
    nodes: noteNodes,
    links: Array.from(linkMap.values())
  };
};

type D3Node = SimulationNodeDatum & NoteNode;
type D3Link = SimulationLinkDatum<D3Node> & TagLink;

const TagVisualizer: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<Simulation<D3Node, D3Link> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<NoteNode[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [performanceMetrics, setPerformanceMetrics] = useState({
    graphGenerationTime: 0,
    renderTime: 0,
  });

  // Fetch all notes from Standard Notes
  const fetchNotes = useCallback(async () => {
    const startTime = performance.now();
    try {
      setIsLoading(true);
      setError(null);
      
      const items = await (snApi as any).getItems?.();

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

  // Memoized graph data - alleen herberekenen als notes veranderen
  const fullGraphData = useMemo(() => graphData, [graphData]);

  // Filter nodes and links based on search and selected tags (memoized)
  const filteredGraphData = useMemo(() => {
    let filteredNodes = [...fullGraphData.nodes];
    let filteredLinks = [...fullGraphData.links];

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
  }, [fullGraphData, searchQuery, selectedTags]);

  // D3.js rendering met useRef voor simulation hergebruik
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

    // Create tooltip element once and reuse it
    if (!tooltipRef.current) {
      tooltipRef.current = select("body")
        .append("div")
        .attr("class", "tag-visualizer-tooltip")
        .style("position", "absolute")
        .style("background", "white")
        .style("border", "1px solid #ddd")
        .style("border-radius", "4px")
        .style("padding", "8px")
        .style("pointer-events", "none")
        .style("opacity", 0)
        .style("box-shadow", "0 2px 10px rgba(0, 0, 0, 0.1)")
        .style("z-index", "1000")
        .style("max-width", "300px")
        .node() as HTMLDivElement;
    }

    // Add hover effects
    node
      .on("mouseover", (event: any, d: any) => {
        const tooltip = select(tooltipRef.current);
        tooltip.transition().duration(200).style("opacity", 0.9);
        
        const tagsText = d.tags.length > 0 
          ? "Tags: " + d.tags.slice(0, D3_CONFIG.MAX_TAGS_IN_TOOLTIP).join(", ")
          : "No tags";
        
        tooltip
          .html(`<div><strong>${d.title}</strong></div><div>${tagsText}</div>`)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 28}px`);
      })
      .on("mouseout", () => {
        const tooltip = select(tooltipRef.current);
        tooltip.transition().duration(500).style("opacity", 0);
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
      
      const nodes: D3Node[] = filteredGraphData.nodes.map((n) => ({ ...n }));
      const links: D3Link[] = filteredGraphData.links.map((l) => ({ ...l }));

      // Voor grote datasets: beperk het aantal nodes voor performance
      const shouldRenderFullGraph = nodes.length <= D3_CONFIG.MAX_NODES_FOR_FULL_RENDER;
      
      if (shouldRenderFullGraph) {
        const cleanup = renderGraph(nodes, links, width, height);
        return cleanup;
      } else {
        // Voor grote datasets: toon een bericht
        const svg = select(svgRef.current);
        svg.selectAll("*").remove();
        svg.append("text")
          .attr("x", width / 2)
          .attr("y", height / 2)
          .attr("text-anchor", "middle")
          .attr("fill", "#666")
          .text(`Too many notes (${nodes.length}) to display. Use filters to reduce the number.`);
      }
    } catch (d3Error) {
      console.error("D3.js error:", d3Error);
    }

    // Cleanup tooltip on unmount
    return () => {
      if (tooltipRef.current && tooltipRef.current.parentNode) {
        tooltipRef.current.parentNode.removeChild(tooltipRef.current);
        tooltipRef.current = null;
      }
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
    };
  }, [filteredGraphData, renderGraph]);

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

  const toggleTagSelection = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      return [...prev, tag];
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTags([]);
  }, []);

  const filteredNotes = useMemo(() => {
    return notes.filter((node) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesTags =
        selectedTags.length === 0 || selectedTags.some((tag) => node.tags.includes(tag));
      return matchesSearch && matchesTags;
    });
  }, [notes, searchQuery, selectedTags]);

  return (
    <div className="tag-visualizer">
      <div className="tag-visualizer-header">
        <h2>Tag Relationship Visualizer</h2>
        <div className="tag-visualizer-controls">
          <div className="view-mode-toggle">
            <button
              className={viewMode === "graph" ? "active" : ""}
              onClick={() => setViewMode("graph")}
            >
              Graph View
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
            >
              List View
            </button>
          </div>
        </div>
      </div>

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
            {allTags.map((tag) => (
              <span
                key={tag}
                className={`tag-chip ${selectedTags.includes(tag) ? "selected" : ""}`}
                onClick={() => toggleTagSelection(tag)}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

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
                  <div key={note.id} className="note-card">
                    <div className="note-title">{note.title}</div>
                    <div className="note-tags">
                      {note.tags.map((tag) => (
                        <span
                          key={tag}
                          className="note-tag"
                          onClick={() => toggleTagSelection(tag)}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="note-connections">
                      Connected to
                      {
                        graphData.links.filter((l) => l.source === note.id || l.target === note.id)
                          .length
                      }{" "}
                      notes
                    </div>
                  </div>
                ))}
                {filteredNotes.length === 0 && (
                  <div className="no-results">No notes match your filters</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
    </div>
  );
};

export default TagVisualizer;
