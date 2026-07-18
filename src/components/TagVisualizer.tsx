import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import snApi from "sn-extension-api";

interface NoteTag {
  title: string;
  notes: string[];
}

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

const TagVisualizer: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [notes, setNotes] = useState<NoteNode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');

  // Fetch all notes from Standard Notes
  const fetchNotes = useCallback(async () => {
    try {
      setIsLoading(true);
      const items = await snApi.getItems();
      
      const noteNodes: NoteNode[] = [];
      const tagSet = new Set<string>();
      const tagToNotes: Record<string, string[]> = {};

      items.forEach(item => {
        if (item.content_type === 'Note') {
          const title = item.content?.title || 'Untitled';
          const tags = item.content?.tags || [];
          
          noteNodes.push({
            id: item.uuid,
            title,
            tags
          });
          
          tags.forEach(tag => {
            tagSet.add(tag);
            if (!tagToNotes[tag]) {
              tagToNotes[tag] = [];
            }
            tagToNotes[tag].push(item.uuid);
          });
        }
      });

      setNotes(noteNodes);
      setAllTags(Array.from(tagSet).sort());
      
      // Create graph data
      const links: TagLink[] = [];
      const tagArray = Array.from(tagSet);
      
      // Create links between notes that share tags
      for (let i = 0; i < noteNodes.length; i++) {
        for (let j = i + 1; j < noteNodes.length; j++) {
          const sharedTags = noteNodes[i].tags.filter(tag => 
            noteNodes[j].tags.includes(tag)
          );
          if (sharedTags.length > 0) {
            links.push({
              source: noteNodes[i].id,
              target: noteNodes[j].id,
              value: sharedTags.length
            });
          }
        }
      }

      setGraphData({
        nodes: noteNodes,
        links
      });
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching notes:', error);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Filter nodes and links based on search and selected tags
  const filteredGraphData = useCallback(() => {
    let filteredNodes = [...graphData.nodes];
    let filteredLinks = [...graphData.links];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter(node => 
        node.title.toLowerCase().includes(query) ||
        node.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply tag filter
    if (selectedTags.length > 0) {
      filteredNodes = filteredNodes.filter(node => 
        selectedTags.some(tag => node.tags.includes(tag))
      );
    }

    // Filter links to only include those between filtered nodes
    filteredLinks = filteredLinks.filter(link => {
      const sourceNode = filteredNodes.find(n => n.id === link.source);
      const targetNode = filteredNodes.find(n => n.id === link.target);
      return sourceNode && targetNode;
    });

    return { nodes: filteredNodes, links: filteredLinks };
  }, [graphData, searchQuery, selectedTags]);

  // Draw the graph using D3.js
  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const filteredData = filteredGraphData();
    const nodes = filteredData.nodes;
    const links = filteredData.links;

    if (nodes.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Create a force simulation
    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links as any).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.sqrt(d.value));

    // Create nodes
    const node = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add circles for nodes
    node.append('circle')
      .attr('r', 20)
      .attr('fill', d => {
        if (d.tags.length === 0) return '#ccc';
        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
        return colors[d.tags.length % colors.length];
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add text labels
    node.append('text')
      .text(d => d.title.length > 12 ? d.title.substring(0, 10) + '...' : d.title)
      .attr('text-anchor', 'middle')
      .attr('dy', 40)
      .attr('font-size', 10)
      .attr('fill', '#333');

    // Add tag badges
    node.append('g')
      .attr('transform', 'translate(0, -30)')
      .selectAll('text')
      .data(d => d.tags.slice(0, 2)) // Show max 2 tags
      .enter().append('text')
      .text(tag => tag.length > 8 ? tag.substring(0, 6) + '...' : tag)
      .attr('text-anchor', 'middle')
      .attr('dy', (d, i) => i * -12)
      .attr('font-size', 8)
      .attr('fill', '#666')
      .attr('class', 'tag-label');

    // Tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'tag-visualizer-tooltip')
      .style('position', 'absolute')
      .style('background', 'white')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('padding', '8px')
      .style('pointer-events', 'none')
      .style('opacity', 0);

    // Add hover effects
    node.on('mouseover', (event, d) => {
      tooltip.transition()
        .duration(200)
        .style('opacity', .9);
      tooltip.html(`
        <div><strong>${d.title}</strong></div>
        <div>${d.tags.length > 0 ? 'Tags: ' + d.tags.join(', ') : 'No tags'}</div>
      `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px');
    })
    .on('mouseout', () => {
      tooltip.transition()
        .duration(500)
        .style('opacity', 0);
    });

    // Update positions on each tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as any).x)
        .attr('y1', d => (d.source as any).y)
        .attr('x2', d => (d.target as any).x)
        .attr('y2', d => (d.target as any).y);

      node
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Cleanup
    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [graphData, filteredGraphData]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // Re-render on resize
      if (svgRef.current) {
        // Force re-render by temporarily hiding and showing
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleTagSelection = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
  };

  const filteredNotes = notes.filter(node => {
    const matchesSearch = searchQuery.trim() === '' || 
      node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTags = selectedTags.length === 0 || 
      selectedTags.some(tag => node.tags.includes(tag));
    return matchesSearch && matchesTags;
  });

  return (
    <div className="tag-visualizer">
      <div className="tag-visualizer-header">
        <h2>Tag Relationship Visualizer</h2>
        <div className="tag-visualizer-controls">
          <div className="view-mode-toggle">
            <button 
              className={viewMode === 'graph' ? 'active' : ''} 
              onClick={() => setViewMode('graph')}
            >
              Graph View
            </button>
            <button 
              className={viewMode === 'list' ? 'active' : ''} 
              onClick={() => setViewMode('list')}
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
            {allTags.map(tag => (
              <span
                key={tag}
                className={`tag-chip ${selectedTags.includes(tag) ? 'selected' : ''}`}
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
      ) : (
        <div className="tag-visualizer-content">
          {viewMode === 'graph' ? (
            <div className="graph-container">
              <svg 
                ref={svgRef} 
                width="100%" 
                height="600"
                className="tag-visualizer-svg"
              />
              {filteredNotes.length === 0 && (
                <div className="no-results">No notes match your filters</div>
              )}
            </div>
          ) : (
            <div className="list-container">
              <div className="notes-list">
                {filteredNotes.map(note => (
                  <div key={note.id} className="note-card">
                    <div className="note-title">{note.title}</div>
                    <div className="note-tags">
                      {note.tags.map(tag => (
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
                      Connected to {graphData.links.filter(l => l.source === note.id || l.target === note.id).length} notes
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
        </div>
      </div>
    </div>
  );
};

export default TagVisualizer;
