'use client';

import type { DiagramConnection, DiagramNode } from '@/types';

export function ConnectionLine({
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
