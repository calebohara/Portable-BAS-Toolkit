'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Network, Plus, Trash2, Download, Save, ZoomIn, ZoomOut, Move,
  MousePointer, Link as LinkIcon, Edit3, X, RotateCcw,
  FolderKanban,
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
import { cn, sanitizeFilename } from '@/lib/utils';
import { toast } from 'sonner';
import { useNetworkDiagrams } from '@/hooks/use-projects';
import { useProjects } from '@/hooks/use-projects';
import type { NetworkDiagram, DiagramNode, DiagramConnection, DiagramNodeType, ConnectionStyle } from '@/types';
import { DIAGRAM_NODE_LABELS } from '@/types';
import { NODE_ICONS, NODE_COLORS } from '@/components/network-diagram/constants';
import { CanvasNode } from '@/components/network-diagram/canvas-node';
import { ConnectionLine } from '@/components/network-diagram/connection-line';

type ToolMode = 'select' | 'pan' | 'connect';

// ─── Mobile Bottom Panel ─────────────────────────────────────
type MobilePanel = 'none' | 'project' | 'nodes';

// ─── Main Page ───────────────────────────────────────────────
export default function NetworkDiagramPage() {
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const { diagrams, createDiagram, updateDiagram } = useNetworkDiagrams(selectedProjectId || undefined);

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

  // Mobile state
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('none');
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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
    setMobilePanel('none');
  }, []);

  // ─── Save current diagram ────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedProjectId) {
      toast.error('Select a project first');
      return;
    }
    const now = new Date().toISOString();
    if (activeDiagramId) {
      const existing = diagrams.find(d => d.id === activeDiagramId);
      await updateDiagram({
        id: activeDiagramId,
        projectId: selectedProjectId,
        name: diagramName,
        description: diagramDesc,
        nodes,
        connections,
        createdAt: existing?.createdAt || now,
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
  }, [activeDiagramId, selectedProjectId, diagramName, diagramDesc, nodes, connections, diagrams, createDiagram, updateDiagram]);

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
    setMobilePanel('none');
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
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return; // Don't intercept when typing in form fields
      }
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          deleteSelected();
          break;
        case 'Escape':
          setConnectFrom(null);
          setSelectedNodeId(null);
          setSelectedConnId(null);
          break;
        case 'v':
        case 'V':
          setTool('select');
          break;
        case 'h':
        case 'H':
          setTool('pan');
          break;
        case 'c':
        case 'C':
          setTool('connect');
          setConnectFrom(null);
          break;
        case '=':
        case '+':
          setZoom(z => Math.min(3, z + 0.1));
          break;
        case '-':
          setZoom(z => Math.max(0.2, z - 0.1));
          break;
        case '0':
          setZoom(1);
          break;
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
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error('Failed to export diagram as PNG');
    };
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
        a.download = `${sanitizeFilename(diagramName)}_diagram.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(dl), 5000);
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

    // Strip any script elements and event handlers from exported SVG
    cloned.querySelectorAll('script').forEach(el => el.remove());
    cloned.querySelectorAll('*').forEach(el => {
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
      }
    });

    cloned.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`);
    cloned.setAttribute('width', String(bbox.width + padding * 2));
    cloned.setAttribute('height', String(bbox.height + padding * 2));

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(cloned);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(diagramName)}_diagram.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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
    setMobilePanel('none');
    setNewName('');
  }, [newName]);

  const nodeTypes: DiagramNodeType[] = ['controller', 'router', 'switch', 'server', 'sensor', 'actuator', 'panel', 'workstation', 'gateway', 'cloud', 'generic'];

  // ─── Shared node properties form ──────────────────────
  const nodePropsForm = selectedNode && (
    <div className="space-y-3">
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
  );

  // ─── Shared connection properties form ────────────────
  const connPropsForm = selectedConn && (
    <div className="space-y-3">
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
  );

  return (
    <>
      <TopBar title="Network Diagram Builder" />
      <div className="flex relative" style={{ height: 'calc(100vh - 3.5rem)' }}>
        {/* ═══ Desktop Left sidebar — Node Library + Diagram List ═══ */}
        <div className="hidden md:flex w-60 shrink-0 border-r border-border bg-muted/20 flex-col overflow-hidden">
          {/* Project selector */}
          <div className="p-3 border-b border-border space-y-2">
            <Label className="text-xs">Project</Label>
            <Select value={selectedProjectId || '_none'} onValueChange={v => setSelectedProjectId(v === '_none' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select project..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No project</SelectItem>
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

        {/* ═══ Main canvas area ═══ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Desktop Toolbar */}
          <div className="hidden md:flex shrink-0 items-center gap-1 px-3 py-1.5 border-b border-border bg-muted/30 flex-wrap">
            <div className="flex items-center gap-0.5 border-r border-border pr-2 mr-1">
              <Button size="sm" variant={tool === 'select' ? 'secondary' : 'ghost'} className="h-7 w-7 p-0"
                onClick={() => setTool('select')} title="Select (V)" aria-label="Select tool">
                <MousePointer className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={tool === 'pan' ? 'secondary' : 'ghost'} className="h-7 w-7 p-0"
                onClick={() => setTool('pan')} title="Pan (H)" aria-label="Pan tool">
                <Move className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={tool === 'connect' ? 'secondary' : 'ghost'} className="h-7 w-7 p-0"
                onClick={() => { setTool('connect'); setConnectFrom(null); }} title="Connect (C)" aria-label="Connect tool">
                <LinkIcon className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-0.5 border-r border-border pr-2 mr-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.min(3, z + 0.2))} title="Zoom In" aria-label="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[10px] text-muted-foreground w-8 text-center">{Math.round(zoom * 100)}%</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} title="Zoom Out" aria-label="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset View" aria-label="Reset view">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {(selectedNodeId || selectedConnId) && (
              <div className="flex items-center gap-0.5 border-r border-border pr-2 mr-1">
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                  onClick={() => selectedNodeId ? setShowNodeProps(true) : setShowConnProps(true)}>
                  <Edit3 className="h-3 w-3" /> Properties
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={deleteSelected} title="Delete" aria-label="Delete selected">
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

          {/* Diagram name bar — desktop */}
          <div className="hidden md:flex shrink-0 items-center gap-2 px-3 py-1.5 border-b border-border bg-background">
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

          {/* ═══ Mobile floating toolbar ═══ */}
          <div className="md:hidden shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/30 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-0.5 shrink-0">
              <Button size="sm" variant={tool === 'select' ? 'secondary' : 'ghost'} className="h-8 w-8 p-0"
                onClick={() => setTool('select')} aria-label="Select tool">
                <MousePointer className="h-4 w-4" />
              </Button>
              <Button size="sm" variant={tool === 'pan' ? 'secondary' : 'ghost'} className="h-8 w-8 p-0"
                onClick={() => setTool('pan')} aria-label="Pan tool">
                <Move className="h-4 w-4" />
              </Button>
              <Button size="sm" variant={tool === 'connect' ? 'secondary' : 'ghost'} className="h-8 w-8 p-0"
                onClick={() => { setTool('connect'); setConnectFrom(null); }} aria-label="Connect tool">
                <LinkIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="w-px h-5 bg-border shrink-0" />
            <div className="flex items-center gap-0.5 shrink-0">
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setZoom(z => Math.min(3, z + 0.2))} aria-label="Zoom in">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} aria-label="Zoom out">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Reset view">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            <div className="w-px h-5 bg-border shrink-0" />
            {(selectedNodeId || selectedConnId) && (
              <div className="flex items-center gap-0.5 shrink-0">
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                  onClick={() => selectedNodeId ? setShowNodeProps(true) : setShowConnProps(true)} aria-label="Edit properties">
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={deleteSelected} aria-label="Delete selected">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="flex items-center gap-0.5 ml-auto shrink-0">
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleSave} disabled={!selectedProjectId} aria-label="Save diagram">
                <Save className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowMobileActions(true)} aria-label="Export options">
                <Download className="h-4 w-4" />
              </Button>
            </div>
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
                  {isMobile ? 'Tap + below to add nodes' : 'Add nodes from the sidebar to start building your diagram'}
                </text>
              )}
            </svg>
          </div>

          {/* ═══ Mobile bottom bar ═══ */}
          <div className="md:hidden shrink-0 border-t border-border bg-background">
            {/* Connecting indicator */}
            {connectFrom && (
              <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-field-info/10 text-xs text-field-info">
                <LinkIcon className="h-3 w-3" /> Tap target node to connect
                <button onClick={() => setConnectFrom(null)} className="ml-1 p-2 rounded-lg hover:bg-muted"><X className="h-3 w-3" /></button>
              </div>
            )}
            {/* Bottom tabs */}
            <div className="flex items-center">
              <button
                onClick={() => setMobilePanel(mobilePanel === 'project' ? 'none' : 'project')}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
                  mobilePanel === 'project' ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <FolderKanban className="h-4.5 w-4.5" />
                <span>Project</span>
              </button>
              <button
                onClick={() => setMobilePanel(mobilePanel === 'nodes' ? 'none' : 'nodes')}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
                  mobilePanel === 'nodes' ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Plus className="h-4.5 w-4.5" />
                <span>Add Node</span>
              </button>
              <button
                onClick={() => {
                  if (selectedNodeId) setShowNodeProps(true);
                  else if (selectedConnId) setShowConnProps(true);
                  else toast('Select a node or connection first');
                }}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
                  (selectedNodeId || selectedConnId) ? 'text-foreground' : 'text-muted-foreground/50'
                )}
              >
                <Edit3 className="h-4.5 w-4.5" />
                <span>Properties</span>
              </button>
            </div>
          </div>
        </div>

        {/* ═══ Desktop right sidebar — Properties panel ═══ */}
        {(showNodeProps && selectedNode) && (
          <div className="hidden md:flex w-64 shrink-0 border-l border-border bg-muted/20 flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <h3 className="text-xs font-semibold">Node Properties</h3>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowNodeProps(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="p-3">
              {nodePropsForm}
            </div>
          </div>
        )}

        {(showConnProps && selectedConn) && (
          <div className="hidden md:flex w-64 shrink-0 border-l border-border bg-muted/20 flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <h3 className="text-xs font-semibold">Connection Properties</h3>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowConnProps(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="p-3">
              {connPropsForm}
            </div>
          </div>
        )}

        {/* ═══ Mobile slide-up panels ═══ */}
        {mobilePanel !== 'none' && (
          <>
            {/* Backdrop */}
            <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMobilePanel('none')} />
            {/* Panel */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border rounded-t-2xl shadow-lg" style={{ maxHeight: '60vh' }}>
              {/* Handle */}
              <div className="flex justify-center py-2">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {mobilePanel === 'project' && (
                <div className="px-4 pb-6 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(60vh - 2rem)' }}>
                  <h3 className="text-sm font-semibold">Project & Diagrams</h3>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Project</Label>
                    <Select value={selectedProjectId || '_none'} onValueChange={v => setSelectedProjectId(v === '_none' ? '' : (v ?? ''))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select project..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">No project</SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.projectNumber} — {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Diagram Name</Label>
                    <Input value={diagramName} onChange={e => setDiagramName(e.target.value)} className="h-9 text-xs" placeholder="Diagram name..." />
                  </div>

                  <Button size="sm" variant="outline" className="w-full gap-1.5 h-9" onClick={() => { setShowNewDiagram(true); setMobilePanel('none'); }}>
                    <Plus className="h-3.5 w-3.5" /> New Diagram
                  </Button>

                  {diagrams.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Load Diagram</Label>
                      {diagrams.map(d => (
                        <button
                          key={d.id}
                          onClick={() => loadDiagram(d)}
                          className={cn(
                            'w-full text-left rounded-lg border px-3 py-2.5 text-xs transition-colors',
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
                  )}
                </div>
              )}

              {mobilePanel === 'nodes' && (
                <div className="px-4 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(60vh - 2rem)' }}>
                  <h3 className="text-sm font-semibold mb-3">Add Node</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {nodeTypes.map(type => {
                      const Icon = NODE_ICONS[type];
                      const color = NODE_COLORS[type];
                      return (
                        <button
                          key={type}
                          onClick={() => addNode(type)}
                          className="flex flex-col items-center gap-1.5 rounded-lg border border-border px-2 py-3 text-xs hover:bg-muted/50 active:scale-95 transition-all"
                        >
                          <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
                            <Icon className="h-4 w-4" style={{ color }} />
                          </div>
                          <span className="text-[10px] leading-tight text-center">{DIAGRAM_NODE_LABELS[type]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══ Node Properties Dialog (mobile) ═══ */}
      <Dialog open={showNodeProps && !!selectedNode && isMobile} onOpenChange={(o) => { if (!o) setShowNodeProps(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Node Properties</DialogTitle>
            <DialogDescription>Edit the selected node&apos;s details.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {nodePropsForm}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ═══ Connection Properties Dialog (mobile) ═══ */}
      <Dialog open={showConnProps && !!selectedConn && isMobile} onOpenChange={(o) => { if (!o) setShowConnProps(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connection Properties</DialogTitle>
            <DialogDescription>Edit the selected connection&apos;s details.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {connPropsForm}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* ═══ Mobile Export Actions Dialog ═══ */}
      <Dialog open={showMobileActions} onOpenChange={setShowMobileActions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Diagram</DialogTitle>
            <DialogDescription>Download your diagram as an image.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-2 py-2">
              <Button variant="outline" className="justify-start gap-2 h-10" onClick={() => { handleExportPng(); setShowMobileActions(false); }} disabled={nodes.length === 0}>
                <Download className="h-4 w-4" /> Export as PNG
              </Button>
              <Button variant="outline" className="justify-start gap-2 h-10" onClick={() => { handleExportSvg(); setShowMobileActions(false); }} disabled={nodes.length === 0}>
                <Download className="h-4 w-4" /> Export as SVG
              </Button>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* New Diagram Dialog */}
      <Dialog open={showNewDiagram} onOpenChange={(o) => { setShowNewDiagram(o); if (!o) setNewName(''); }}>
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
