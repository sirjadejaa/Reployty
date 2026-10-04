/**
 * Reployty V2 — Phase 27 Visual Drag-and-Drop Workflow Builder
 * Visual Canvas, Node System, Configuration Drawer, Simulation, and Outline Mode
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Save,
  Play,
  Pause,
  Zap,
  Clock,
  GitBranch,
  Send,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Copy,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Activity,
  List,
  Layout,
  Check,
  Layers,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeType,
  WorkflowValidationResult,
  WorkflowSimulationResult,
  WaitTimeUnit,
} from '../../types/workflow';
import {
  AutomationRuleItem,
  SUPPORTED_TRIGGERS,
} from '../../types/automation';


interface VisualWorkflowBuilderProps {
  ruleId: string;
  onBack: () => void;
  onUpdated?: () => void;
}

const DEFAULT_WORKFLOW: WorkflowDefinition = {
  version: 1,
  nodes: [
    {
      id: 'trigger_1',
      type: 'TRIGGER',
      position: { x: 80, y: 120 },
      config: { triggerEvent: 'CUSTOMER_VISIT', label: 'Customer Visits' },
      label: 'Trigger: Customer Visits',
    },
    {
      id: 'wait_1',
      type: 'WAIT',
      position: { x: 340, y: 120 },
      config: { duration: 7, unit: 'DAYS' },
      label: 'Wait 7 Days',
    },
    {
      id: 'branch_1',
      type: 'BRANCH',
      position: { x: 600, y: 120 },
      config: { field: 'daysSinceLastVisit', operator: 'GREATER_THAN_OR_EQUAL', value: 7 },
      label: 'Customer Inactive >= 7d?',
    },
    {
      id: 'action_1',
      type: 'ACTION',
      position: { x: 860, y: 220 },
      config: { actionType: 'SEND_CAMPAIGN', campaignId: '', cooldownHours: 24 },
      label: 'Send Win-Back Campaign',
    },
    {
      id: 'end_yes',
      type: 'END',
      position: { x: 860, y: 40 },
      config: { reason: 'Customer returned' },
      label: 'End (Returned)',
    },
    {
      id: 'end_no',
      type: 'END',
      position: { x: 1120, y: 220 },
      config: { reason: 'Workflow completed' },
      label: 'End',
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger_1', target: 'wait_1' },
    { id: 'e2', source: 'wait_1', target: 'branch_1' },
    { id: 'e3', source: 'branch_1', target: 'end_yes', sourceHandle: 'NO', label: 'NO' },
    { id: 'e4', source: 'branch_1', target: 'action_1', sourceHandle: 'YES', label: 'YES' },
    { id: 'e5', source: 'action_1', target: 'end_no' },
  ],
};

const TRIGGER_LABELS: Record<string, string> = {
  CUSTOMER_VISIT: 'Customer Visits',
  STAMP_ADDED: 'Stamp Added',
  POINTS_ADDED: 'Points Added',
  REWARD_REDEEMED: 'Reward Redeemed',
  OFFER_REDEEMED: 'Offer Redeemed',
  CUSTOMER_REACTIVATED: 'Customer Reactivated',
  CUSTOMER_INACTIVE: 'Customer Inactive',
};

const CONDITION_FIELDS = [
  { value: 'totalVisits', label: 'Total Visits', type: 'number' },
  { value: 'stampBalance', label: 'Stamp Balance', type: 'number' },
  { value: 'pointsBalance', label: 'Points Balance', type: 'number' },
  { value: 'daysSinceLastVisit', label: 'Days Since Last Visit', type: 'number' },
  { value: 'customerSegment', label: 'Customer Segment', type: 'string' },
];

const OPERATORS = [
  { value: 'GREATER_THAN_OR_EQUAL', label: '>= (At least)' },
  { value: 'GREATER_THAN', label: '> (Greater than)' },
  { value: 'LESS_THAN_OR_EQUAL', label: '<= (At most)' },
  { value: 'LESS_THAN', label: '< (Less than)' },
  { value: 'EQUALS', label: '= (Equals)' },
  { value: 'NOT_EQUALS', label: '!= (Does not equal)' },
];

export const VisualWorkflowBuilder: React.FC<VisualWorkflowBuilderProps> = ({
  ruleId,
  onBack,
  onUpdated,
}) => {
  const canvasRef = useRef<SVGSVGElement | null>(null);

  // Core Rule State
  const [rule, setRule] = useState<AutomationRuleItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
  const [ruleName, setRuleName] = useState('');

  // Workflow State
  const [workflow, setWorkflow] = useState<WorkflowDefinition>(DEFAULT_WORKFLOW);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [viewMode, setViewMode] = useState<'CANVAS' | 'OUTLINE'>('CANVAS');

  // Canvas Viewport (Pan & Zoom)
  const [viewport, setViewport] = useState({ x: 40, y: 40, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Node Dragging
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Connection Wire Dragging
  const [connectingSource, setConnectingSource] = useState<{
    nodeId: string;
    handle?: string;
  } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Campaigns & Auxiliary Data
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; channel: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone: string }>>([]);

  // Simulation State
  const [simModalOpen, setSimModalOpen] = useState(false);
  const [simCustomerId, setSimCustomerId] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<WorkflowSimulationResult | null>(null);

  // Versions State
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);

  // Analytics State
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [analytics, setAnalytics] = useState<any | null>(null);

  // Load Rule & Auxiliary Data
  const loadData = useCallback(async () => {
    try {
      // Fetch Rule
      const res = await fetch(`/api/business/automations/${ruleId}`);
      if (res.ok) {
        const data = await res.json();
        setRule(data);
        setRuleName(data.name);

        const currentDef = data.draftDefinition || data.workflowDefinition;
        if (currentDef && currentDef.nodes && currentDef.nodes.length > 0) {
          setWorkflow(currentDef);
        } else {
          // Initialize default workflow with rule's existing trigger/action
          const initDef = { ...DEFAULT_WORKFLOW };
          if (data.triggerEvent) {
            initDef.nodes[0].config.triggerEvent = data.triggerEvent;
            initDef.nodes[0].label = `Trigger: ${TRIGGER_LABELS[data.triggerEvent] || data.triggerEvent}`;
          }
          if (data.actionConfig?.campaignId) {
            initDef.nodes[3].config.campaignId = data.actionConfig.campaignId;
          }
          setWorkflow(initDef);
        }
      }

      // Fetch Campaigns for Action Node Selector
      const campRes = await fetch('/api/business/campaigns');
      if (campRes.ok) {
        const campData = await campRes.json();
        setCampaigns(campData.campaigns || []);
      }

      // Fetch Sample Customers for Testing / Simulation
      const custRes = await fetch('/api/business/customers?limit=10');
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData.customers || []);
        if (custData.customers?.[0]) {
          setSimCustomerId(custData.customers[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load workflow data:', err);
    }
  }, [ruleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Run Server-side Workflow Validation
  const validateWorkflow = useCallback(
    async (defToValidate?: WorkflowDefinition) => {
      try {
        const def = defToValidate || workflow;
        const res = await fetch(`/api/business/automations/${ruleId}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowDefinition: def }),
        });
        if (res.ok) {
          const val: WorkflowValidationResult = await res.json();
          setValidationResult(val);
          return val;
        }
      } catch (err) {
        console.error('Validation error:', err);
      }
      return null;
    },
    [ruleId, workflow]
  );

  // Validate on workflow changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      validateWorkflow();
    }, 600);
    return () => clearTimeout(timer);
  }, [workflow, validateWorkflow]);

  // Save Draft to PostgreSQL
  const handleSaveDraft = async () => {
    try {
      setSaving(true);
      setSaveStatus('SAVING');
      const res = await fetch(`/api/business/automations/${ruleId}/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowDefinition: rule?.status === 'DRAFT' ? workflow : undefined,
          draftDefinition: rule?.status === 'ACTIVE' || rule?.status === 'PAUSED' ? workflow : workflow,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setRule(updated);
        setSaveStatus('SAVED');
        setTimeout(() => setSaveStatus('IDLE'), 2500);
        if (onUpdated) onUpdated();
      } else {
        setSaveStatus('ERROR');
      }
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('ERROR');
    } finally {
      setSaving(false);
    }
  };

  // Activate Workflow
  const handleActivate = async () => {
    // 1. First save latest canvas draft
    await handleSaveDraft();

    // 2. Validate executable requirements
    const val = await validateWorkflow();
    if (val && !val.valid) {
      alert(`Cannot activate workflow:\n• ${val.errors.map((e) => e.message).join('\n• ')}`);
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/business/automations/${ruleId}/activate`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated = await res.json();
        setRule(updated);
        alert('Workflow successfully validated, compiled, and activated!');
        if (onUpdated) onUpdated();
      } else {
        const err = await res.json();
        alert(`Activation failed: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Activation error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Pause Workflow
  const handlePause = async () => {
    try {
      setSaving(true);
      const res = await fetch(`/api/business/automations/${ruleId}/pause`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated = await res.json();
        setRule(updated);
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      console.error('Pause error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Add Node to Canvas
  const handleAddNode = (type: WorkflowNodeType) => {
    const newId = `${type.toLowerCase()}_${Date.now()}`;
    const x = Math.round((-viewport.x + 300) / viewport.zoom);
    const y = Math.round((-viewport.y + 200) / viewport.zoom);

    let config: any = {};
    let label = '';

    switch (type) {
      case 'TRIGGER':
        config = { triggerEvent: 'CUSTOMER_VISIT' };
        label = 'Customer Visits';
        break;
      case 'CONDITION':
        config = { field: 'totalVisits', operator: 'GREATER_THAN_OR_EQUAL', value: 5 };
        label = 'Total Visits >= 5';
        break;
      case 'WAIT':
        config = { duration: 3, unit: 'DAYS' };
        label = 'Wait 3 Days';
        break;
      case 'ACTION':
        config = { actionType: 'SEND_CAMPAIGN', campaignId: campaigns[0]?.id || '' };
        label = 'Send Campaign';
        break;
      case 'BRANCH':
        config = { field: 'pointsBalance', operator: 'GREATER_THAN', value: 0 };
        label = 'Branch Condition';
        break;
      case 'END':
        config = { reason: 'Completed' };
        label = 'End';
        break;
    }

    const newNode: WorkflowNode = {
      id: newId,
      type,
      position: { x: Math.max(20, x), y: Math.max(20, y) },
      config,
      label,
    };

    setWorkflow((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setSelectedNodeId(newId);
  };

  // Delete Node
  const handleDeleteNode = (nodeId: string) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  // Duplicate Node
  const handleDuplicateNode = (nodeId: string) => {
    const target = workflow.nodes.find((n) => n.id === nodeId);
    if (!target) return;
    const newId = `${target.type.toLowerCase()}_${Date.now()}`;
    const newNode: WorkflowNode = {
      ...target,
      id: newId,
      position: { x: target.position.x + 40, y: target.position.y + 40 },
      label: `${target.label || target.type} (Copy)`,
      config: JSON.parse(JSON.stringify(target.config)),
    };
    setWorkflow((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
    setSelectedNodeId(newId);
  };

  // Delete Edge
  const handleDeleteEdge = (edgeId: string) => {
    setWorkflow((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== edgeId),
    }));
  };

  // Connect Nodes
  const handleConnect = (sourceId: string, targetId: string, handle?: string) => {
    if (sourceId === targetId) return;

    // Check if edge already exists
    const exists = workflow.edges.some(
      (e) => e.source === sourceId && e.target === targetId && e.sourceHandle === handle
    );
    if (exists) return;

    const newEdge: WorkflowEdge = {
      id: `edge_${Date.now()}`,
      source: sourceId,
      target: targetId,
      sourceHandle: handle,
      label: handle,
    };

    setWorkflow((prev) => ({
      ...prev,
      edges: [...prev.edges, newEdge],
    }));
  };

  // Update Selected Node Config
  const handleUpdateNodeConfig = (nodeId: string, updates: Record<string, any>) => {
    setWorkflow((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => {
        if (n.id === nodeId) {
          const newConfig = { ...n.config, ...updates };
          let updatedLabel = n.label;
          if (n.type === 'WAIT') {
            updatedLabel = `Wait ${newConfig.duration} ${String(newConfig.unit).toLowerCase()}`;
          } else if (n.type === 'TRIGGER') {
            updatedLabel = `Trigger: ${TRIGGER_LABELS[newConfig.triggerEvent || ''] || newConfig.triggerEvent || ''}`;
          } else if (n.type === 'ACTION') {
            const camp = campaigns.find((c) => c.id === newConfig.campaignId);
            updatedLabel = camp ? `Send: ${camp.name}` : 'Send Campaign';
          } else if (n.type === 'CONDITION' || n.type === 'BRANCH') {
            updatedLabel = `${newConfig.field} ${newConfig.operator} ${newConfig.value}`;
          }
          return {
            ...n,
            config: newConfig,
            label: updatedLabel,
          };
        }
        return n;
      }),
    }));
  };

  // Run Dry-run Simulation
  const handleRunSimulation = async () => {
    try {
      setSimulating(true);
      const res = await fetch(`/api/business/automations/${ruleId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: simCustomerId,
          definition: workflow,
        }),
      });
      if (res.ok) {
        const result: WorkflowSimulationResult = await res.json();
        setSimResult(result);
      } else {
        const err = await res.json();
        alert(`Simulation error: ${err.error || 'Failed to simulate'}`);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(false);
    }
  };

  // View Versions
  const handleOpenVersions = async () => {
    try {
      const res = await fetch(`/api/business/automations/${ruleId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
        setVersionsModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    }
  };

  // View Analytics
  const handleOpenAnalytics = async () => {
    try {
      const res = await fetch(`/api/business/automations/${ruleId}/analytics`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
        setAnalyticsModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  };

  // Pan Canvas Mouse Handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
      setSelectedNodeId(null);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const svgRect = canvasRef.current?.getBoundingClientRect();
    if (svgRect) {
      setMousePos({
        x: (e.clientX - svgRect.left - viewport.x) / viewport.zoom,
        y: (e.clientY - svgRect.top - viewport.y) / viewport.zoom,
      });
    }

    if (isPanning) {
      setViewport((prev) => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }));
    } else if (draggingNodeId) {
      const newX = Math.round((e.clientX - (svgRect?.left || 0) - viewport.x) / viewport.zoom - dragOffset.x);
      const newY = Math.round((e.clientY - (svgRect?.top || 0) - viewport.y) / viewport.zoom - dragOffset.y);

      setWorkflow((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === draggingNodeId
            ? { ...n, position: { x: Math.max(10, newX), y: Math.max(10, newY) } }
            : n
        ),
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    setConnectingSource(null);
  };

  const selectedNode = workflow.nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] text-[#111827] overflow-hidden select-none">
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-[#E2E8F0] px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-[#64748B] hover:text-[#111827]"
            title="Back to Automations"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back
          </Button>

          <div className="h-6 w-px bg-[#E2E8F0] mx-1" />

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg text-[#111827]">
                {ruleName || 'Untitled Workflow'}
              </span>
              <StatusBadge status={rule?.status || 'DRAFT'} />
              {rule?.version && (
                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium border border-slate-200">
                  v{rule.version}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#64748B]">
              <span>ID: {ruleId.slice(0, 8)}...</span>
              {saveStatus === 'SAVING' && <span className="text-amber-600">Saving draft...</span>}
              {saveStatus === 'SAVED' && <span className="text-emerald-600 font-medium">✓ Saved</span>}
              {saveStatus === 'ERROR' && <span className="text-rose-600 font-medium">Save failed</span>}
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 mr-2">
            <button
              onClick={() => setViewMode('CANVAS')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'CANVAS'
                  ? 'bg-white text-[#4F6BFF] shadow-sm'
                  : 'text-[#64748B] hover:text-[#111827]'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              Canvas
            </button>
            <button
              onClick={() => setViewMode('OUTLINE')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'OUTLINE'
                  ? 'bg-white text-[#4F6BFF] shadow-sm'
                  : 'text-[#64748B] hover:text-[#111827]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Outline
            </button>
          </div>

          {/* Validation Status Pill */}
          {validationResult && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                validationResult.valid
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
              title={
                validationResult.valid
                  ? 'Workflow structure is valid'
                  : validationResult.errors.map((e) => e.message).join('\n')
              }
            >
              {validationResult.valid ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Valid
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  {validationResult.errors.length} Issue
                  {validationResult.errors.length > 1 ? 's' : ''}
                </>
              )}
            </div>
          )}

          {/* Test / Simulate */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSimModalOpen(true)}
            className="text-[#4F6BFF] border-[#4F6BFF]/30 hover:bg-[#4F6BFF]/5"
          >
            <Play className="w-4 h-4 mr-1 text-[#4F6BFF]" />
            Test
          </Button>

          {/* Version History */}
          <Button variant="outline" size="sm" onClick={handleOpenVersions}>
            <Layers className="w-4 h-4 mr-1 text-[#64748B]" />
            Versions
          </Button>

          {/* Analytics */}
          <Button variant="outline" size="sm" onClick={handleOpenAnalytics}>
            <Activity className="w-4 h-4 mr-1 text-[#64748B]" />
            Metrics
          </Button>

          {/* Save Draft */}
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            Save Draft
          </Button>

          {/* Activate / Pause */}
          {rule?.status === 'ACTIVE' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePause}
              disabled={saving}
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <Pause className="w-4 h-4 mr-1" />
              Pause
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleActivate}
              disabled={saving}
              className="bg-[#4F6BFF] text-white hover:bg-[#4056E0]"
            >
              <Check className="w-4 h-4 mr-1" />
              Activate
            </Button>
          )}
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Node Palette (Left sidebar on desktop) */}
        {viewMode === 'CANVAS' && (
          <aside className="w-48 bg-white border-r border-[#E2E8F0] p-3 flex flex-col gap-2 z-10 shadow-sm">
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1">
              Add Nodes
            </span>

            <button
              onClick={() => handleAddNode('TRIGGER')}
              className="flex items-center gap-2.5 p-2 rounded-lg border border-indigo-100 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-900 text-xs font-medium text-left transition-all"
            >
              <div className="p-1.5 rounded-md bg-indigo-500 text-white">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div>
                <div>Trigger</div>
                <div className="text-[10px] text-indigo-600 font-normal">Customer events</div>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('CONDITION')}
              className="flex items-center gap-2.5 p-2 rounded-lg border border-sky-100 bg-sky-50/50 hover:bg-sky-50 text-sky-900 text-xs font-medium text-left transition-all"
            >
              <div className="p-1.5 rounded-md bg-sky-500 text-white">
                <FilterIcon className="w-3.5 h-3.5" />
              </div>
              <div>
                <div>Condition</div>
                <div className="text-[10px] text-sky-600 font-normal">Filter & criteria</div>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('WAIT')}
              className="flex items-center gap-2.5 p-2 rounded-lg border border-amber-100 bg-amber-50/50 hover:bg-amber-50 text-amber-900 text-xs font-medium text-left transition-all"
            >
              <div className="p-1.5 rounded-md bg-amber-500 text-white">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div>
                <div>Wait Delay</div>
                <div className="text-[10px] text-amber-600 font-normal">Time pause</div>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('ACTION')}
              className="flex items-center gap-2.5 p-2 rounded-lg border border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-900 text-xs font-medium text-left transition-all"
            >
              <div className="p-1.5 rounded-md bg-emerald-500 text-white">
                <Send className="w-3.5 h-3.5" />
              </div>
              <div>
                <div>Send Campaign</div>
                <div className="text-[10px] text-emerald-600 font-normal">Message customer</div>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('BRANCH')}
              className="flex items-center gap-2.5 p-2 rounded-lg border border-purple-100 bg-purple-50/50 hover:bg-purple-50 text-purple-900 text-xs font-medium text-left transition-all"
            >
              <div className="p-1.5 rounded-md bg-purple-500 text-white">
                <GitBranch className="w-3.5 h-3.5" />
              </div>
              <div>
                <div>Branch (If/Else)</div>
                <div className="text-[10px] text-purple-600 font-normal">YES / NO split</div>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('END')}
              className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-medium text-left transition-all"
            >
              <div className="p-1.5 rounded-md bg-slate-600 text-white">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <div>End Node</div>
                <div className="text-[10px] text-slate-500 font-normal">Terminal point</div>
              </div>
            </button>

            <div className="mt-auto p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Canvas Tips</span>
              <span>• Click & drag to pan</span>
              <span>• Drag ports to connect</span>
              <span>• Click node to edit</span>
            </div>
          </aside>
        )}

        {/* View Mode: CANVAS */}
        {viewMode === 'CANVAS' && (
          <div className="flex-1 relative bg-[#F8FAFC] overflow-hidden">
            {/* Canvas Zoom Controls */}
            <div className="absolute bottom-4 left-4 z-10 bg-white border border-[#E2E8F0] rounded-lg shadow-sm flex items-center p-1 gap-1">
              <button
                onClick={() => setViewport((v) => ({ ...v, zoom: Math.min(2, v.zoom + 0.1) }))}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-600 px-1 font-mono">
                {Math.round(viewport.zoom * 100)}%
              </span>
              <button
                onClick={() => setViewport((v) => ({ ...v, zoom: Math.max(0.4, v.zoom - 0.1) }))}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewport({ x: 40, y: 40, zoom: 1 })}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                title="Reset View"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {/* SVG Interactive Canvas */}
            <svg
              ref={canvasRef}
              className="w-full h-full cursor-grab active:cursor-grabbing"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            >
              {/* Dot Grid Pattern */}
              <defs>
                <pattern
                  id="dot-grid"
                  x="0"
                  y="0"
                  width={24 * viewport.zoom}
                  height={24 * viewport.zoom}
                  patternUnits="userSpaceOnUse"
                >
                  <circle
                    cx={12 * viewport.zoom}
                    cy={12 * viewport.zoom}
                    r={1 * viewport.zoom}
                    fill="#CBD5E1"
                  />
                </pattern>
                {/* Arrowhead Marker */}
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#94A3B8" />
                </marker>
                <marker
                  id="arrow-yes"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#10B981" />
                </marker>
                <marker
                  id="arrow-no"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#EF4444" />
                </marker>
              </defs>

              <rect width="100%" height="100%" fill="url(#dot-grid)" />

              {/* Viewport Transform Group */}
              <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
                {/* Render Edges (Wires) */}
                {workflow.edges.map((edge) => {
                  const sourceNode = workflow.nodes.find((n) => n.id === edge.source);
                  const targetNode = workflow.nodes.find((n) => n.id === edge.target);
                  if (!sourceNode || !targetNode) return null;

                  // Compute port coordinates (220px node width, 80px node height)
                  let startX = sourceNode.position.x + 220;
                  let startY = sourceNode.position.y + 40;

                  // Branch handles (YES is lower right, NO is upper right)
                  if (sourceNode.type === 'BRANCH') {
                    if (edge.sourceHandle === 'YES') {
                      startX = sourceNode.position.x + 220;
                      startY = sourceNode.position.y + 55;
                    } else if (edge.sourceHandle === 'NO') {
                      startX = sourceNode.position.x + 220;
                      startY = sourceNode.position.y + 25;
                    }
                  }

                  const endX = targetNode.position.x;
                  const endY = targetNode.position.y + 40;

                  // Smooth Bezier Curve
                  const dx = Math.abs(endX - startX) * 0.5;
                  const pathData = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${
                    endX - dx
                  } ${endY}, ${endX} ${endY}`;

                  let strokeColor = '#94A3B8';
                  let marker = 'url(#arrow)';
                  if (edge.sourceHandle === 'YES') {
                    strokeColor = '#10B981';
                    marker = 'url(#arrow-yes)';
                  } else if (edge.sourceHandle === 'NO') {
                    strokeColor = '#EF4444';
                    marker = 'url(#arrow-no)';
                  }

                  return (
                    <g key={edge.id} className="group cursor-pointer">
                      <path
                        d={pathData}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="16"
                        onClick={() => handleDeleteEdge(edge.id)}
                      />
                      <path
                        d={pathData}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="2.5"
                        markerEnd={marker}
                        className="transition-all group-hover:stroke-[#4F6BFF] group-hover:stroke-[3.5]"
                      />
                      {/* Edge Label for Branches */}
                      {edge.label && (
                        <text
                          x={(startX + endX) / 2}
                          y={(startY + endY) / 2 - 8}
                          fill={edge.label === 'YES' ? '#059669' : '#DC2626'}
                          fontSize="11"
                          fontWeight="700"
                          textAnchor="middle"
                          className="bg-white"
                        >
                          {edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Connecting wire while dragging */}
                {connectingSource && (
                  <path
                    d={`M ${
                      workflow.nodes.find((n) => n.id === connectingSource.nodeId)?.position.x! +
                      220
                    } ${
                      workflow.nodes.find((n) => n.id === connectingSource.nodeId)?.position.y! + 40
                    } L ${mousePos.x} ${mousePos.y}`}
                    fill="none"
                    stroke="#4F6BFF"
                    strokeWidth="2"
                    strokeDasharray="4"
                  />
                )}

                {/* Render Nodes */}
                {workflow.nodes.map((node) => {
                  const isSelected = selectedNodeId === node.id;
                  const nodeColor = getNodeColor(node.type);

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.position.x}, ${node.position.y})`}
                      className="cursor-move"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedNodeId(node.id);
                        setDraggingNodeId(node.id);
                        const svgRect = canvasRef.current?.getBoundingClientRect();
                        setDragOffset({
                          x: (e.clientX - (svgRect?.left || 0) - viewport.x) / viewport.zoom - node.position.x,
                          y: (e.clientY - (svgRect?.top || 0) - viewport.y) / viewport.zoom - node.position.y,
                        });
                      }}
                    >
                      {/* Node Card Container */}
                      <rect
                        width="220"
                        height="80"
                        rx="10"
                        fill="#FFFFFF"
                        stroke={isSelected ? '#4F6BFF' : nodeColor.border}
                        strokeWidth={isSelected ? '2.5' : '1.5'}
                        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.04))"
                        className="transition-all hover:filter-drop-shadow(0 4px 6px rgba(0,0,0,0.08))"
                      />

                      {/* Header stripe */}
                      <rect
                        width="220"
                        height="6"
                        rx="3"
                        fill={nodeColor.badge}
                      />

                      {/* Node Icon & Type Label */}
                      <text
                        x="14"
                        y="28"
                        fill={nodeColor.text}
                        fontSize="11"
                        fontWeight="700"
                        letterSpacing="0.5"
                      >
                        {node.type}
                      </text>

                      {/* Node Main Title / Summary */}
                      <text
                        x="14"
                        y="50"
                        fill="#1E293B"
                        fontSize="13"
                        fontWeight="600"
                        className="truncate"
                      >
                        {truncateText(node.label || node.customName || node.type, 24)}
                      </text>

                      {/* Node Subtitle */}
                      <text
                        x="14"
                        y="66"
                        fill="#64748B"
                        fontSize="10"
                      >
                        {getNodeSubtitle(node)}
                      </text>

                      {/* Left Target Connection Port (Except for Trigger) */}
                      {node.type !== 'TRIGGER' && (
                        <circle
                          cx="0"
                          cy="40"
                          r="6"
                          fill="#FFFFFF"
                          stroke={nodeColor.border}
                          strokeWidth="2"
                          className="hover:fill-[#4F6BFF] cursor-crosshair transition-colors"
                          onMouseUp={(e) => {
                            e.stopPropagation();
                            if (connectingSource) {
                              handleConnect(connectingSource.nodeId, node.id, connectingSource.handle);
                              setConnectingSource(null);
                            }
                          }}
                        />
                      )}

                      {/* Right Source Connection Port (Except for End) */}
                      {node.type !== 'END' && node.type !== 'BRANCH' && (
                        <circle
                          cx="220"
                          cy="40"
                          r="6"
                          fill="#FFFFFF"
                          stroke={nodeColor.border}
                          strokeWidth="2"
                          className="hover:fill-[#4F6BFF] cursor-crosshair transition-colors"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setConnectingSource({ nodeId: node.id });
                          }}
                        />
                      )}

                      {/* Branch Special Ports (YES / NO) */}
                      {node.type === 'BRANCH' && (
                        <>
                          {/* NO Handle (upper) */}
                          <circle
                            cx="220"
                            cy="25"
                            r="6"
                            fill="#FFFFFF"
                            stroke="#EF4444"
                            strokeWidth="2"
                            className="hover:fill-[#EF4444] cursor-crosshair"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setConnectingSource({ nodeId: node.id, handle: 'NO' });
                            }}
                          />
                          <text x="210" y="28" fill="#EF4444" fontSize="9" fontWeight="700" textAnchor="end">
                            NO
                          </text>

                          {/* YES Handle (lower) */}
                          <circle
                            cx="220"
                            cy="55"
                            r="6"
                            fill="#FFFFFF"
                            stroke="#10B981"
                            strokeWidth="2"
                            className="hover:fill-[#10B981] cursor-crosshair"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setConnectingSource({ nodeId: node.id, handle: 'YES' });
                            }}
                          />
                          <text x="210" y="58" fill="#10B981" fontSize="9" fontWeight="700" textAnchor="end">
                            YES
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        )}

        {/* View Mode: OUTLINE (Mobile & Accessibility Alternative) */}
        {viewMode === 'OUTLINE' && (
          <div className="flex-1 bg-white p-6 overflow-y-auto max-w-4xl mx-auto w-full">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">Workflow Outline</h2>
              <p className="text-sm text-slate-500">
                Linear step-by-step structure of your automated workflow. Fully accessible for keyboard navigation and screen readers.
              </p>
            </div>

            <div className="space-y-4">
              {workflow.nodes.map((node, index) => {
                const nodeColor = getNodeColor(node.type);
                const isSelected = selectedNodeId === node.id;
                const outgoingEdges = workflow.edges.filter((e) => e.source === node.id);

                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#4F6BFF] ring-2 ring-[#4F6BFF]/20 bg-indigo-50/20'
                        : 'border-[#E2E8F0] hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: nodeColor.badge }}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 text-sm">
                              {node.label || node.type}
                            </span>
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: `${nodeColor.badge}20`, color: nodeColor.badge }}
                            >
                              {node.type}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{getNodeSubtitle(node)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateNode(node.id);
                          }}
                          title="Duplicate"
                        >
                          <Copy className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNode(node.id);
                          }}
                          className="text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Outgoing Connectors */}
                    {outgoingEdges.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">Next Step:</span>
                        {outgoingEdges.map((edge) => {
                          const target = workflow.nodes.find((n) => n.id === edge.target);
                          return (
                            <span
                              key={edge.id}
                              className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs"
                            >
                              {edge.label && <strong className="text-[#4F6BFF]">{edge.label} →</strong>}
                              {target?.label || target?.type || edge.target}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Node Configuration Drawer (Right Panel) */}
        {selectedNode && (
          <aside className="w-80 bg-white border-l border-[#E2E8F0] p-4 flex flex-col z-20 shadow-lg overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: getNodeColor(selectedNode.type).badge }}
                />
                <h3 className="font-semibold text-slate-900 text-sm">
                  Configure {selectedNode.type}
                </h3>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 flex-1">
              {/* Custom Label */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Node Label
                </label>
                <input
                  type="text"
                  value={selectedNode.label || ''}
                  onChange={(e) =>
                    setWorkflow((prev) => ({
                      ...prev,
                      nodes: prev.nodes.map((n) =>
                        n.id === selectedNode.id ? { ...n, label: e.target.value } : n
                      ),
                    }))
                  }
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF]"
                  placeholder="e.g. Wait for Visit"
                />
              </div>

              {/* Node-specific configurations */}
              {selectedNode.type === 'TRIGGER' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Event Trigger
                  </label>
                  <select
                    value={selectedNode.config.triggerEvent || 'CUSTOMER_VISIT'}
                    onChange={(e) =>
                      handleUpdateNodeConfig(selectedNode.id, { triggerEvent: e.target.value })
                    }
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF] bg-white"
                  >
                    {SUPPORTED_TRIGGERS.map((trig) => (
                      <option key={trig.type} value={trig.type}>
                        {trig.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Workflow initiates whenever this event occurs for a customer.
                  </p>
                </div>
              )}

              {(selectedNode.type === 'CONDITION' || selectedNode.type === 'BRANCH') && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Field
                    </label>
                    <select
                      value={selectedNode.config.field || 'totalVisits'}
                      onChange={(e) =>
                        handleUpdateNodeConfig(selectedNode.id, { field: e.target.value })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF] bg-white"
                    >
                      {CONDITION_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Operator
                    </label>
                    <select
                      value={selectedNode.config.operator || 'GREATER_THAN_OR_EQUAL'}
                      onChange={(e) =>
                        handleUpdateNodeConfig(selectedNode.id, { operator: e.target.value })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF] bg-white"
                    >
                      {OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Value
                    </label>
                    <input
                      type="number"
                      value={selectedNode.config.value ?? 0}
                      onChange={(e) =>
                        handleUpdateNodeConfig(selectedNode.id, { value: Number(e.target.value) })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF]"
                    />
                  </div>
                </div>
              )}

              {selectedNode.type === 'WAIT' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Delay Duration
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={selectedNode.config.duration || 1}
                      onChange={(e) =>
                        handleUpdateNodeConfig(selectedNode.id, { duration: Number(e.target.value) })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Unit
                    </label>
                    <select
                      value={selectedNode.config.unit || 'DAYS'}
                      onChange={(e) =>
                        handleUpdateNodeConfig(selectedNode.id, { unit: e.target.value as WaitTimeUnit })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF] bg-white"
                    >
                      <option value="MINUTES">Minutes</option>
                      <option value="HOURS">Hours</option>
                      <option value="DAYS">Days</option>
                    </select>
                  </div>
                </div>
              )}

              {selectedNode.type === 'ACTION' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Select Campaign
                    </label>
                    <select
                      value={selectedNode.config.campaignId || ''}
                      onChange={(e) =>
                        handleUpdateNodeConfig(selectedNode.id, { campaignId: e.target.value })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF] bg-white"
                    >
                      <option value="">-- Choose Campaign --</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.channel})
                        </option>
                      ))}
                    </select>
                    {!selectedNode.config.campaignId && (
                      <p className="text-[11px] text-amber-600 mt-1">
                        A campaign must be selected before activating this workflow.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cooldown Period (Hours)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={selectedNode.config.cooldownHours ?? 24}
                      onChange={(e) =>
                        handleUpdateNodeConfig(selectedNode.id, {
                          cooldownHours: Number(e.target.value),
                        })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF]"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Prevents messaging the same customer repeatedly within this timeframe.
                    </p>
                  </div>
                </div>
              )}

              {selectedNode.type === 'END' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Terminal Reason
                  </label>
                  <input
                    type="text"
                    value={selectedNode.config.reason || ''}
                    onChange={(e) =>
                      handleUpdateNodeConfig(selectedNode.id, { reason: e.target.value })
                    }
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF]"
                    placeholder="e.g. Completed"
                  />
                </div>
              )}
            </div>

            {/* Delete / Duplicate Node Actions */}
            <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDuplicateNode(selectedNode.id)}
                className="text-xs"
              >
                <Copy className="w-3.5 h-3.5 mr-1" />
                Duplicate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteNode(selectedNode.id)}
                className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </aside>
        )}
      </div>

      {/* Simulation Modal */}
      <Modal
        isOpen={simModalOpen}
        onClose={() => setSimModalOpen(false)}
        title="Workflow Dry-Run Simulator"
      >
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            <strong>Simulation Mode:</strong> Tests your visual workflow conditions, wait steps, and action paths against a real customer profile. No messages are sent to providers.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Test Customer
            </label>
            <select
              value={simCustomerId}
              onChange={(e) => setSimCustomerId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-[#4F6BFF] bg-white"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="primary"
            onClick={handleRunSimulation}
            disabled={simulating || !simCustomerId}
            className="w-full bg-[#4F6BFF] text-white"
          >
            {simulating ? 'Simulating...' : 'Run Dry-Run Simulation'}
          </Button>

          {simResult && (
            <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-900">Simulation Path Result</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    simResult.success
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {simResult.success ? 'PASSED' : 'BLOCKED'}
                </span>
              </div>

              <div className="text-xs text-slate-600">
                <span>Summary: </span>
                <strong className={simResult.success ? 'text-emerald-600' : 'text-slate-600'}>
                  {simResult.summary}
                </strong>
              </div>

              {simResult.waitDurationMinutes > 0 && (
                <div className="text-xs text-slate-600">
                  <span>Scheduled Wait Delay: </span>
                  <strong className="text-amber-600">{simResult.waitDurationMinutes} minutes</strong>
                </div>
              )}

              <div className="text-xs text-slate-600">
                <span>Action Result: </span>
                <strong className={simResult.wouldDispatch ? 'text-indigo-600' : 'text-slate-500'}>
                  {simResult.wouldDispatch ? `Would Dispatch: ${simResult.targetCampaignName || simResult.targetCampaignId}` : 'No Message Dispatched'}
                </strong>
              </div>

              {/* Execution Trace */}
              {simResult.steps && simResult.steps.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-600">Node Execution Trace:</span>
                  <div className="space-y-1">
                    {simResult.steps.map((step, idx) => (
                      <div
                        key={idx}
                        className="text-[11px] font-mono bg-white p-1.5 rounded border border-slate-200 text-slate-700 flex items-center justify-between"
                      >
                        <span>
                          [{step.nodeType}] {step.title}
                        </span>
                        <span className={`text-[10px] font-bold ${step.status === 'PASSED' || step.status === 'MATCHED' || step.status === 'EXECUTED' ? 'text-emerald-600' : 'text-slate-500'}`}>{step.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </Modal>

      {/* Version History Modal */}
      <Modal
        isOpen={versionsModalOpen}
        onClose={() => setVersionsModalOpen(false)}
        title="Workflow Version History"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Immutable version snapshots created each time this workflow is activated. Existing executions remain bound to the version under which they were scheduled.
          </p>

          {versions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No previous activated versions recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">v{ver.version}</span>
                      <span className="text-xs text-slate-500">{ver.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Activated on {new Date(ver.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-mono">
                    {ver.triggerEvent}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Analytics Modal */}
      <Modal
        isOpen={analyticsModalOpen}
        onClose={() => setAnalyticsModalOpen(false)}
        title="Workflow Operational Metrics"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Metrics aggregated strictly from PostgreSQL execution logs, campaign deliveries, and attributed conversions.
          </p>

          {analytics ? (
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3">
                <span className="text-xs text-slate-500">Total Executions</span>
                <p className="text-xl font-bold text-slate-900 mt-1">
                  {analytics.executions?.total ?? 0}
                </p>
                <span className="text-[11px] text-emerald-600">
                  {analytics.executions?.completed ?? 0} completed
                </span>
              </Card>

              <Card className="p-3">
                <span className="text-xs text-slate-500">Messages Delivered</span>
                <p className="text-xl font-bold text-slate-900 mt-1">
                  {analytics.messages?.delivered ?? 0}
                </p>
                <span className="text-[11px] text-indigo-600">
                  {analytics.messages?.engagement ?? 0} engaged
                </span>
              </Card>

              <Card className="p-3">
                <span className="text-xs text-slate-500">Attributed Conversions</span>
                <p className="text-xl font-bold text-slate-900 mt-1">
                  {analytics.conversions?.total ?? 0}
                </p>
              </Card>

              <Card className="p-3">
                <span className="text-xs text-slate-500">Attributed Revenue</span>
                <p className="text-xl font-bold text-slate-900 mt-1">
                  ${analytics.conversions?.revenue?.toFixed(2) ?? '0.00'}
                </p>
              </Card>
            </div>
          ) : (
            <p className="text-center py-6 text-sm text-slate-500">Loading metrics...</p>
          )}
        </div>
      </Modal>
    </div>
  );
};

// UI Helpers
function getNodeColor(type: WorkflowNodeType) {
  switch (type) {
    case 'TRIGGER':
      return { badge: '#6366F1', border: '#C7D2FE', text: '#4338CA' };
    case 'CONDITION':
      return { badge: '#0EA5E9', border: '#BAE6FD', text: '#0369A1' };
    case 'WAIT':
      return { badge: '#F59E0B', border: '#FDE68A', text: '#B45309' };
    case 'ACTION':
      return { badge: '#10B981', border: '#A7F3D0', text: '#047857' };
    case 'BRANCH':
      return { badge: '#8B5CF6', border: '#DDD6FE', text: '#6D28D9' };
    case 'END':
      return { badge: '#64748B', border: '#CBD5E1', text: '#334155' };
    default:
      return { badge: '#94A3B8', border: '#E2E8F0', text: '#475569' };
  }
}

function getNodeSubtitle(node: WorkflowNode): string {
  switch (node.type) {
    case 'TRIGGER':
      return node.config.triggerEvent || 'Event';
    case 'CONDITION':
      return `${node.config.field || 'field'} ${node.config.operator || '='} ${node.config.value ?? ''}`;
    case 'WAIT':
      return `${node.config.duration || 1} ${String(node.config.unit || 'DAYS').toLowerCase()}`;
    case 'ACTION':
      return node.config.campaignId ? 'Campaign Selected' : 'No campaign selected';
    case 'BRANCH':
      return 'If / Else Split';
    case 'END':
      return node.config.reason || 'Terminal State';
    default:
      return '';
  }
}

function truncateText(str: string, maxLen: number) {
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;
}

function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}
