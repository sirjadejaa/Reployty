/**
 * Reployty V2 — Phase 24 Retention Workflows Section
 * Inactivity, Win-Back, Birthday & Time-based Retention UI
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Gift,
  RotateCcw,
  Sparkles,
  Plus,
  Play,
  Pause,
  Eye,
  Trash2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { MetricCard } from '../../components/ui/MetricCard';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  RetentionWorkflowType,
  RetentionWorkflowTemplate,
  RetentionPreviewResult,
  RetentionSimulationResult,
  RETENTION_TEMPLATES,
} from '../../types/retention';
import { RuleStatus } from '../../types/automation';

export const RetentionWorkflowsSection: React.FC = () => {
  const isMobile = useIsMobile(640);
  const isTablet = useIsMobile(1024);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Auxiliary data
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; channel: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone: string }>>([]);

  // Stats
  const [stats, setStats] = useState({
    activeCount: 0,
    inactivityCount: 0,
    winbackCount: 0,
    birthdayCount: 0,
  });

  // Create / Edit Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    workflowType: 'INACTIVITY' as RetentionWorkflowType,
    inactivityDays: 30,
    includeNeverVisited: false,
    winBackThresholdDays: 90,
    daysBefore: 0,
    leapYearFeb29Policy: 'FEB_28' as 'FEB_28' | 'MAR_1',
    branchId: '',
    campaignId: '',
    cooldownDays: 14,
    maxExecutionsPerCustomer: 1 as number | string,
  });

  // Preview State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<RetentionPreviewResult | null>(null);

  // Simulation State
  const [simModalOpen, setSimModalOpen] = useState(false);
  const [simWorkflow, setSimWorkflow] = useState<any | null>(null);
  const [simCustomerId, setSimCustomerId] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<RetentionSimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  // Manual Processing Trigger State
  const [processingBatch, setProcessingBatch] = useState(false);
  const [processResult, setProcessResult] = useState<any | null>(null);

  // Fetch Workflows
  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter !== 'ALL') {
        params.set('workflowType', typeFilter);
      }
      const res = await fetch(`/api/business/retention/workflows?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.items || []);
        
        // Calculate counts
        const items = data.items || [];
        setStats({
          activeCount: items.filter((w: any) => w.status === 'ACTIVE').length,
          inactivityCount: items.filter((w: any) => w.workflowType === 'INACTIVITY').length,
          winbackCount: items.filter((w: any) => w.workflowType === 'WIN_BACK').length,
          birthdayCount: items.filter((w: any) => w.workflowType === 'BIRTHDAY').length,
        });
      }
    } catch (err) {
      console.error('Error fetching retention workflows:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  // Fetch auxiliary data
  const fetchAuxiliary = useCallback(async () => {
    try {
      const [campRes, branchRes, custRes] = await Promise.all([
        fetch('/api/business/campaigns'),
        fetch('/api/business/branches'),
        fetch('/api/business/customers?limit=20'),
      ]);

      if (campRes.ok) {
        const campData = await campRes.json();
        setCampaigns(campData.campaigns || []);
      }
      if (branchRes.ok) {
        const branchData = await branchRes.json();
        setBranches(branchData.branches || branchData || []);
      }
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
    fetchWorkflows();
  }, [fetchWorkflows]);

  useEffect(() => {
    fetchAuxiliary();
  }, [fetchAuxiliary]);

  // Handle open create modal
  const handleOpenCreate = () => {
    setEditingWorkflowId(null);
    setFormError(null);
    setFormData({
      name: '',
      description: '',
      workflowType: 'INACTIVITY',
      inactivityDays: 30,
      includeNeverVisited: false,
      winBackThresholdDays: 90,
      daysBefore: 0,
      leapYearFeb29Policy: 'FEB_28',
      branchId: '',
      campaignId: campaigns[0]?.id || '',
      cooldownDays: 14,
      maxExecutionsPerCustomer: 1,
    });
    setCreateModalOpen(true);
  };

  // Pre-fill from template
  const handleUseTemplate = (template: RetentionWorkflowTemplate) => {
    setEditingWorkflowId(null);
    setFormError(null);
    setFormData({
      name: template.name,
      description: template.description,
      workflowType: template.workflowType,
      inactivityDays: template.defaultConfig.inactivityDays ?? 30,
      includeNeverVisited: false,
      winBackThresholdDays: template.defaultConfig.winBackThresholdDays ?? 90,
      daysBefore: template.defaultConfig.daysBefore ?? 0,
      leapYearFeb29Policy: template.defaultConfig.leapYearFeb29Policy ?? 'FEB_28',
      branchId: '',
      campaignId: campaigns[0]?.id || '',
      cooldownDays: template.defaultConfig.cooldownDays ?? 14,
      maxExecutionsPerCustomer: template.defaultConfig.maxExecutionsPerCustomer ?? 1,
    });
    setCreateModalOpen(true);
  };

  // Handle open edit
  const handleOpenEdit = (wf: any) => {
    setEditingWorkflowId(wf.id);
    setFormError(null);
    const config = wf.retentionConfig || {};
    setFormData({
      name: wf.name,
      description: wf.description || '',
      workflowType: wf.workflowType,
      inactivityDays: config.inactivityDays ?? 30,
      includeNeverVisited: Boolean(config.includeNeverVisited),
      winBackThresholdDays: config.winBackThresholdDays ?? 90,
      daysBefore: config.daysBefore ?? 0,
      leapYearFeb29Policy: config.leapYearFeb29Policy ?? 'FEB_28',
      branchId: wf.branchId || '',
      campaignId: config.campaignId || '',
      cooldownDays: Math.floor((wf.cooldownMinutes || 0) / (24 * 60)) || 14,
      maxExecutionsPerCustomer: wf.maxExecutionsPerCustomer ?? 1,
    });
    setCreateModalOpen(true);
  };

  // Save workflow
  const handleSaveWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Workflow name is required');
      return;
    }
    if (!formData.campaignId) {
      setFormError('Please select a campaign to send');
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      const payload: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        workflowType: formData.workflowType,
        branchId: formData.branchId || null,
        campaignId: formData.campaignId,
        cooldownDays: Number(formData.cooldownDays) || 0,
        maxExecutionsPerCustomer: formData.maxExecutionsPerCustomer ? Number(formData.maxExecutionsPerCustomer) : null,
        config: {
          campaignId: formData.campaignId,
        },
      };

      if (formData.workflowType === 'INACTIVITY') {
        payload.config.inactivityDays = Number(formData.inactivityDays);
        payload.config.includeNeverVisited = formData.includeNeverVisited;
      } else if (formData.workflowType === 'WIN_BACK') {
        payload.config.winBackThresholdDays = Number(formData.winBackThresholdDays);
      } else if (formData.workflowType === 'BIRTHDAY') {
        payload.config.daysBefore = Number(formData.daysBefore);
        payload.config.leapYearFeb29Policy = formData.leapYearFeb29Policy;
      }

      const url = editingWorkflowId
        ? `/api/business/retention/workflows/${editingWorkflowId}`
        : '/api/business/retention/workflows';
      const method = editingWorkflowId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save retention workflow');
      }

      setCreateModalOpen(false);
      fetchWorkflows();
    } catch (err: any) {
      setFormError(err.message || 'Error saving workflow');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status transitions
  const handleStatusChange = async (ruleId: string, action: 'activate' | 'pause' | 'archive') => {
    try {
      const res = await fetch(`/api/business/retention/workflows/${ruleId}/${action}`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchWorkflows();
      }
    } catch (err) {
      console.error(`Error transitioning workflow to ${action}:`, err);
    }
  };

  // Preview eligibility
  const handleOpenPreview = async (wf: any) => {
    try {
      setPreviewLoading(true);
      setPreviewModalOpen(true);
      setPreviewData(null);

      const config = wf.retentionConfig || {};
      const res = await fetch('/api/business/retention/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowType: wf.workflowType,
          inactivityDays: config.inactivityDays,
          winBackThresholdDays: config.winBackThresholdDays,
          daysBefore: config.daysBefore,
          includeNeverVisited: config.includeNeverVisited,
          branchId: wf.branchId,
          campaignId: config.campaignId,
          leapYearFeb29Policy: config.leapYearFeb29Policy,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
      }
    } catch (err) {
      console.error('Error previewing retention workflow:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Open test simulation
  const handleOpenSim = (wf: any) => {
    setSimWorkflow(wf);
    setSimResult(null);
    setSimError(null);
    setSimModalOpen(true);
  };

  // Run test simulation
  const handleRunSimulation = async () => {
    if (!simWorkflow) return;
    try {
      setSimulating(true);
      setSimError(null);
      const res = await fetch('/api/business/retention/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId: simWorkflow.id,
          customerId: simCustomerId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Simulation failed');
      }
      setSimResult(data);
    } catch (err: any) {
      setSimError(err.message || 'Simulation error');
    } finally {
      setSimulating(false);
    }
  };

  // Manual Trigger: Process Time-based Retention
  const handleProcessRetention = async () => {
    try {
      setProcessingBatch(true);
      setProcessResult(null);
      const res = await fetch('/api/business/retention/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      });
      const data = await res.json();
      setProcessResult(data);
      fetchWorkflows();
    } catch (err) {
      console.error('Error running retention processor:', err);
    } finally {
      setProcessingBatch(false);
    }
  };

  // Filter workflows by search query
  const filteredWorkflows = workflows.filter((w) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      w.name.toLowerCase().includes(q) ||
      (w.description && w.description.toLowerCase().includes(q)) ||
      w.workflowType.toLowerCase().includes(q)
    );
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? '16px' : '22px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Controls & Retention Processor Trigger */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-surface, #ffffff)',
          border: '1px solid var(--color-border-subtle, #E5E7EB)',
          borderRadius: '12px',
          padding: isMobile ? '14px 16px' : '18px 22px',
          display: 'flex',
          flexDirection: isTablet ? 'column' : 'row',
          alignItems: isTablet ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: 700,
              color: 'var(--color-text-primary, #111827)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              margin: 0,
            }}
          >
            <RotateCcw className="h-5 w-5" style={{ color: '#4F6BFF', flexShrink: 0 }} />
            Automated Retention Workflows
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-text-muted, #6B7280)',
              margin: '4px 0 0 0',
              lineHeight: 1.4,
            }}
          >
            Recover inactive regulars, engage churned customers, and celebrate birthdays automatically.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleProcessRetention}
            disabled={processingBatch}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${processingBatch ? 'animate-spin' : ''}`} style={{ color: '#4F6BFF' }} />}
          >
            {processingBatch ? 'Processing...' : 'Run Processor Now'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreate}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Create Workflow
          </Button>
        </div>
      </div>

      {/* Batch Process Result Banner */}
      {processResult && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            color: '#166534',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <CheckCircle className="h-4 w-4" style={{ color: '#16A34A', flexShrink: 0 }} />
            <span>
              Processor completed: <strong>{processResult.processedRulesCount}</strong> rules checked,{' '}
              <strong>{processResult.totalExecutionsCreated}</strong> executions created,{' '}
              <strong>{processResult.totalExecutionsCompleted}</strong> delivered,{' '}
              <strong>{processResult.totalExecutionsSkipped}</strong> skipped.
            </span>
          </div>
          <button
            onClick={() => setProcessResult(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#16A34A',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Metrics Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isMobile ? '10px' : '16px',
          width: '100%',
        }}
      >
        <MetricCard
          label="Active Workflows"
          value={stats.activeCount}
          icon={<RotateCcw className="h-5 w-5" style={{ color: '#16A34A' }} />}
        />
        <MetricCard
          label="Inactivity Rules"
          value={stats.inactivityCount}
          icon={<Clock className="h-5 w-5" style={{ color: '#D97706' }} />}
        />
        <MetricCard
          label="Win-Back Rules"
          value={stats.winbackCount}
          icon={<Sparkles className="h-5 w-5" style={{ color: '#7C3AED' }} />}
        />
        <MetricCard
          label="Birthday Rules"
          value={stats.birthdayCount}
          icon={<Gift className="h-5 w-5" style={{ color: '#DB2777' }} />}
        />
      </div>

      {/* Predefined Templates Section */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-surface, #ffffff)',
          border: '1px solid var(--color-border-subtle, #E5E7EB)',
          borderRadius: '12px',
          padding: isMobile ? '14px 16px' : '18px 22px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles className="h-4 w-4" style={{ color: '#4F6BFF' }} />
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary, #111827)', margin: 0 }}>
              Predefined Retention Templates
            </h3>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #6B7280)' }}>
            Quick-start structured workflows
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isTablet ? '1fr' : 'repeat(3, 1fr)',
            gap: '12px',
          }}
        >
          {RETENTION_TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              style={{
                backgroundColor: 'var(--color-bg-surface, #ffffff)',
                padding: '14px 16px',
                borderRadius: '10px',
                border: '1px solid var(--color-border-subtle, #E5E7EB)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>
                    {tmpl.name}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                      backgroundColor:
                        tmpl.workflowType === 'INACTIVITY'
                          ? '#FEF3C7'
                          : tmpl.workflowType === 'WIN_BACK'
                          ? '#F3E8FF'
                          : '#FCE7F3',
                      color:
                        tmpl.workflowType === 'INACTIVITY'
                          ? '#92400E'
                          : tmpl.workflowType === 'WIN_BACK'
                          ? '#6B21A8'
                          : '#9D174D',
                    }}
                  >
                    {tmpl.workflowType}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted, #6B7280)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                  {tmpl.description}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUseTemplate(tmpl)}
                style={{ width: '100%', fontSize: '12px' }}
                leftIcon={<Plus className="h-3 w-3" style={{ color: '#4F6BFF' }} />}
              >
                Use Template
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Filter and Search Bar Card */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-surface, #ffffff)',
          border: '1px solid var(--color-border-subtle, #E5E7EB)',
          borderRadius: '12px',
          padding: isMobile ? '12px 14px' : '16px 20px',
          display: 'flex',
          flexDirection: isTablet ? 'column' : 'row',
          alignItems: isTablet ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: isMobile ? '4px' : '0',
            scrollbarWidth: 'none',
          }}
        >
          {['ALL', 'INACTIVITY', 'WIN_BACK', 'BIRTHDAY'].map((tab) => {
            const isActive = typeFilter === tab;
            return (
              <button
                key={tab}
                onClick={() => setTypeFilter(tab)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive ? 'var(--color-primary, #4F6BFF)' : 'var(--color-bg-subtle, #F3F4F6)',
                  color: isActive ? '#ffffff' : 'var(--color-text-muted, #6B7280)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {tab === 'ALL'
                  ? 'All Types'
                  : tab === 'INACTIVITY'
                  ? 'Inactivity'
                  : tab === 'WIN_BACK'
                  ? 'Win-Back'
                  : 'Birthday'}
              </button>
            );
          })}
        </div>

        <div style={{ width: isTablet ? '100%' : '260px', flexShrink: 0 }}>
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Workflows List Card */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-surface, #ffffff)',
          border: '1px solid var(--color-border-subtle, #E5E7EB)',
          borderRadius: '12px',
          padding: isMobile ? '14px' : '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--color-text-muted, #6B7280)', fontSize: '13px' }}>
            <RefreshCw className="h-6 w-6 animate-spin" style={{ margin: '0 auto 8px auto', color: '#4F6BFF' }} />
            <p style={{ margin: 0 }}>Loading retention workflows...</p>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--color-text-muted, #6B7280)' }}>
            <RotateCcw className="h-10 w-10" style={{ margin: '0 auto 12px auto', opacity: 0.35 }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary, #111827)', margin: '0 0 6px 0' }}>
              No retention workflows found
            </h3>
            <p style={{ fontSize: '13px', maxWidth: '420px', margin: '0 auto 16px auto', lineHeight: 1.5 }}>
              Get started by using one of our predefined templates above or create a custom inactivity, win-back, or birthday workflow.
            </p>
            <Button variant="primary" size="sm" onClick={handleOpenCreate} leftIcon={<Plus className="h-3.5 w-3.5" />}>
              Create First Retention Workflow
            </Button>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto" style={{ width: '100%', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-subtle, #E5E7EB)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Workflow Name & Type</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Trigger / Threshold</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Campaign Action</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Branch Scope</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)' }}>Executions</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-secondary, #6B7280)', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkflows.map((wf) => {
                    const config = wf.retentionConfig || {};
                    return (
                      <tr
                        key={wf.id}
                        style={{
                          borderBottom: '1px solid var(--color-border-subtle, #F1F5F9)',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg-subtle, #F9FAFB)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>{wf.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontWeight: 600,
                                backgroundColor:
                                  wf.workflowType === 'INACTIVITY'
                                    ? '#FEF3C7'
                                    : wf.workflowType === 'WIN_BACK'
                                    ? '#F3E8FF'
                                    : '#FCE7F3',
                                color:
                                  wf.workflowType === 'INACTIVITY'
                                    ? '#92400E'
                                    : wf.workflowType === 'WIN_BACK'
                                    ? '#6B21A8'
                                    : '#9D174D',
                              }}
                            >
                              {wf.workflowType}
                            </span>
                            {wf.description && (
                              <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #6B7280)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {wf.description}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {wf.workflowType === 'INACTIVITY' && (
                            <span style={{ color: 'var(--color-text-primary, #111827)' }}>
                              <strong>{config.inactivityDays || 30} days</strong> inactive
                            </span>
                          )}
                          {wf.workflowType === 'WIN_BACK' && (
                            <span style={{ color: 'var(--color-text-primary, #111827)' }}>
                              <strong>{config.winBackThresholdDays || 90} days</strong> win-back
                            </span>
                          )}
                          {wf.workflowType === 'BIRTHDAY' && (
                            <span style={{ color: 'var(--color-text-primary, #111827)' }}>
                              {config.daysBefore === 0
                                ? 'Day of Birthday'
                                : `${config.daysBefore} days before`}
                            </span>
                          )}
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #9CA3AF)', marginTop: '2px' }}>
                            Cooldown: {Math.floor((wf.cooldownMinutes || 0) / (24 * 60))}d
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ color: 'var(--color-text-primary, #111827)', fontWeight: 500 }}>
                            {campaigns.find((c) => c.id === config.campaignId)?.name || 'Linked Campaign'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--color-text-secondary, #4B5563)' }}>
                          {wf.branch?.name || 'All Branches'}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <StatusBadge status={wf.status} />
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>
                          {wf._count?.executions || 0}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenPreview(wf)}
                              title="Preview Eligible Customers"
                              style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#2563EB' }}
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenSim(wf)}
                              title="Test Simulation Trace"
                              style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#7C3AED' }}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                            {wf.status === RuleStatus.ACTIVE ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusChange(wf.id, 'pause')}
                                title="Pause Workflow"
                                style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#D97706' }}
                              >
                                <Pause className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusChange(wf.id, 'activate')}
                                title="Activate Workflow"
                                style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#16A34A' }}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(wf)}
                              title="Edit Configuration"
                              style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#4B5563' }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStatusChange(wf.id, 'archive')}
                              title="Archive"
                              style={{ padding: '6px', minWidth: '32px', height: '32px', color: '#DC2626' }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredWorkflows.map((wf) => {
                const config = wf.retentionConfig || {};
                return (
                  <div
                    key={wf.id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border-subtle, #E5E7EB)',
                      backgroundColor: 'var(--color-bg-surface, #ffffff)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ minWidth: 0 }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary, #111827)', margin: 0 }}>
                          {wf.name}
                        </h4>
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            marginTop: '4px',
                            display: 'inline-block',
                            backgroundColor:
                              wf.workflowType === 'INACTIVITY'
                                ? '#FEF3C7'
                                : wf.workflowType === 'WIN_BACK'
                                ? '#F3E8FF'
                                : '#FCE7F3',
                            color:
                              wf.workflowType === 'INACTIVITY'
                                ? '#92400E'
                                : wf.workflowType === 'WIN_BACK'
                                ? '#6B21A8'
                                : '#9D174D',
                          }}
                        >
                          {wf.workflowType}
                        </span>
                      </div>
                      <StatusBadge status={wf.status} />
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '8px',
                        fontSize: '12px',
                        color: 'var(--color-text-secondary, #4B5563)',
                        paddingTop: '4px',
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--color-text-muted, #9CA3AF)', fontSize: '10px', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>TRIGGER</span>
                        {wf.workflowType === 'INACTIVITY' && `${config.inactivityDays || 30}d inactive`}
                        {wf.workflowType === 'WIN_BACK' && `${config.winBackThresholdDays || 90}d win-back`}
                        {wf.workflowType === 'BIRTHDAY' &&
                          (config.daysBefore === 0 ? 'Day of Birthday' : `${config.daysBefore}d before`)}
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-muted, #9CA3AF)', fontSize: '10px', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>CAMPAIGN</span>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {campaigns.find((c) => c.id === config.campaignId)?.name || 'Campaign'}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-muted, #9CA3AF)', fontSize: '10px', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>BRANCH</span>
                        {wf.branch?.name || 'All Branches'}
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-muted, #9CA3AF)', fontSize: '10px', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>EXECUTIONS</span>
                        <strong style={{ color: 'var(--color-text-primary, #111827)' }}>{wf._count?.executions || 0}</strong>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '6px',
                        paddingTop: '8px',
                        borderTop: '1px solid var(--color-border-subtle, #F1F5F9)',
                      }}
                    >
                      <Button variant="outline" size="sm" onClick={() => handleOpenPreview(wf)}>
                        Preview
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleOpenSim(wf)}>
                        Test
                      </Button>
                      {wf.status === RuleStatus.ACTIVE ? (
                        <Button variant="outline" size="sm" onClick={() => handleStatusChange(wf.id, 'pause')}>
                          Pause
                        </Button>
                      ) : (
                        <Button variant="primary" size="sm" onClick={() => handleStatusChange(wf.id, 'activate')}>
                          Activate
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(wf)}>
                        Edit
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={editingWorkflowId ? 'Edit Retention Workflow' : 'Create Retention Workflow'}
        maxWidth="620px"
      >
        <form onSubmit={handleSaveWorkflow} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {formError && (
            <div
              style={{
                padding: 'var(--space-3) var(--space-4)',
                backgroundColor: 'var(--color-danger-subtle)',
                border: '1px solid var(--color-danger-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-danger-text)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: Workflow Identity */}
          <div className="form-section">
            <div className="form-section-header">
              <div>
                <h4 className="form-section-title">Workflow Identity</h4>
                <p className="form-section-desc">Name and describe this automated customer retention campaign.</p>
              </div>
            </div>

            <Input
              label="Workflow Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. 30-Day Inactive Check-in"
              required
            />

            <Input
              label="Description (Optional)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Internal notes or rationale..."
            />
          </div>

          {/* Section 2: Type & Scope */}
          <div className="form-section">
            <div className="form-section-header">
              <div>
                <h4 className="form-section-title">
                  <Clock size={15} style={{ color: 'var(--color-primary)' }} />
                  Retention Type & Scope
                </h4>
                <p className="form-section-desc">Select the trigger mechanism and target branch location.</p>
              </div>
            </div>

            <div className="form-grid-2">
              <Select
                label="Workflow Type"
                required
                value={formData.workflowType}
                onChange={(e) => setFormData({ ...formData, workflowType: e.target.value as any })}
                disabled={Boolean(editingWorkflowId)}
                options={[
                  { value: 'INACTIVITY', label: 'Inactivity Re-engagement' },
                  { value: 'WIN_BACK', label: 'Win-Back Churn Recovery' },
                  { value: 'BIRTHDAY', label: 'Birthday Celebration' },
                ]}
              />

              <Select
                label="Branch Scope"
                value={formData.branchId}
                onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                options={[
                  { value: '', label: 'All Branches (Business-wide)' },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
          </div>

          {/* Section 3: Conditional Workflow Parameters */}
          {formData.workflowType === 'INACTIVITY' && (
            <div className="form-section-subtle">
              <span className="form-section-title">
                <Clock size={15} style={{ color: 'var(--color-primary)' }} />
                Inactivity Rules
              </span>

              <Input
                label="Inactivity Threshold (Days)"
                type="number"
                min="1"
                max="365"
                value={formData.inactivityDays}
                onChange={(e) => setFormData({ ...formData, inactivityDays: parseInt(e.target.value, 10) || 30 })}
                helperText="Triggers when a customer has had no visit recorded for this number of days."
                required
              />

              <label className="checkbox-control" style={{ fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-1)' }}>
                <input
                  type="checkbox"
                  checked={formData.includeNeverVisited}
                  onChange={(e) => setFormData({ ...formData, includeNeverVisited: e.target.checked })}
                  className="checkbox-input"
                  style={{ display: 'none' }}
                />
                <span className="checkbox-box" style={{ width: 16, height: 16 }}>
                  {formData.includeNeverVisited && <CheckCircle size={12} />}
                </span>
                <span>Include registered guests who have not logged their first visit yet</span>
              </label>
            </div>
          )}

          {formData.workflowType === 'WIN_BACK' && (
            <div className="form-section-subtle">
              <span className="form-section-title">
                <RotateCcw size={15} style={{ color: 'var(--color-primary)' }} />
                Win-Back Churn Threshold
              </span>

              <Input
                label="Win-Back Threshold (Days)"
                type="number"
                min="1"
                max="730"
                value={formData.winBackThresholdDays}
                onChange={(e) => setFormData({ ...formData, winBackThresholdDays: parseInt(e.target.value, 10) || 90 })}
                helperText="Triggers for lapsed customers who have crossed this longer churn threshold."
                required
              />
            </div>
          )}

          {formData.workflowType === 'BIRTHDAY' && (
            <div className="form-section-subtle">
              <span className="form-section-title">
                <Gift size={15} style={{ color: 'var(--color-primary)' }} />
                Birthday Schedule & Calendar Rules
              </span>

              <div className="form-grid-2">
                <Select
                  label="Dispatch Timing"
                  value={String(formData.daysBefore)}
                  onChange={(e) => setFormData({ ...formData, daysBefore: parseInt(e.target.value, 10) || 0 })}
                  options={[
                    { value: '0', label: 'On the day of birthday' },
                    { value: '1', label: '1 day before' },
                    { value: '2', label: '2 days before' },
                    { value: '3', label: '3 days before' },
                    { value: '7', label: '7 days before (1 week)' },
                    { value: '14', label: '14 days before (2 weeks)' },
                  ]}
                />

                <Select
                  label="Feb 29 Leap-Year Rule"
                  value={formData.leapYearFeb29Policy}
                  onChange={(e) => setFormData({ ...formData, leapYearFeb29Policy: e.target.value as any })}
                  options={[
                    { value: 'FEB_28', label: 'Celebrate on Feb 28 (Recommended)' },
                    { value: 'MAR_1', label: 'Celebrate on March 1' },
                  ]}
                />
              </div>

              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
                Timezone-aware: Evaluates customer birthday matching business/branch timezone once per calendar year.
              </span>
            </div>
          )}

          {/* Section 4: Target Campaign to Dispatch */}
          <div className="form-section-primary">
            <span className="form-section-title" style={{ color: 'var(--color-primary)' }}>
              <Gift size={15} style={{ color: 'var(--color-primary)' }} />
              Action: Dispatch Campaign (THEN)
            </span>

            <Select
              label="Target Campaign to Dispatch"
              required
              value={formData.campaignId}
              onChange={(e) => setFormData({ ...formData, campaignId: e.target.value })}
              options={[
                { value: '', label: '-- Select Campaign to Dispatch --' },
                ...campaigns.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.channel})`,
                })),
              ]}
              helperText="Reward perk or re-engagement message sent to qualifying customers."
            />
          </div>

          {/* Section 5: Safeguards */}
          <div className="form-section">
            <div className="form-section-header">
              <div>
                <h4 className="form-section-title">Safeguards & Frequency Caps</h4>
                <p className="form-section-desc">Manage repeat triggers and cooldown periods.</p>
              </div>
            </div>

            <div className="form-grid-2">
              <Input
                label="Customer Cooldown (Days)"
                type="number"
                min="0"
                value={formData.cooldownDays}
                onChange={(e) => setFormData({ ...formData, cooldownDays: parseInt(e.target.value, 10) || 0 })}
                helperText="Minimum days between retention messages"
              />

              <Input
                label="Max Executions Per Customer"
                type="number"
                min="1"
                value={formData.maxExecutionsPerCustomer}
                onChange={(e) => setFormData({ ...formData, maxExecutionsPerCustomer: e.target.value })}
                placeholder="1 (Default)"
                helperText="Maximum times this workflow can trigger per customer"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="form-actions">
            <Button variant="outline" type="button" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingWorkflowId ? 'Update Workflow' : 'Create Workflow'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Live Preview Modal */}
      <Modal isOpen={previewModalOpen} onClose={() => setPreviewModalOpen(false)} title="Retention Eligibility Preview">
        <div className="space-y-4 text-xs">
          {previewLoading ? (
            <div className="p-12 text-center text-gray-500">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-600" />
              <p>Analyzing customer activity and calculating eligibility...</p>
            </div>
          ) : previewData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <div className="text-xl font-bold text-blue-700">{previewData.totalEligibleCount}</div>
                  <div className="text-[11px] text-blue-600 font-medium">Eligible Customers</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg text-center">
                  <div className="text-xl font-bold text-emerald-700">{previewData.consentedCount}</div>
                  <div className="text-[11px] text-emerald-600 font-medium">Consent Granted</div>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg text-center">
                  <div className="text-xl font-bold text-amber-700">{previewData.unconsentedCount}</div>
                  <div className="text-[11px] text-amber-600 font-medium">Suppressed (No Consent)</div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Sample Eligible Customers</h4>
                {previewData.sampleCustomers.length === 0 ? (
                  <p className="text-gray-500 italic">No customers currently match these criteria.</p>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                        <tr>
                          <th className="p-2">Customer</th>
                          <th className="p-2">Phone</th>
                          <th className="p-2">Activity / Birthday</th>
                          <th className="p-2">Consent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {previewData.sampleCustomers.map((sc) => (
                          <tr key={sc.id}>
                            <td className="p-2 font-medium text-gray-900">{sc.name}</td>
                            <td className="p-2 text-gray-600">{sc.phone}</td>
                            <td className="p-2 text-gray-700">
                              {sc.daysInactive !== undefined
                                ? `${sc.daysInactive} days inactive`
                                : sc.birthday
                                ? `Birthday: ${new Date(sc.birthday).toLocaleDateString()}`
                                : 'Never visited'}
                            </td>
                            <td className="p-2">
                              {sc.marketingConsent ? (
                                <span className="text-emerald-600 font-medium">Granted</span>
                              ) : (
                                <span className="text-amber-600 font-medium">Lacking</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="text-[11px] text-gray-400 bg-gray-50 p-2.5 rounded border border-gray-100">
                Evaluation Timezone: <strong>{previewData.summary.timezone}</strong> | Scope:{' '}
                <strong>{previewData.summary.branchScope}</strong> | Strictly read-only preview.
              </div>
            </div>
          ) : null}
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setPreviewModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Test Simulation Modal */}
      <Modal isOpen={simModalOpen} onClose={() => setSimModalOpen(false)} title="Simulate Workflow Evaluation">
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-800">
            <strong>Safe Simulation Mode:</strong> Tests the exact eligibility pipeline against a customer without
            sending external messages or dispatching delivery queues.
          </div>

          <div>
            <label className="block font-medium text-gray-700 mb-1">Select Customer to Test Against</label>
            <select
              value={simCustomerId}
              onChange={(e) => setSimCustomerId(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs"
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
            disabled={simulating || !simWorkflow}
            className="w-full text-xs"
          >
            {simulating ? 'Evaluating...' : 'Run Simulation Trace'}
          </Button>

          {simError && (
            <div className="p-2.5 bg-red-50 text-red-700 rounded border border-red-200">
              {simError}
            </div>
          )}

          {simResult && (
            <div className="space-y-3 pt-2 border-t border-gray-200">
              <div
                className={`p-3 rounded-lg border flex items-center justify-between font-semibold ${
                  simResult.overallEligible
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                <span>Outcome: {simResult.actionTaken}</span>
                {simResult.skipReason && <span className="text-xs font-normal">Reason: {simResult.skipReason}</span>}
              </div>

              <div>
                <h5 className="font-semibold text-gray-900 mb-1.5">Diagnostic Evaluation Steps</h5>
                <div className="space-y-1.5">
                  {simResult.steps.map((st, i) => (
                    <div
                      key={i}
                      className="p-2 rounded bg-gray-50 border border-gray-200 flex items-start justify-between gap-2"
                    >
                      <div>
                        <span className="font-semibold text-gray-800">{st.name}:</span>{' '}
                        <span className="text-gray-600">{st.detail}</span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                          st.status === 'PASSED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {st.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-[10px] text-gray-400">
                Calculated Idempotency Key: <code>{simResult.idempotencyKeyCalculated}</code>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
