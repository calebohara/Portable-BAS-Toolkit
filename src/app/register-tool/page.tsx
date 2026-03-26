'use client';

import { useState } from 'react';
import {
  Calculator, Binary, Layers, Cpu, Grid3X3,
  TrendingUp, Database, Clock, Save, HelpCircle,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { QuickConverter } from '@/components/register-tool/quick-converter';
import { RegisterInterpreter } from '@/components/register-tool/register-interpreter';
import { ByteOrderTool } from '@/components/register-tool/byte-order-tool';
import { FloatDecoder } from '@/components/register-tool/float-decoder';
import { BitmaskTool } from '@/components/register-tool/bitmask-tool';
import { ScalingCalculator } from '@/components/register-tool/scaling-calculator';
import { ModbusBuilder } from '@/components/register-tool/modbus-builder';
import { CalculationHistory } from '@/components/register-tool/calculation-history';
import { SaveDialog } from '@/components/register-tool/save-dialog';
import { HelpReference } from '@/components/register-tool/help-reference';

const TAB_ITEMS = [
  { value: 'convert', label: 'Converter', icon: Binary },
  { value: 'register', label: 'Register', icon: Cpu },
  { value: 'byte-order', label: 'Byte Order', icon: Layers },
  { value: 'float', label: 'Float', icon: Calculator },
  { value: 'bitmask', label: 'Bitmask', icon: Grid3X3 },
  { value: 'scaling', label: 'Scaling', icon: TrendingUp },
  { value: 'modbus', label: 'Modbus', icon: Database },
  { value: 'history', label: 'Saved', icon: Clock },
  { value: 'help', label: 'Help', icon: HelpCircle },
];

export default function RegisterToolPage() {
  const [activeTab, setActiveTab] = useState('convert');
  const [showSave, setShowSave] = useState(false);

  return (
    <>
      <TopBar title="Protocol Converter / Register Tool" />
      <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
        <Tabs value={activeTab} onValueChange={v => v && setActiveTab(v)}>
          <div className="shrink-0 border-b border-border bg-muted/20 px-4">
            <TabsList variant="line" className="overflow-x-auto scrollbar-none">
              {TAB_ITEMS.map(t => (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-3 py-2 text-xs">
                  <t.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* Calculator modules rendered always with CSS hiding to preserve form state across tab switches */}
            <div className={activeTab === 'convert' ? '' : 'hidden'}><QuickConverter /></div>
            <div className={activeTab === 'register' ? '' : 'hidden'}><RegisterInterpreter /></div>
            <div className={activeTab === 'byte-order' ? '' : 'hidden'}><ByteOrderTool /></div>
            <div className={activeTab === 'float' ? '' : 'hidden'}><FloatDecoder /></div>
            <div className={activeTab === 'bitmask' ? '' : 'hidden'}><BitmaskTool /></div>
            <div className={activeTab === 'scaling' ? '' : 'hidden'}><ScalingCalculator /></div>
            <div className={activeTab === 'modbus' ? '' : 'hidden'}><ModbusBuilder /></div>
            <TabsContent value="history"><CalculationHistory onSaveRequest={() => setShowSave(true)} /></TabsContent>
            <TabsContent value="help"><HelpReference /></TabsContent>
          </div>
        </Tabs>

        {/* Floating save button (visible on calculation tabs) */}
        {!['history', 'help'].includes(activeTab) && (
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30">
            <span className="text-[10px] text-muted-foreground">
              {TAB_ITEMS.find(t => t.value === activeTab)?.label} Module
            </span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowSave(true)}>
              <Save className="h-3 w-3" /> Save Calculation
            </Button>
          </div>
        )}
      </div>

      <SaveDialog open={showSave} onOpenChange={setShowSave} activeModule={activeTab} />
    </>
  );
}
