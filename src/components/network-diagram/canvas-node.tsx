'use client';

import { Settings2 } from 'lucide-react';
import type { DiagramNode } from '@/types';
import { NODE_ICONS, NODE_COLORS } from './constants';

export function CanvasNode({
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
        fontSize={Math.max(9, 11 / zoom)} fontWeight={500}
        className="select-none">
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
