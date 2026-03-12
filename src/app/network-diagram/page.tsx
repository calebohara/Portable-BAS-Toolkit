'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Network, Plus, Trash2, Download, Save, ZoomIn, ZoomOut, Move,
  MousePointer, Link as LinkIcon, Edit3, X, RotateCcw, Copy,
  Server, Router, MonitorSmartphone, Cpu, Thermometer, Gauge,
  LayoutGrid, Cloud, ArrowRightLeft, Settings2, Eye,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNetworkDiagrams } from '@/hooks/use-projects';
import { useProjects } from '@/hooks/use-projects';
import type { NetworkDiagram, DiagramNode, DiagramConnection, DiagramNodeType, ConnectionStyle } from '@/types';
import { DIAGRAM_NODE_LABELS } from '@/types';
import { escapeHtml } from '@/lib/utils';

// ─── Node Icons ──────────────────────────────────────────────
const NODE_ICONS: Record<DiagramNodeType, typeof Server> = {
  controller: Cpu,
  router: Router,
  switch: ArrowRightLeft,
  server: Server,
  sensor: Thermometer,
  actuator: Gauge,
  panel: LayoutGrid,
  workstation: MonitorSmartphone,
  gateway: ArrowRightLeft,
  cloud: Cloud,
  generic: Settings2,
};

const NODE_COLORS: Record<DiagramNodeType, string> = {
  controller: '#3b82f6',
  router: '#f59e0b',
  switch: '#10b981',
  server: '#8b5cf6',
  sensor: '#06b6d4',
  actuator: '#ef4444',
  panel: '#6366f1',
  workstation: '#ec4899',
  gateway: '#f97316',
  cloud: '#64748b',
  generic: '#71717a',
};

type ToolMode = 'select' | 'pan' | 'connect';

// ─── Canvas Node Component ──────────────────────────────────
function CanvasNode({
  node, selected, onSelect, onDragStart, onDoubleClick, zoom,
}: {
  node: DiagramNode; selected: boolean;
  onSelect: () => void; onDragStart: (e: React.PointerEvent) => void;
  onDoubleClick: () => void; zoom: number;
}) {
  const Icon = NODE_ICONS[node.type] || Settings2;
  const color = node.color || NODE_COLORS[node.type];

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onPointerDown={(e) => { onSelect(); onDragStart(e); }}
      onDoubleClick={onDoubleClick}
      style={{ cursor: 'grab' }}
    >
      {/* Selection ring */}
      {selected && (
        <rect x={-42} y={-42} width={84} height={84} rx={14}
          fill="none" stroke="#3b82f6" strokeWidth={2 / zoom} strokeDasharray="4 2" />
      )}
      {/* Node body */}
      <rect x={-36} y={-36} width={72} height={72} rx={12}
        fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5 / zoom} />
      {/* Icon circle */}
      <circle cx={0} cy={-6} r={16} fill={color} fillOpacity={0.2} />
      {/* We render icon as a foreignObject */}
      <foreignObject x={-12} y={-18} width={24} height={24}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
          <Icon style={{ width: 16, height: 16, color }} />
        </div>
      </foreignObject>
      {/* Label */}
      <text x={0} y={26} textAnchor="middle" fill="currentColor"
        fontSize={11 / zoom > 11 ? 11 : Math.max(9, 11)} fontWeight={500}
        className="select-none" style={{ fontSize: 11 }}>
        {node.label.length > 10 ? node.label.slice(0, 10) + '...' : node.label}
      </text>
      {/* IP below */}
      {node.ip && (
        <text x={0} y={38} textAnchor="middle" fill="currentColor" fillOpacity={0.5}
          fontSize={9} className="select-none font-mono">
          {node.ip}
        </text>
      )}
    </g>
  );
}

// ─── Connection Line Component ──────────────────────────────
function ConnectionLine({
  conn, fromNode, toNode, selected, onSelect, zoom,
}: {
  conn: DiagramConnection; fromNode: DiagramNode; toNode: DiagramNode;
  selected: boolean; onSelect: () => void; zoom: number;
}) {
  const dashArray = conn.style === 'dashed' ? '8 4' : conn.style === 'dotted' ? '2 4' : undefined;
  const color = conn.color || '#64748b';
  const midX = (fromNode.x + toNode.x) / 2;
  const midY = (fromNode.y + toNode.y) / 2;

  return (
    <g onClick={onSelect} style={{ cursor: 'pointer' }}>
      {/* Hit area (wider invisible line) */}
      <line x1={fromNode.x} y1={fromNode.y} x2={toNode.x} y2={toNode.y}
        stroke="transparent" strokeWidth={12 / zoom} />
      {/* Visible line */}
      <line x1={fromNode.x} y1={fromNode.y} x2={toNode.x} y2={toNode.y}
        stroke={selected ? '#3b82f6' : color} strokeWidth={(selected ? 2.5 : 1.5) / zoom}
        strokeDasharray={dashArray} />
      {/* Label */}
      {conn.label && (
        <text x={midX} y={midY - 6} textAnchor="middle" fill="currentColor" fillOpacity={0.6}
          fontSize={9} className="select-none pointer-events-none">
          {conn.label}
        </text>
      )}
    </g>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function NetworkDiagramPage() {
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const { diagrams, createDiagram, updateDiagram, removeDiagram } = useNetworkDiagrams(selectedProjectId || undefined);

  // Current diagram
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [connections, setConnections] = useState<DiagramConnection[]>([]);
  const [diagramName, setDiagramName] = useState('Untitled Diagram');
  const [diagramDesc, setDiagramDesc] = useState('');

  // Canvas state
  const [tool, setTool] = useState<ToolMode>('select');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);

  // Dialogs
  const [showNewDiagram, setShowNewDiagram] = useState(false);
  const [showNodeProps, setShowNodeProps] = useState(false);
  const [showConnProps, setShowConnProps] = useState(false);
  const [showDiagramList, setShowDiagramList] = useState(true);

  // Drag state
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panningRef = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null);

  // ─── Load diagram ────────────────────────────────────────
  const loadDiagram = useCallback((d: NetworkDiagram) => {
    setActiveDiagramId(d.id);
    setNodes([...d.nodes]);
    setConnections([...d.connections]);
    setDiagramName(d.name);
    setDiagramDesc(d.description);
    setSelectedNodeId(null);
    setSelectedConnId(null);
    setShowDiagramList(false);
  }, []);

  // ─── Save current diagram ────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedProjectId) {
      toast.error('Select a project first');
      return;
    }
    const now = new Date().toISOString();
    if (activeDiagramId) {
      await updateDiagram({
        id: activeDiagramId,
        projectId: selectedProjectId,
        name: diagramName,
        description: diagramDesc,
        nodes,
        connections,
        createdAt: now,
        updatedAt: now,
      });
      toast.success('Diagram saved');
    } else {
      const d = await createDiagram({
        projectId: selectedProjectId,
        name: diagramName,
        description: diagramDesc,
        nodes,
        connections,
      });
      setActiveDiagramId(d.id);
      toast.success('Diagram created');
    }
  }, [activeDiagramId, selectedProjectId, diagramName, diagramDesc, nodes, connections, createDiagram, updateDiagram]);

  // ─── Add node ──────────────────────────────────────────
  const addNode = useCallback((type: DiagramNodeType) => {
    const node: DiagramNode = {
      id: crypto.randomUUID(),
      type,
      label: DIAGRAM_NODE_LABELS[type],
      x: 200 + Math.random() * 300 - pan.x / zoom,
      y: 200 + Math.random() * 200 - pan.y / zoom,
      color: NODE_COLORS[type],
    };
    setNodes(prev => [...prev, node]);
    setSelectedNodeId(node.id);
    setSelectedConnId(null);
  }, [pan, zoom]);

  // ─── Delete selected ──────────────────────────────────
  const deleteSelected = useCallback(() => {
    if (selectedNodeId) {
      setNodes(prev => prev.filter(n => n.id !== selectedNodeId));
      setConnections(prev => prev.filter(c => c.fromNodeId !== selectedNodeId && c.toNodeId !== selectedNodeId));
      setSelectedNodeId(null);
    }
    if (selectedConnId) {
      setConnections(prev => prev.filter(c => c.id !== selectedConnId));
      setSelectedConnId(null);
    }
  }, [selectedNodeId, selectedConnId]);

  // ─── Node drag ─────────────────────────────────────────
  const handleNodeDragStart = useCallback((nodeId: string, e: React.PointerEvent) => {
    if (tool !== 'select' && tool !== 'connect') return;
    e.stopPropagation();

    if (tool === 'connect') {
      if (!connectFrom) {
        setConnectFrom(nodeId);
        toast.info('Now click the target node to connect');
      } else if (connectFrom !== nodeId) {
        // Create connection
        const conn: DiagramConnection = {
          id: crypto.randomUUID(),
          fromNodeId: connectFrom,
          toNodeId: nodeId,
          style: 'solid',
        };
        setConnections(prev => [...prev, conn]);
        setConnectFrom(null);
      }
      return;
    }

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    draggingRef.current = {
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [tool, connectFrom, nodes]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingRef.current) {
      const { nodeId, startX, startY, origX, origY } = draggingRef.current;
      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;
      setNodes(prev => prev.map(n =>
        n.id === nodeId ? { ...n, x: origX + dx, y: origY + dy } : n
      ));
    }
    if (panningRef.current) {
      const { startX, startY, origPanX, origPanY } = panningRef.current;
      setPan({
        x: origPanX + (e.clientX - startX),
        y: origPanY + (e.clientY - startY),
      });
    }
  }, [zoom]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
    panningRef.current = null;
  }, []);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (tool === 'pan' || e.button === 1) {
      panningRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      };
    } else if (tool === 'select') {
      setSelectedNodeId(null);
      setSelectedConnId(null);
    }
    if (tool === 'connect') {
      setConnectFrom(null);
    }
  }, [tool, pan]);

  // Zoom with scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.2, Math.min(3, z + delta)));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        deleteSelected();
      }
      if (e.key === 'Escape') {
        setConnectFrom(null);
        setSelectedNodeId(null);
        setSelectedConnId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteSelected]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const selectedConn = connections.find(c => c.id === selectedConnId);

  // ─── Export as PNG ─────────────────────────────────────
  const handleExportPng = useCallback(() => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const bbox = svgEl.getBBox();
    const padding = 40;

    const cloned = svgEl.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`);
    cloned.setAttribute('width', String(bbox.width + padding * 2));
    cloned.setAttribute('height', String(bbox.height + padding * 2));
    cloned.removeAttribute('style');

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(cloned);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = (bbox.width + padding * 2) * 2;
      canvas.height = (bbox.height + padding * 2) * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob(blob => {
        if (!blob) return;
        const dl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dl;
        a.download = `${diagramName.replace(/\s+/g, '_')}_diagram.png`;
        a.click();
        URL.revokeObjectURL(dl);
        toast.success('Diagram exported as PNG');
      });
    };
    img.src = url;
  }, [diagramName]);

  // ─── Export as SVG ─────────────────────────────────────
  const handleExportSvg = useCallback(() => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const bbox = svgEl.getBBox();
    const padding = 40;

    const cloned = svgEl.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`);
    cloned.setAttribute('width', String(bbox.width + padding * 2));
    cloned.setAttribute('height', String(bbox.height + padding * 2));

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(cloned);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagramName.replace(/\s+/g, '_')}_diagram.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Diagram exported as SVG');
  }, [diagramName]);

  // ─── New Diagram Dialog ────────────────────────────────
  const [newName, setNewName] = useState('');
  const handleNewDiagram = useCallback(() => {
    setNodes([]);
    setConnections([]);
    setDiagramName(newName || 'Untitled Diagram');
    setDiagramDesc('');
    setActiveDiagramId(null);
    setSelectedNodeId(null);
    setSelectedConnId(null);
    setShowNewDiagram(false);
    setShowDiagramList(false);
    setNewName('');
  }, [newName]);

  const nodeTypes: DiagramNodeType[] = ['controller', 'router', 'switch', 'server', 'sensor', 'actuator', 'panel', 'workstation', 'gateway', 'cloud', 'generic'];

  return (
    <>
      <TopBar title="Network Diagram Builder" />
      <div className="flex" style={{ height: 'calc(100vh - 3.5rem)' }}>
        {/* Left sidebar — Node Library + Diagram List */}
        <div className="w-60 shrink-0 border-r border-border bg-muted/20 flex flex-col overflow-hidden">
          {/* Project selector */}
          <div className="p-3 border-b border-border space-y-2">
            <Label className="text-xs">Project</Label>
            <Select value={selectedProjectId} onValueChange={v => v && setSelectedProjectId(v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select project..." /></SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.projectNumber} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Diagram list / Node library toggle */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setShowDiagramList(true)}
              className={cn('flex-1 px-3 py-2 text-xs font-medium transition-colors',
                showDiagramList ? 'bg-background text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Diagrams
            </button>
            <button
              onClick={() => setShowDiagramList(false)}
              className={cn('flex-1 px-3 py-2 text-xs font-medium transition-colors',
                !showDiagramList ? 'bg-background text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Nodes
            </button>
          </div>

          {showDiagramList ? (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <Button size="sm" variant="outline" className="w-full gap-1.5 h-8 mb-2" onClick={() => setShowNewDiagram(true)}>
                <Plus className="h-3.5 w-3.5" /> New Diagram
              </Button>
              {diagrams.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {selectedProjectId ? 'No diagrams yet' : 'Select a project'}
                </p>
              )}
              {diagrams.map(d => (
                <button
                  key={d.id}
                  onClick={() => loadDiagram(d)}
                  className={cn(
                    'w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors',
                    d.id === activeDiagramId ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  )}
                >
                  <div className="font-medium truncate">{d.name}</div>
                  <div className="text-muted-foreground text-[10px] mt-0.5">
                    {d.nodes.length} nodes, {d.connections.length} connections
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <p className="text-[10px] text-muted-foreground px-1 mb-2">Click to add node to canvas</p>
              {nodeTypes.map(type => {
                const Icon = NODE_ICONS[type];
                const color = NODE_COLORS[type];
                return (
                  <button
                    key={type}
                    onClick={() => addNode(type)}
                    className="w-full flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                  >
                    <div className="h-6 w-6 rounded flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                    </div>
                    <span>{DIAGRAM_NODE_LABELS[type]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Main canvas area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-border bg-muted/30 flex-wrap">
            <div className="flex items-center gap-0.5 border-r border-border pr-2 mr-1">
              <Button size="sm" variant={tool === 'select' ? 'secondary' : 'ghost'} className="h-7 w-7 p-0"
                onClick={() => setTool('select')} title="Select (V)">
                <MousePointer className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={tool === 'pan' ? 'secondary' : 'ghost'} className="h-7 w-7 p-0"
                onClick={() => setTool('pan')} title="Pan (H)">
                <Move className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={tool === 'connect' ? 'secondary' : 'ghost'} className="h-7 w-7 p-0"
                onClick={() => { setTool('connect'); setConnectFrom(null); }} title="Connect (C)">
                <LinkIcon className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-0.5 border-r border-border pr-2 mr-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.min(3, z + 0.2))} title="Zoom In">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[10px] text-muted-foreground w-8 text-center">{Math.round(zoom * 100)}%</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} title="Zoom Out">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset View">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {(selectedNodeId || selectedConnId) && (
              <div className="flex items-center gap-0.5 border-r border-border pr-2 mr-1">
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                  onClick={() => selectedNodeId ? setShowNodeProps(true) : setShowConnProps(true)}>
                  <Edit3 className="h-3 w-3" /> Properties
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={deleteSelected} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {connectFrom && (
              <Badge variant="outline" className="text-[10px] gap-1 text-field-info">
                <LinkIcon className="h-2.5 w-2.5" /> Connecting...
                <button onClick={() => setConnectFrom(null)}><X className="h-2.5 w-2.5" /></button>
              </Badge>
            )}

            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={handleSave} disabled={!selectedProjectId}>
                <Save className="h-3 w-3" /> Save
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={handleExportPng} disabled={nodes.length === 0}>
                <Download className="h-3 w-3" /> PNG
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={handleExportSvg} disabled={nodes.length === 0}>
                <Download className="h-3 w-3" /> SVG
              </Button>
            </div>
          </div>

          {/* Diagram name bar */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-background">
            <Network className="h-4 w-4 text-muted-foreground" />
            <input
              value={diagramName}
              onChange={e => setDiagramName(e.target.value)}
              className="text-sm font-medium bg-transparent outline-none flex-1"
              placeholder="Diagram name..."
            />
            <span className="text-[10px] text-muted-foreground">
              {nodes.length} nodes, {connections.length} connections
            </span>
          </div>

          {/* SVG Canvas */}
          <div
            className="flex-1 overflow-hidden bg-[repeating-linear-gradient(0deg,transparent,transparent_19px,hsl(var(--border)/0.3)_20px),repeating-linear-gradient(90deg,transparent,transparent_19px,hsl(var(--border)/0.3)_20px)]"
            style={{ cursor: tool === 'pan' ? 'grab' : tool === 'connect' ? 'crosshair' : 'default' }}
          >
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
              className="touch-none"
            >
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Connections */}
                {connections.map(conn => {
                  const fromNode = nodes.find(n => n.id === conn.fromNodeId);
                  const toNode = nodes.find(n => n.id === conn.toNodeId);
                  if (!fromNode || !toNode) return null;
                  return (
                    <ConnectionLine
                      key={conn.id}
                      conn={conn}
                      fromNode={fromNode}
                      toNode={toNode}
                      selected={conn.id === selectedConnId}
                      onSelect={() => { setSelectedConnId(conn.id); setSelectedNodeId(null); }}
                      zoom={zoom}
                    />
                  );
                })}
                {/* Nodes */}
                {nodes.map(node => (
                  <CanvasNode
                    key={node.id}
                    node={node}
                    selected={node.id === selectedNodeId}
                    onSelect={() => { setSelectedNodeId(node.id); setSelectedConnId(null); }}
                    onDragStart={(e) => handleNodeDragStart(node.id, e)}
                    onDoubleClick={() => { setSelectedNodeId(node.id); setShowNodeProps(true); }}
                    zoom={zoom}
                  />
                ))}
              </g>
              {/* Empty state */}
              {nodes.length === 0 && (
                <text x="50%" y="50%" textAnchor="middle" fill="currentColor" fillOpacity={0.3} fontSize={14}>
                  Add nodes from the sidebar to start building your diagram
                </text>
              )}
            </svg>
          </div>
        </div>

        {/* Right sidebar — Properties panel (when node/conn selected) */}
        {(showNodeProps && selectedNode) && (
          <div className="w-64 shrink-0 border-l border-border bg-muted/20 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <h3 className="text-xs font-semibold">Node Properties</h3>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowNodeProps(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="p-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input value={selectedNode.label} className="h-8 text-xs"
                  onChange={e => setNodes(prev => prev.map(n => n.id === selectedNodeId ? { ...n, label: e.target.value } : n))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={selectedNode.type}
                  onValueChange={v => v && setNodes(prev => prev.map(n => n.id === selectedNodeId ? { ...n, type: v as DiagramNodeType, color: NODE_COLORS[v as DiagramNodeType] } : n))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {nodeTypes.map(t => <SelectItem key={t} value={t}>{DIAGRAM_NODE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">IP Address</Label>
                <Input value={selectedNode.ip || ''} className="h-8 text-xs font-mono" placeholder="10.40.1.x"
                  onChange={e => setNodes(prev => prev.map(n => n.id === selectedNodeId ? { ...n, ip: e.target.value } : n))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">MAC Address</Label>
                <Input value={selectedNode.mac || ''} className="h-8 text-xs font-mono" placeholder="AA:BB:CC:DD:EE:FF"
                  onChange={e => setNodes(prev => prev.map(n => n.id === selectedNodeId ? { ...n, mac: e.target.value } : n))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea value={selectedNode.notes || ''} className="text-xs min-h-16"
                  onChange={e => setNodes(prev => prev.map(n => n.id === selectedNodeId ? { ...n, notes: e.target.value } : n))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Color</Label>
                <input type="color" value={selectedNode.color || NODE_COLORS[selectedNode.type]}
                  onChange={e => setNodes(prev => prev.map(n => n.id === selectedNodeId ? { ...n, color: e.target.value } : n))}
                  className="h-8 w-full rounded border border-border cursor-pointer" />
              </div>
              <Button size="sm" variant="destructive" className="w-full h-8 gap-1 text-xs" onClick={deleteSelected}>
                <Trash2 className="h-3 w-3" /> Delete Node
              </Button>
            </div>
          </div>
        )}

        {(showConnProps && selectedConn) && (
          <div className="w-64 shrink-0 border-l border-border bg-muted/20 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <h3 className="text-xs font-semibold">Connection Properties</h3>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowConnProps(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="p-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input value={selectedConn.label || ''} className="h-8 text-xs" placeholder="e.g. Ethernet, BACnet/IP"
                  onChange={e => setConnections(prev => prev.map(c => c.id === selectedConnId ? { ...c, label: e.target.value } : c))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Style</Label>
                <Select value={selectedConn.style}
                  onValueChange={v => v && setConnections(prev => prev.map(c => c.id === selectedConnId ? { ...c, style: v as ConnectionStyle } : c))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solid">Solid</SelectItem>
                    <SelectItem value="dashed">Dashed</SelectItem>
                    <SelectItem value="dotted">Dotted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Color</Label>
                <input type="color" value={selectedConn.color || '#64748b'}
                  onChange={e => setConnections(prev => prev.map(c => c.id === selectedConnId ? { ...c, color: e.target.value } : c))}
                  className="h-8 w-full rounded border border-border cursor-pointer" />
              </div>
              <Button size="sm" variant="destructive" className="w-full h-8 gap-1 text-xs" onClick={deleteSelected}>
                <Trash2 className="h-3 w-3" /> Delete Connection
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* New Diagram Dialog */}
      <Dialog open={showNewDiagram} onOpenChange={setShowNewDiagram}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Network Diagram</DialogTitle>
            <DialogDescription>Create a new network topology diagram for your project.</DialogDescription>
          </DialogHeader>
          <DialogBody>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Diagram Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Floor 3 BAS Network" />
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDiagram(false)}>Cancel</Button>
            <Button onClick={handleNewDiagram}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
