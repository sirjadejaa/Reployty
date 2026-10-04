/**
 * Reployty V2 — Phase 23 Automation Engine & Trigger Processors
 * Business Automations Management View
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Plus,
  Play,
  Pause,
  Eye,
  Trash2,
  CheckCircle,
  AlertCircle,
  Filter,
  Search,
  RefreshCw,
  Send,
  Shield,
  Activity,
  RotateCcw,
  GitBranch,
  Copy,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { MetricCard } from '../../components/ui/MetricCard';
import { useIsMobile } from '../../hooks/useIsMobile';
import { RetentionWorkflowsSection } from './RetentionWorkflowsSection';
import { VisualWorkflowBuilder } from './VisualWorkflowBuilder';
import {
  AutomationRuleItem,
  AutomationExecutionItem,
  RuleStatus,
  SUPPORTED_TRIGGERS,
  CustomerEventType,
} from '../../types/automation';

interface BusinessAutomationsViewProps {
  onNavigate?: (route: string) => void;
}

export const BusinessAutomationsView: React.FC<BusinessAutomationsViewProps> = () => {
  const isMobile = useIsMobile(640);
  const isTablet = useIsMobile(1024);
  const [mainTab, setMainTab] = useState<'AUTOMATIONS' | 'RETENTION'>('AUTOMATIONS');
  const [rules, setRules] = useState<AutomationRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [triggerFilter, setTriggerFilter] = useState<string>('ALL');
  const [visualBuilderRuleId, setVisualBuilderRuleId] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState({
    activeCount: 0,
    totalExecutions: 0,
    completedExecutions: 0,
    skippedExecutions: 0,
  });

  // Selected Rule Detail / Executions
  const [selectedRule, setSelectedRule] = useState<AutomationRuleItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [executions, setExecutions] = useState<AutomationExecutionItem[]>([]);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  const [executionSummary, setExecutionSummary] = useState({
    completed: 0,
    skipped: 0,
    failed: 0,
    processing: 0,
  });

  // Create / Edit Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Available campaigns & branches for forms
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; channel: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone: string }>>([]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    triggerEvent: 'STAMP_ADDED' as CustomerEventType,
    branchId: '',
    campaignId: '',
    cooldownHours: 24,
    maxExecutionsPerCustomer: '' as number | string,
    // Condition builder fields
    hasCondition: false,
    conditionField: 'totalVisits',
    conditionOperator: 'GREATER_THAN_OR_EQUAL',
    conditionValue: '5',
  });

  // Event Simulation Modal
  const [simModalOpen, setSimModalOpen] = useState(false);
  const [simCustomerId, setSimCustomerId] = useState('');
  const [simEventType, setSimEventType] = useState('STAMP_ADDED');
  const [simBranchId, setSimBranchId] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // Fetch Rules
  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (triggerFilter !== 'ALL') {
        params.set('triggerEvent', triggerFilter);
      }

      const res = await fetch(`/api/business/automations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch (err) {
      console.error('Error fetching automations:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, triggerFilter]);

  // Fetch stats & auxiliary data (campaigns, branches, customers)
  const fetchAuxiliaryData = useCallback(async () => {
    try {
      // 1. Fetch campaigns for action config
      const campRes = await fetch('/api/business/campaigns');
      if (campRes.ok) {
        const campData = await campRes.json();
        setCampaigns(campData.campaigns || []);
      }

      // 2. Fetch branches
      const branchRes = await fetch('/api/business/branches');
      if (branchRes.ok) {
        const branchData = await branchRes.json();
        setBranches(branchData.branches || branchData || []);
      }

      // 3. Fetch executions summary
      const execRes = await fetch('/api/business/automations/executions?limit=1');
      if (execRes.ok) {
        const execData = await execRes.json();
        if (execData.summary) {
          setStats((prev) => ({
            ...prev,
            totalExecutions: execData.total || 0,
            completedExecutions: execData.summary.completed || 0,
            skippedExecutions: execData.summary.skipped || 0,
          }));
        }
      }

      // 4. Fetch customers for test simulation
      const custRes = await fetch('/api/business/customers?limit=20');
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData.customers || []);
        if (custData.customers?.length > 0 && !simCustomerId) {
          setSimCustomerId(custData.customers[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching auxiliary data:', err);
    }
  }, [simCustomerId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    fetchAuxiliaryData();
  }, [fetchAuxiliaryData]);

  // Compute active count from rules
  useEffect(() => {
    const active = rules.filter((r) => r.status === RuleStatus.ACTIVE).length;
    setStats((prev) => ({ ...prev, activeCount: active }));
  }, [rules]);

  // Fetch executions for detail modal
  const fetchRuleExecutions = async (ruleId: string) => {
    try {
      setLoadingExecutions(true);
      const res = await fetch(`/api/business/automations/${ruleId}/executions?limit=30`);
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.executions || []);
        if (data.summary) {
          setExecutionSummary(data.summary);
        }
      }
    } catch (err) {
      console.error('Error fetching executions:', err);
    } finally {
      setLoadingExecutions(false);
    }
  };

  // Open detail modal
  const handleOpenDetail = (rule: AutomationRuleItem) => {
    setSelectedRule(rule);
    setDetailModalOpen(true);
    fetchRuleExecutions(rule.id);
  };

  // Status transitions
  const handleStatusChange = async (ruleId: string, action: 'activate' | 'pause' | 'archive') => {
    try {
      const res = await fetch(`/api/business/automations/${ruleId}/${action}`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchRules();
        if (selectedRule && selectedRule.id === ruleId) {
          const updated = await res.json();
          setSelectedRule(updated);
        }
      }
    } catch (err) {
      console.error(`Error transitioning automation to ${action}:`, err);
    }
  };

  // Delete rule
  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('Are you sure you want to delete/archive this automation rule?')) {
      return;
    }
    try {
      const res = await fetch(`/api/business/automations/${ruleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchRules();
        setDetailModalOpen(false);
      }
    } catch (err) {
      console.error('Error deleting automation:', err);
    }
  };

  // Open Create Form
  const handleOpenCreate = () => {
    setEditingRuleId(null);
    setFormData({
      name: '',
      description: '',
      triggerEvent: 'STAMP_ADDED',
      branchId: '',
      campaignId: campaigns.length > 0 ? campaigns[0].id : '',
      cooldownHours: 24,
      maxExecutionsPerCustomer: '',
      hasCondition: false,
      conditionField: 'totalVisits',
      conditionOperator: 'GREATER_THAN_OR_EQUAL',
      conditionValue: '5',
    });
    setFormError(null);
    setCreateModalOpen(true);
  };

  // Open Edit Form
  const handleOpenEdit = (rule: AutomationRuleItem) => {
    setEditingRuleId(rule.id);
    const actionConfig = rule.actionConfig as any;

    let hasCond = false;
    let condField = 'totalVisits';
    let condOp = 'GREATER_THAN_OR_EQUAL';
    let condVal = '5';

    if (rule.conditionConfig?.conditions?.length > 0) {
      hasCond = true;
      const c = rule.conditionConfig.conditions[0];
      condField = c.field || 'totalVisits';
      condOp = c.operator || 'GREATER_THAN_OR_EQUAL';
      condVal = String(c.value ?? '5');
    }

    setFormData({
      name: rule.name,
      description: rule.description || '',
      triggerEvent: rule.triggerEvent,
      branchId: rule.branchId || '',
      campaignId: actionConfig?.campaignId || '',
      cooldownHours: Math.round((rule.cooldownMinutes || 0) / 60) || 24,
      maxExecutionsPerCustomer: rule.maxExecutionsPerCustomer ?? '',
      hasCondition: hasCond,
      conditionField: condField,
      conditionOperator: condOp,
      conditionValue: condVal,
    });
    setFormError(null);
    setCreateModalOpen(true);
  };

  // Submit Create/Edit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError('Automation name is required');
      return;
    }

    if (!formData.campaignId) {
      setFormError('Target campaign is required');
      return;
    }

    setIsSubmitting(true);
    try {
      // Build conditionConfig
      let conditionConfig: any = {};
      if (formData.hasCondition) {
        let parsedVal: any = formData.conditionValue;
        if (!isNaN(Number(formData.conditionValue))) {
          parsedVal = Number(formData.conditionValue);
        }
        conditionConfig = {
          logic: 'AND',
          conditions: [
            {
              field: formData.conditionField,
              operator: formData.conditionOperator,
              value: parsedVal,
            },
          ],
        };
      }

      const payload: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        triggerEvent: formData.triggerEvent,
        branchId: formData.branchId || null,
        actionType: 'SEND_CAMPAIGN',
        actionConfig: {
          campaignId: formData.campaignId,
          cooldownHours: Number(formData.cooldownHours) || 24,
        },
        cooldownMinutes: (Number(formData.cooldownHours) || 0) * 60,
        maxExecutionsPerCustomer: formData.maxExecutionsPerCustomer
          ? Number(formData.maxExecutionsPerCustomer)
          : null,
        conditionConfig,
      };

      const url = editingRuleId
        ? `/api/business/automations/${editingRuleId}`
        : '/api/business/automations';
      const method = editingRuleId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save automation');
      }

      setCreateModalOpen(false);
      fetchRules();
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while saving');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Run Event Simulation
  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimError(null);
    setSimResult(null);

    if (!simCustomerId) {
      setSimError('Customer is required for event simulation');
      return;
    }

    setSimulating(true);
    try {
      const res = await fetch('/api/business/automations/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: simCustomerId,
          eventType: simEventType,
          branchId: simBranchId || undefined,
          metadata: { simulated: true, triggeredBy: 'UI_SIMULATION' },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Simulation trigger failed');
      }
      setSimResult(data);
      fetchRules();
      fetchAuxiliaryData();
    } catch (err: any) {
      setSimError(err.message || 'Simulation error');
    } finally {
      setSimulating(false);
    }
  };

  // Filter rules by search query
  const filteredRules = rules.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q)) ||
      r.triggerEvent.toLowerCase().includes(q)
    );
  });

  const handleCreateVisualWorkflow = async () => {
    try {
      const res = await fetch('/api/business/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Visual Workflow ${rules.length + 1}`,
          triggerEvent: 'CUSTOMER_VISIT',
          actionType: 'SEND_CAMPAIGN',
          actionConfig: { campaignId: campaigns[0]?.id || '' },
        }),
      });
      if (res.ok) {
        const newRule = await res.json();
        setVisualBuilderRuleId(newRule.id);
      }
    } catch (err) {
      console.error('Failed to create visual workflow:', err);
    }
  };

  if (visualBuilderRuleId) {
    return (
      <VisualWorkflowBuilder
        ruleId={visualBuilderRuleId}
        onBack={() => {
          setVisualBuilderRuleId(null);
          fetchRules();
        }}
        onUpdated={fetchRules}
      />
    );
  }

  return (
    <div
      style={{
        padding: isMobile ? '16px 12px calc(var(--mobile-nav-height, 64px) + 24px)' : isTablet ? '20px 20px' : '28px 32px',
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? '16px' : '24px',
        width: '100%',
        boxSizing: 'border-box',
        minWidth: 0,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: isTablet ? 'column' : 'row',
          alignItems: isTablet ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: isMobile ? '12px' : '16px',
          width: '100%',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: isMobile ? '32px' : '36px',
                height: isMobile ? '32px' : '36px',
                borderRadius: '8px',
                backgroundColor: '#EEF2FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4F6BFF',
                flexShrink: 0,
              }}
            >
              <Zap size={isMobile ? 18 : 20} />
            </div>
            <h1
              style={{
                fontSize: isMobile ? '20px' : '24px',
                fontWeight: 700,
                color: '#0F172A',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Automations & Triggers
            </h1>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: isMobile ? '13px' : '14px', color: '#64748B', lineHeight: 1.4 }}>
            Event-driven customer engagement, retention triggers, and automated campaign workflows.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            onClick={() => {
              setSimResult(null);
              setSimError(null);
              setSimModalOpen(true);
            }}
            style={{
              height: '38px',
              padding: isMobile ? '0 10px' : '0 14px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flex: isMobile ? '1 1 auto' : 'none',
              justifyContent: 'center',
            }}
          >
            <Play size={14} className="text-emerald-600" />
            <span>Simulate Event</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleCreateVisualWorkflow}
            style={{
              height: '38px',
              padding: isMobile ? '0 10px' : '0 14px',
              fontSize: '13px',
              borderColor: '#C7D2FE',
              color: '#4F6BFF',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flex: isMobile ? '1 1 auto' : 'none',
              justifyContent: 'center',
            }}
          >
            <GitBranch size={14} />
            <span>Visual Builder</span>
          </Button>

          <Button
            variant="primary"
            onClick={handleOpenCreate}
            style={{
              height: '38px',
              padding: isMobile ? '0 12px' : '0 16px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flex: isMobile ? '1 1 100%' : 'none',
              justifyContent: 'center',
            }}
          >
            <Plus size={16} />
            <span>Create Automation</span>
          </Button>
        </div>
      </div>

      {/* Primary Section Segmented Tabs */}
      <div
        style={{
          display: 'inline-flex',
          padding: '4px',
          backgroundColor: '#F1F5F9',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          width: isMobile ? '100%' : 'fit-content',
          boxSizing: 'border-box',
          gap: '4px',
        }}
      >
        <button
          onClick={() => setMainTab('AUTOMATIONS')}
          style={{
            flex: isMobile ? 1 : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: isMobile ? '8px 10px' : '8px 18px',
            borderRadius: '8px',
            border: 'none',
            fontSize: isMobile ? '12px' : '13px',
            fontWeight: mainTab === 'AUTOMATIONS' ? 600 : 500,
            color: mainTab === 'AUTOMATIONS' ? '#0F172A' : '#64748B',
            backgroundColor: mainTab === 'AUTOMATIONS' ? '#FFFFFF' : 'transparent',
            boxShadow: mainTab === 'AUTOMATIONS' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <Zap size={14} color={mainTab === 'AUTOMATIONS' ? '#4F6BFF' : '#64748B'} />
          <span>Event Automations</span>
        </button>
        <button
          onClick={() => setMainTab('RETENTION')}
          style={{
            flex: isMobile ? 1 : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: isMobile ? '8px 10px' : '8px 18px',
            borderRadius: '8px',
            border: 'none',
            fontSize: isMobile ? '12px' : '13px',
            fontWeight: mainTab === 'RETENTION' ? 600 : 500,
            color: mainTab === 'RETENTION' ? '#0F172A' : '#64748B',
            backgroundColor: mainTab === 'RETENTION' ? '#FFFFFF' : 'transparent',
            boxShadow: mainTab === 'RETENTION' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <RotateCcw size={14} color={mainTab === 'RETENTION' ? '#4F6BFF' : '#64748B'} />
          <span>Retention Workflows</span>
        </button>
      </div>

      {mainTab === 'RETENTION' ? (
        <RetentionWorkflowsSection />
      ) : (
        <>
          {/* Metric Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
              gap: isMobile ? '10px' : '16px',
              width: '100%',
            }}
          >
            <MetricCard
              label="Active Automations"
              value={stats.activeCount}
              icon={<Zap className="h-5 w-5 text-emerald-600" />}
            />
            <MetricCard
              label="Total Executions"
              value={stats.totalExecutions}
              icon={<Activity className="h-5 w-5 text-brand-600" />}
            />
            <MetricCard
              label="Delivered / Completed"
              value={stats.completedExecutions}
              icon={<CheckCircle className="h-5 w-5 text-blue-600" />}
            />
            <MetricCard
              label="Suppressed / Skipped"
              value={stats.skippedExecutions}
              icon={<Shield className="h-5 w-5 text-amber-600" />}
            />
          </div>

          {/* Filter Bar */}
          <div
            style={{
              padding: isMobile ? '14px 16px' : '16px 20px',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: isTablet ? 'column' : 'row',
                alignItems: isTablet ? 'stretch' : 'center',
                justifyContent: 'space-between',
                gap: '12px',
                width: '100%',
              }}
            >
              {/* Search */}
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94A3B8',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search automations by name, trigger or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    paddingLeft: '38px',
                    paddingRight: '12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box',
                    backgroundColor: '#FFFFFF',
                  }}
                />
              </div>

              {/* Status and Trigger Filters */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    height: '38px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    fontSize: '13px',
                    color: '#334155',
                    fontWeight: 500,
                    cursor: 'pointer',
                    outline: 'none',
                    flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </select>

                <select
                  value={triggerFilter}
                  onChange={(e) => setTriggerFilter(e.target.value)}
                  style={{
                    height: '38px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    fontSize: '13px',
                    color: '#334155',
                    fontWeight: 500,
                    cursor: 'pointer',
                    outline: 'none',
                    flex: isMobile ? '1 1 calc(50% - 4px)' : 'none',
                  }}
                >
                  <option value="ALL">All Triggers</option>
                  {SUPPORTED_TRIGGERS.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchRules}
                  style={{
                    height: '38px',
                    width: '38px',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  title="Refresh automations"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </Button>
              </div>
            </div>
          </div>

          {/* Automations Table / List Container */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              width: '100%',
            }}
          >
            {loading ? (
              <div style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>
                <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 8px', color: '#4F6BFF' }} />
                <p style={{ fontSize: '13px', margin: 0 }}>Loading automations...</p>
              </div>
            ) : filteredRules.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: '#F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    color: '#94A3B8',
                  }}
                >
                  <Zap size={24} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: '0 0 6px 0' }}>
                  No Automations Found
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '380px', margin: '0 auto 16px', lineHeight: 1.5 }}>
                  Get started by creating your first event-driven automation rule to engage customers.
                </p>
                <Button variant="primary" size="sm" onClick={handleOpenCreate}>
                  <Plus size={14} style={{ marginRight: '6px' }} /> Create Automation
                </Button>
              </div>
            ) : isMobile ? (
              /* Mobile Card View */
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredRules.map((rule, idx) => {
                  const actionConfig = rule.actionConfig as any;
                  const targetCamp = campaigns.find((c) => c.id === actionConfig?.campaignId);

                  return (
                    <div
                      key={rule.id}
                      style={{
                        padding: '16px',
                        borderTop: idx > 0 ? '1px solid #F1F5F9' : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                        <div>
                          <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', margin: 0 }}>{rule.name}</h4>
                          {rule.description && (
                            <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0', lineHeight: 1.3 }}>
                              {rule.description}
                            </p>
                          )}
                        </div>
                        <StatusBadge status={rule.status.toLowerCase()} label={rule.status} />
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '8px',
                          fontSize: '12px',
                          color: '#475569',
                          backgroundColor: '#F8FAFC',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #F1F5F9',
                        }}
                      >
                        <div>
                          <span style={{ color: '#94A3B8', fontSize: '11px', display: 'block' }}>When Trigger:</span>
                          <span style={{ fontWeight: 600, color: '#0F172A' }}>{rule.triggerEvent}</span>
                        </div>
                        <div>
                          <span style={{ color: '#94A3B8', fontSize: '11px', display: 'block' }}>Action Campaign:</span>
                          <span style={{ fontWeight: 600, color: '#0F172A' }}>
                            {targetCamp ? targetCamp.name : 'Send Campaign'}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#94A3B8', fontSize: '11px', display: 'block' }}>Branch Scope:</span>
                          <span>{rule.branch ? rule.branch.name : 'Business-wide'}</span>
                        </div>
                        <div>
                          <span style={{ color: '#94A3B8', fontSize: '11px', display: 'block' }}>Executions:</span>
                          <span style={{ fontWeight: 700, color: '#4F6BFF' }}>
                            {rule._count?.executions || 0}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap', paddingTop: '4px' }}>
                        {rule.status === RuleStatus.ACTIVE && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusChange(rule.id, 'pause')}
                            style={{ fontSize: '12px', height: '32px', padding: '0 10px' }}
                          >
                            <Pause size={13} className="text-amber-600" style={{ marginRight: '4px' }} /> Pause
                          </Button>
                        )}
                        {(rule.status === RuleStatus.DRAFT || rule.status === RuleStatus.PAUSED) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusChange(rule.id, 'activate')}
                            style={{ fontSize: '12px', height: '32px', padding: '0 10px' }}
                          >
                            <Play size={13} className="text-emerald-600" style={{ marginRight: '4px' }} /> Activate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setVisualBuilderRuleId(rule.id)}
                          style={{ fontSize: '12px', height: '32px', padding: '0 10px', color: '#4F6BFF', borderColor: '#C7D2FE' }}
                        >
                          <GitBranch size={13} style={{ marginRight: '4px' }} /> Builder
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenDetail(rule)}
                          style={{ fontSize: '12px', height: '32px', padding: '0 10px' }}
                        >
                          <Eye size={13} style={{ marginRight: '4px' }} /> View
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Desktop / Tablet Table View */
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderBottom: '1px solid #E2E8F0',
                        color: '#64748B',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <th style={{ padding: '12px 18px' }}>Automation Rule</th>
                      <th style={{ padding: '12px 18px' }}>When (Trigger)</th>
                      <th style={{ padding: '12px 18px' }}>Conditions</th>
                      <th style={{ padding: '12px 18px' }}>Then (Action)</th>
                      <th style={{ padding: '12px 18px' }}>Branch Scope</th>
                      <th style={{ padding: '12px 18px' }}>Status</th>
                      <th style={{ padding: '12px 18px', textAlign: 'center' }}>Executions</th>
                      <th style={{ padding: '12px 18px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRules.map((rule) => {
                      const actionConfig = rule.actionConfig as any;
                      const targetCamp = campaigns.find((c) => c.id === actionConfig?.campaignId);
                      const hasCond = rule.conditionConfig?.conditions?.length > 0;
                      const firstCond = hasCond ? rule.conditionConfig.conditions[0] : null;

                      return (
                        <tr
                          key={rule.id}
                          style={{
                            borderBottom: '1px solid #F1F5F9',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ fontWeight: 600, color: '#0F172A' }}>{rule.name}</div>
                            {rule.description && (
                              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {rule.description}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '3px 8px',
                                borderRadius: '9999px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: '#F3E8FF',
                                color: '#7E22CE',
                                border: '1px solid #E9D5FF',
                              }}
                            >
                              {rule.triggerEvent}
                            </span>
                          </td>
                          <td style={{ padding: '14px 18px', fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' }}>
                            {firstCond ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontFamily: 'monospace',
                                  backgroundColor: '#F1F5F9',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  color: '#334155',
                                  fontSize: '11px',
                                }}
                              >
                                {firstCond.field} {firstCond.operator} {String(firstCond.value)}
                              </span>
                            ) : (
                              <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Always qualify</span>
                            )}
                          </td>
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ fontWeight: 500, color: '#1E293B' }}>
                              {targetCamp ? targetCamp.name : 'Trigger Campaign'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                              Cooldown: {Math.round((rule.cooldownMinutes || 0) / 60)}h
                            </div>
                          </td>
                          <td style={{ padding: '14px 18px', fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' }}>
                            {rule.branch ? (
                              <span style={{ fontWeight: 500, color: '#1E293B' }}>{rule.branch.name}</span>
                            ) : (
                              <span style={{ color: '#94A3B8' }}>Business-wide</span>
                            )}
                          </td>
                          <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                            <StatusBadge
                              status={rule.status.toLowerCase()}
                              label={rule.status}
                            />
                          </td>
                          <td style={{ padding: '14px 18px', textAlign: 'center', fontWeight: 700, color: '#4F6BFF' }}>
                            {rule._count?.executions || 0}
                          </td>
                          <td style={{ padding: '14px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {rule.status === RuleStatus.ACTIVE && (
                                <button
                                  onClick={() => handleStatusChange(rule.id, 'pause')}
                                  title="Pause"
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '6px',
                                    border: '1px solid #E2E8F0',
                                    backgroundColor: '#FFFFFF',
                                    color: '#D97706',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FEF3C7')}
                                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                                >
                                  <Pause size={14} />
                                </button>
                              )}
                              {(rule.status === RuleStatus.DRAFT ||
                                rule.status === RuleStatus.PAUSED) && (
                                <button
                                  onClick={() => handleStatusChange(rule.id, 'activate')}
                                  title="Activate"
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '6px',
                                    border: '1px solid #E2E8F0',
                                    backgroundColor: '#FFFFFF',
                                    color: '#059669',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#D1FAE5')}
                                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                                >
                                  <Play size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => setVisualBuilderRuleId(rule.id)}
                                title="Visual Workflow Builder"
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '6px',
                                  border: '1px solid #C7D2FE',
                                  backgroundColor: '#FFFFFF',
                                  color: '#4F6BFF',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#EEF2FF')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                              >
                                <GitBranch size={14} />
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/business/automations/${rule.id}/duplicate`, { method: 'POST' });
                                    if (res.ok) {
                                      fetchRules();
                                    }
                                  } catch (err) {
                                    console.error(err);
                                  }
                                }}
                                title="Duplicate Workflow"
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '6px',
                                  border: '1px solid #E2E8F0',
                                  backgroundColor: '#FFFFFF',
                                  color: '#64748B',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                onClick={() => handleOpenDetail(rule)}
                                title="View Executions"
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '6px',
                                  border: '1px solid #E2E8F0',
                                  backgroundColor: '#FFFFFF',
                                  color: '#64748B',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                              >
                                <Eye size={14} />
                              </button>

                              {rule.status !== RuleStatus.ARCHIVED && (
                                <button
                                  onClick={() => handleDeleteRule(rule.id)}
                                  title="Delete / Archive"
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '6px',
                                    border: '1px solid #FEE2E2',
                                    backgroundColor: '#FFFFFF',
                                    color: '#DC2626',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FEF2F2')}
                                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Structured Create / Edit Modal (Section 31 & 32: No drag-and-drop!) */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={editingRuleId ? 'Edit Automation Rule' : 'Create Automation Rule'}
      >
        <form onSubmit={handleSubmitForm} className="space-y-4 max-h-[75vh] overflow-y-auto px-1">
          {formError && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Automation Name <span className="text-rose-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. VIP Visit Milestone Reward"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Description (Optional)
            </label>
            <Input
              type="text"
              placeholder="Brief description of this workflow"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                When (Event Trigger) <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.triggerEvent}
                onChange={(e) =>
                  setFormData({ ...formData, triggerEvent: e.target.value as CustomerEventType })
                }
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
              >
                {SUPPORTED_TRIGGERS.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Branch Scope
              </label>
              <select
                value={formData.branchId}
                onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
              >
                <option value="">Business-wide (All Branches)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Condition Section */}
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200/75 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-brand-600" />
                Condition Rule (IF)
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.hasCondition}
                  onChange={(e) => setFormData({ ...formData, hasCondition: e.target.checked })}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                Apply Condition
              </label>
            </div>

            {formData.hasCondition && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">Customer Field</label>
                  <select
                    value={formData.conditionField}
                    onChange={(e) => setFormData({ ...formData, conditionField: e.target.value })}
                    className="border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                  >
                    <option value="totalVisits">Total Visits</option>
                    <option value="stampsBalance">Stamps Balance</option>
                    <option value="pointsBalance">Points Balance</option>
                    <option value="daysSinceLastVisit">Days Since Last Visit</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">Operator</label>
                  <select
                    value={formData.conditionOperator}
                    onChange={(e) =>
                      setFormData({ ...formData, conditionOperator: e.target.value })
                    }
                    className="border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                  >
                    <option value="GREATER_THAN_OR_EQUAL">&gt;= (Greater or Equal)</option>
                    <option value="GREATER_THAN">&gt; (Greater Than)</option>
                    <option value="EQUALS">== (Equals)</option>
                    <option value="LESS_THAN_OR_EQUAL">&lt;= (Less or Equal)</option>
                    <option value="LESS_THAN">&lt; (Less Than)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">Value</label>
                  <Input
                    type="text"
                    value={formData.conditionValue}
                    onChange={(e) => setFormData({ ...formData, conditionValue: e.target.value })}
                    className="text-xs"
                    required
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Section */}
          <div className="p-3 bg-brand-50/50 rounded-lg border border-brand-100 space-y-2">
            <label className="text-xs font-semibold text-brand-900 flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5 text-brand-600" />
              Action: Trigger Campaign (THEN)
            </label>
            <div>
              <label className="block text-[11px] text-gray-600 mb-1">
                Select Target Campaign <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.campaignId}
                onChange={(e) => setFormData({ ...formData, campaignId: e.target.value })}
                required
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
              >
                <option value="">-- Choose Campaign --</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.channel})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Policy & Safeguards */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Execution Cooldown (Hours)
              </label>
              <Input
                type="number"
                min="0"
                value={formData.cooldownHours}
                onChange={(e) => setFormData({ ...formData, cooldownHours: Number(e.target.value) })}
              />
              <span className="text-[10px] text-gray-400">Min time between triggers per customer</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Max Executions Per Customer
              </label>
              <Input
                type="number"
                min="1"
                placeholder="Unlimited"
                value={formData.maxExecutionsPerCustomer}
                onChange={(e) =>
                  setFormData({ ...formData, maxExecutionsPerCustomer: e.target.value })
                }
              />
              <span className="text-[10px] text-gray-400">Optional lifetime limit per customer</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingRuleId ? 'Update Rule' : 'Save Automation'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Automation Detail & Executions History Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={selectedRule ? selectedRule.name : 'Automation Details'}
      >
        {selectedRule && (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto px-1">
            {/* Header info */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <span className="text-xs text-gray-400 block">Trigger Event</span>
                <span className="font-semibold text-sm text-gray-900">
                  {selectedRule.triggerEvent}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Scope</span>
                <span className="font-medium text-sm text-gray-800">
                  {selectedRule.branch ? selectedRule.branch.name : 'Business-wide'}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-400 block">Status</span>
                <StatusBadge
                  status={selectedRule.status.toLowerCase()}
                  label={selectedRule.status}
                />
              </div>
            </div>

            {/* Execution summary metrics */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 bg-emerald-50 text-emerald-800 rounded">
                <div className="font-bold text-sm">{executionSummary.completed}</div>
                <div>Completed</div>
              </div>
              <div className="p-2 bg-amber-50 text-amber-800 rounded">
                <div className="font-bold text-sm">{executionSummary.skipped}</div>
                <div>Skipped</div>
              </div>
              <div className="p-2 bg-rose-50 text-rose-800 rounded">
                <div className="font-bold text-sm">{executionSummary.failed}</div>
                <div>Failed</div>
              </div>
              <div className="p-2 bg-blue-50 text-blue-800 rounded">
                <div className="font-bold text-sm">{executionSummary.processing}</div>
                <div>Processing</div>
              </div>
            </div>

            {/* Executions log table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-gray-800 uppercase tracking-wider">
                  Recent Executions History
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fetchRuleExecutions(selectedRule.id)}
                  className="text-xs py-1"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>

              {loadingExecutions ? (
                <div className="p-6 text-center text-xs text-gray-500">
                  Loading executions...
                </div>
              ) : executions.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400 bg-gray-50 rounded-lg">
                  No executions recorded for this rule yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg max-h-60 overflow-y-auto">
                  {executions.map((ex) => (
                    <div
                      key={ex.id}
                      className="p-2.5 flex items-center justify-between text-xs hover:bg-gray-50"
                    >
                      <div>
                        <div className="font-medium text-gray-800">
                          {ex.customer ? ex.customer.name : 'Customer'} ({ex.customer?.phone})
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {new Date(ex.executedAt).toLocaleString()}
                        </div>
                      </div>

                      <div className="text-right">
                        <StatusBadge
                          status={ex.status.toLowerCase()}
                          label={ex.status}
                          className="text-[11px]"
                        />
                        {ex.skipReason && (
                          <div className="text-[10px] text-amber-600 font-mono mt-0.5">
                            {ex.skipReason}
                          </div>
                        )}
                        {ex.lastError && (
                          <div className="text-[10px] text-rose-600 font-mono mt-0.5">
                            {ex.lastError}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDetailModalOpen(false);
                  handleOpenEdit(selectedRule);
                }}
              >
                Edit Automation
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDetailModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Event Simulation Modal */}
      <Modal
        isOpen={simModalOpen}
        onClose={() => setSimModalOpen(false)}
        title="Simulate Event Trigger"
      >
        <form onSubmit={handleRunSimulation} className="space-y-4">
          <p className="text-xs text-gray-500">
            Dispatch a test event to verify automation condition matching, idempotency, and Phase 22 delivery queueing.
          </p>

          {simError && (
            <div className="p-2.5 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
              {simError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Select Customer <span className="text-rose-500">*</span>
            </label>
            <select
              value={simCustomerId}
              onChange={(e) => setSimCustomerId(e.target.value)}
              required
              className="border border-gray-200 rounded-lg py-2 px-3 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Event Type
              </label>
              <select
                value={simEventType}
                onChange={(e) => setSimEventType(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
              >
                {SUPPORTED_TRIGGERS.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Branch Scope
              </label>
              <select
                value={simBranchId}
                onChange={(e) => setSimBranchId(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
              >
                <option value="">Default Customer Branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {simResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                Event Processed Successfully
              </div>
              <div className="text-emerald-700">
                Matched Rules: <span className="font-bold">{simResult.matchedRulesCount}</span>
              </div>
              {simResult.executions?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {simResult.executions.map((ex: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-1.5 bg-white/75 rounded border border-emerald-100 flex items-center justify-between font-mono text-[11px]"
                    >
                      <span>Execution #{idx + 1}</span>
                      <span className="font-bold text-gray-800">{ex.status}</span>
                      {ex.skipReason && (
                        <span className="text-amber-600">({ex.skipReason})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSimModalOpen(false)}
            >
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={simulating}>
              {simulating ? 'Processing...' : 'Dispatch Event'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
