import {
  Server, Router, MonitorSmartphone, Cpu, Thermometer, Gauge,
  LayoutGrid, Cloud, ArrowRightLeft, Settings2,
} from 'lucide-react';
import type { DiagramNodeType } from '@/types';

export const NODE_ICONS: Record<DiagramNodeType, typeof Server> = {
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

export const NODE_COLORS: Record<DiagramNodeType, string> = {
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
