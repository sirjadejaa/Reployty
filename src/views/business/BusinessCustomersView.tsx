import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Plus,
  ArrowUpDown,
  Tag,
  Clock,
  Coins,
  Award,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Calendar,
  Phone,
  Mail,
  RefreshCw,
  Edit2,
  Trash2,
  Send,
  Store,
  Layers,
  ShieldCheck,
  Eye,
  X,
  Filter,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Textarea';
import {
  Customer360Detail,
  CustomerSegmentItem,
  CustomerTagItem,
  CustomerTimelineItem,
  SegmentRuleDefinition,
  SegmentCondition,
} from '../../types/loyalty';

import { useIsMobile } from '../../hooks/useIsMobile';

export const BusinessCustomersView: React.FC<{ onNavigate?: (route: any) => void }> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'directory' | 'profile' | 'segments' | 'tags'>('directory');
  const isMobile = useIsMobile(768);

  // Directory State
  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [tagFilter, setTagFilter] = useState('ALL');
  const [segmentFilter, setSegmentFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('lastVisitAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomersCount, setTotalCustomersCount] = useState(0);
  const [isMobileFilterModalOpen, setIsMobileFilterModalOpen] = useState(false);
  const activeFilterCount =
    (statusFilter !== 'ALL' ? 1 : 0) +
    (branchFilter !== 'ALL' ? 1 : 0) +
    (tagFilter !== 'ALL' ? 1 : 0) +
    (segmentFilter !== 'ALL' ? 1 : 0);

  // Filter Dropdown Options State
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [tags, setTags] = useState<CustomerTagItem[]>([]);
  const [segments, setSegments] = useState<CustomerSegmentItem[]>([]);

  // Customer 360 State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customer360, setCustomer360] = useState<Customer360Detail | null>(null);
  const [loading360, setLoading360] = useState(false);
  const [profileSubTab, setProfileSubTab] = useState<'timeline' | 'notes' | 'tags' | 'consents'>('timeline');

  // Timeline State
  const [timelineItems, setTimelineItems] = useState<CustomerTimelineItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timelineTypeFilter, setTimelineTypeFilter] = useState('ALL');

  // Staff Notes State
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');

  // Register Customer Modal
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: '',
    phone: '',
    email: '',
    birthday: '',
    branchId: '',
    marketingConsent: true,
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Edit Customer Profile Modal
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileForm, setEditProfileForm] = useState({
    name: '',
    email: '',
    birthday: '',
    status: 'ACTIVE',
    branchId: '',
  });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [editProfileError, setEditProfileError] = useState<string | null>(null);

  // Assign Tag Modal
  const [isAssignTagOpen, setIsAssignTagOpen] = useState(false);
  const [selectedTagToAssign, setSelectedTagToAssign] = useState('');
  const [isAssigningTag, setIsAssigningTag] = useState(false);

  // Tag Management State
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#4F6BFF');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  // Segment Management State
  const [isCreateSegmentOpen, setIsCreateSegmentOpen] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [segmentDescription, setSegmentDescription] = useState('');
  const [segmentMatchType, setSegmentMatchType] = useState<'ALL' | 'ANY'>('ALL');
  const [segmentConditions, setSegmentConditions] = useState<SegmentCondition[]>([
    { field: 'totalVisits', operator: 'greater_than_or_equal', value: 5 },
  ]);
  const [isSavingSegment, setIsSavingSegment] = useState(false);
  const [segmentError, setSegmentError] = useState<string | null>(null);

  // Segment Customer View Modal/Drawer
  const [activeSegmentForView, setActiveSegmentForView] = useState<CustomerSegmentItem | null>(null);
  const [segmentCustomers, setSegmentCustomers] = useState<any[]>([]);
  const [loadingSegmentCustomers, setLoadingSegmentCustomers] = useState(false);

  // Curated color options for tags
  const TAG_COLORS = [
    { label: 'Indigo', hex: '#4F6BFF' },
    { label: 'Emerald', hex: '#10B981' },
    { label: 'Violet', hex: '#8B5CF6' },
    { label: 'Amber', hex: '#F59E0B' },
    { label: 'Rose', hex: '#EC4899' },
    { label: 'Cyan', hex: '#06B6D4' },
    { label: 'Slate', hex: '#64748B' },
  ];

  // ==========================================================================
  // Fetch Functions
  // ==========================================================================

  const fetchBranchesAndTagsAndSegments = useCallback(async () => {
    try {
      const [branchesRes, tagsRes, segmentsRes] = await Promise.all([
        fetch('/api/business/branches'),
        fetch('/api/business/customer-tags'),
        fetch('/api/business/customer-segments'),
      ]);

      if (branchesRes.ok) {
        const data = await branchesRes.json();
        setBranches(Array.isArray(data) ? data : data.branches || []);
      }
      if (tagsRes.ok) {
        const data = await tagsRes.json();
        setTags(Array.isArray(data) ? data : []);
      }
      if (segmentsRes.ok) {
        const data = await segmentsRes.json();
        setSegments(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error loading aux CRM metadata:', err);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (branchFilter !== 'ALL') params.append('branchId', branchFilter);
      if (tagFilter !== 'ALL') params.append('tagId', tagFilter);
      if (segmentFilter !== 'ALL') params.append('segmentId', segmentFilter);
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      params.append('page', String(currentPage));
      params.append('limit', String(pageSize));

      const res = await fetch(`/api/business/customers?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setCustomers(json.data || []);
        setTotalCustomersCount(json.pagination?.total || 0);
        setTotalPages(json.pagination?.totalPages || 1);
      }
    } catch (err) {
      console.error('Error fetching customers directory:', err);
    } finally {
      setLoadingCustomers(false);
    }
  }, [searchQuery, statusFilter, branchFilter, tagFilter, segmentFilter, sortBy, sortOrder, currentPage, pageSize]);

  const fetchCustomer360 = useCallback(async (customerId: string) => {
    setLoading360(true);
    try {
      const res = await fetch(`/api/business/customers/${customerId}`);
      if (res.ok) {
        const data = await res.json();
        setCustomer360(data);
      } else {
        setCustomer360(null);
      }
    } catch (err) {
      console.error('Error fetching customer 360:', err);
      setCustomer360(null);
    } finally {
      setLoading360(false);
    }
  }, []);

  const fetchTimeline = useCallback(async (customerId: string) => {
    setLoadingTimeline(true);
    try {
      const params = new URLSearchParams();
      if (timelineTypeFilter !== 'ALL') {
        params.append('typeFilter', timelineTypeFilter);
      }
      const res = await fetch(`/api/business/customers/${customerId}/timeline?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setTimelineItems(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching timeline:', err);
    } finally {
      setLoadingTimeline(false);
    }
  }, [timelineTypeFilter]);

  // Initial Load
  useEffect(() => {
    fetchBranchesAndTagsAndSegments();
  }, [fetchBranchesAndTagsAndSegments]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // When a customer is selected, load their 360 profile
  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomer360(selectedCustomerId);
    }
  }, [selectedCustomerId, fetchCustomer360]);

  // When profile subtab is timeline or filter changes, load timeline
  useEffect(() => {
    if (selectedCustomerId && profileSubTab === 'timeline') {
      fetchTimeline(selectedCustomerId);
    }
  }, [selectedCustomerId, profileSubTab, fetchTimeline]);

  // ==========================================================================
  // Handlers
  // ==========================================================================

  const handleSelectCustomer = (cust: any) => {
    setSelectedCustomerId(cust.id);
    setActiveTab('profile');
    setProfileSubTab('timeline');
  };

  const handleRegisterCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    if (!registerForm.name.trim() || !registerForm.phone.trim()) {
      setRegisterError('Name and phone number are required.');
      return;
    }

    setIsRegistering(true);
    try {
      const res = await fetch('/api/business/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerForm.name.trim(),
          phone: registerForm.phone.trim(),
          email: registerForm.email.trim() || undefined,
          birthday: registerForm.birthday ? new Date(registerForm.birthday) : undefined,
          branchId: registerForm.branchId || undefined,
          marketingConsent: registerForm.marketingConsent,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to register customer');
      }

      setIsRegisterModalOpen(false);
      setRegisterForm({
        name: '',
        phone: '',
        email: '',
        birthday: '',
        branchId: '',
        marketingConsent: true,
      });
      fetchCustomers();
    } catch (err: any) {
      setRegisterError(err.message || 'Error creating customer');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleOpenEditProfile = () => {
    if (!customer360) return;
    setEditProfileForm({
      name: customer360.customer.name,
      email: customer360.customer.email || '',
      birthday: customer360.customer.birthday ? customer360.customer.birthday.split('T')[0] : '',
      status: customer360.customer.status,
      branchId: customer360.customer.branchId || '',
    });
    setEditProfileError(null);
    setIsEditProfileOpen(true);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    setEditProfileError(null);
    setIsUpdatingProfile(true);

    try {
      const res = await fetch(`/api/business/customers/${selectedCustomerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editProfileForm.name.trim(),
          email: editProfileForm.email.trim() || null,
          birthday: editProfileForm.birthday ? new Date(editProfileForm.birthday) : null,
          status: editProfileForm.status,
          branchId: editProfileForm.branchId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      setIsEditProfileOpen(false);
      fetchCustomer360(selectedCustomerId);
      fetchCustomers();
    } catch (err: any) {
      setEditProfileError(err.message || 'Error updating profile');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !newNoteContent.trim()) return;

    setIsSubmittingNote(true);
    try {
      const res = await fetch(`/api/business/customers/${selectedCustomerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNoteContent.trim() }),
      });

      if (res.ok) {
        setNewNoteContent('');
        fetchCustomer360(selectedCustomerId);
        if (profileSubTab === 'timeline') {
          fetchTimeline(selectedCustomerId);
        }
      }
    } catch (err) {
      console.error('Error adding note:', err);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleSaveEditNote = async (noteId: string) => {
    if (!selectedCustomerId || !editingNoteContent.trim()) return;
    try {
      const res = await fetch(`/api/business/customers/${selectedCustomerId}/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingNoteContent.trim() }),
      });
      if (res.ok) {
        setEditingNoteId(null);
        setEditingNoteContent('');
        fetchCustomer360(selectedCustomerId);
      }
    } catch (err) {
      console.error('Error updating note:', err);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selectedCustomerId || !window.confirm('Delete this staff note?')) return;
    try {
      const res = await fetch(`/api/business/customers/${selectedCustomerId}/notes/${noteId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchCustomer360(selectedCustomerId);
      }
    } catch (err) {
      console.error('Error deleting note:', err);
    }
  };

  const handleAssignTag = async () => {
    if (!selectedCustomerId || !selectedTagToAssign) return;
    setIsAssigningTag(true);
    try {
      const res = await fetch(`/api/business/customers/${selectedCustomerId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId: selectedTagToAssign }),
      });
      if (res.ok) {
        setIsAssignTagOpen(false);
        setSelectedTagToAssign('');
        fetchCustomer360(selectedCustomerId);
        fetchBranchesAndTagsAndSegments();
      }
    } catch (err) {
      console.error('Error assigning tag:', err);
    } finally {
      setIsAssigningTag(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!selectedCustomerId) return;
    try {
      const res = await fetch(`/api/business/customers/${selectedCustomerId}/tags/${tagId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchCustomer360(selectedCustomerId);
        fetchBranchesAndTagsAndSegments();
      }
    } catch (err) {
      console.error('Error removing tag:', err);
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setTagError(null);
    if (!newTagName.trim()) {
      setTagError('Tag name is required');
      return;
    }
    setIsCreatingTag(true);
    try {
      const res = await fetch('/api/business/customer-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create tag');
      }
      setIsCreateTagOpen(false);
      setNewTagName('');
      fetchBranchesAndTagsAndSegments();
    } catch (err: any) {
      setTagError(err.message || 'Error creating tag');
    } finally {
      setIsCreatingTag(false);
    }
  };

  const handleDeleteTag = async (tagId: string, tagName: string) => {
    if (!window.confirm(`Delete tag "${tagName}"? This will detach it from all customers.`)) return;
    try {
      const res = await fetch(`/api/business/customer-tags/${tagId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchBranchesAndTagsAndSegments();
        fetchCustomers();
        if (selectedCustomerId) fetchCustomer360(selectedCustomerId);
      }
    } catch (err) {
      console.error('Error deleting tag:', err);
    }
  };

  const handleAddCondition = () => {
    setSegmentConditions([
      ...segmentConditions,
      { field: 'totalVisits', operator: 'greater_than_or_equal', value: 10 },
    ]);
  };

  const handleRemoveCondition = (index: number) => {
    setSegmentConditions(segmentConditions.filter((_, i) => i !== index));
  };

  const handleConditionChange = (index: number, field: string, val: any) => {
    const updated = [...segmentConditions];
    (updated[index] as any)[field] = val;
    setSegmentConditions(updated);
  };

  const handleCreateSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSegmentError(null);
    if (!segmentName.trim()) {
      setSegmentError('Segment name is required.');
      return;
    }
    setIsSavingSegment(true);
    try {
      const ruleDef: SegmentRuleDefinition = {
        matchType: segmentMatchType,
        conditions: segmentConditions,
      };

      const res = await fetch('/api/business/customer-segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: segmentName.trim(),
          description: segmentDescription.trim() || undefined,
          ruleDefinition: ruleDef,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create segment');
      }

      setIsCreateSegmentOpen(false);
      setSegmentName('');
      setSegmentDescription('');
      fetchBranchesAndTagsAndSegments();
    } catch (err: any) {
      setSegmentError(err.message || 'Error creating segment');
    } finally {
      setIsSavingSegment(false);
    }
  };

  const handleDeleteSegment = async (segmentId: string, name: string) => {
    if (!window.confirm(`Delete segment "${name}"?`)) return;
    try {
      const res = await fetch(`/api/business/customer-segments/${segmentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchBranchesAndTagsAndSegments();
      }
    } catch (err) {
      console.error('Error deleting segment:', err);
    }
  };

  const handleViewSegmentCustomers = async (seg: CustomerSegmentItem) => {
    setActiveSegmentForView(seg);
    setLoadingSegmentCustomers(true);
    try {
      const res = await fetch(`/api/business/customer-segments/${seg.id}/customers`);
      if (res.ok) {
        const data = await res.json();
        setSegmentCustomers(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching segment customers:', err);
    } finally {
      setLoadingSegmentCustomers(false);
    }
  };

  // Helpers
  const formatCurrency = (minor: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(minor / 100);
  };

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return 'Never';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatRelativeTime = (isoStr?: string | null) => {
    if (!isoStr) return 'Never';
    const now = new Date();
    const d = new Date(isoStr);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div style={{ maxWidth: 1280, width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: isMobile ? '14px 12px calc(var(--mobile-nav-height, 64px) + 32px)' : '24px 16px', overflowX: 'hidden' }}>
      {/* Header Banner */}
      {isMobile ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              Customers
              <span style={{ fontSize: 12, fontWeight: 600, color: '#4F6BFF', backgroundColor: '#EEF2FF', padding: '1px 7px', borderRadius: 10 }}>
                {totalCustomersCount}
              </span>
            </h1>
            <p style={{ fontSize: 11, color: '#64748B', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Directory & CRM
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchCustomers();
                fetchBranchesAndTagsAndSegments();
              }}
              style={{ width: 36, height: 36, minWidth: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsRegisterModalOpen(true)}
              style={{ height: 36, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              <Plus size={14} />
              Register
            </Button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: '#EEF2FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4F6BFF',
                  flexShrink: 0,
                }}
              >
                <Users size={20} />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Customer Relationship Management
              </h1>
            </div>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
              Unified customer profiles, activity timelines, notes, tags, and audience segmentation.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="outline"
              onClick={() => {
                fetchCustomers();
                fetchBranchesAndTagsAndSegments();
              }}
              style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <RefreshCw size={14} />
              Refresh
            </Button>

            <Button
              variant="primary"
              onClick={() => setIsRegisterModalOpen(true)}
              style={{ height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Plus size={16} />
              Register Customer
            </Button>
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      {isMobile ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            backgroundColor: '#F1F5F9',
            padding: '3px',
            borderRadius: '10px',
            marginBottom: 12,
            gap: 3,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <button
            onClick={() => setActiveTab('directory')}
            style={{
              padding: '8px 2px',
              fontSize: 11,
              fontWeight: activeTab === 'directory' ? 700 : 500,
              borderRadius: '7px',
              border: 'none',
              backgroundColor: activeTab === 'directory' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'directory' ? '#4F6BFF' : '#64748B',
              boxShadow: activeTab === 'directory' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Directory
          </button>
          <button
            onClick={() => {
              if (!selectedCustomerId && customers.length > 0) {
                setSelectedCustomerId(customers[0].id);
              }
              setActiveTab('profile');
            }}
            style={{
              padding: '8px 2px',
              fontSize: 11,
              fontWeight: activeTab === 'profile' ? 700 : 500,
              borderRadius: '7px',
              border: 'none',
              backgroundColor: activeTab === 'profile' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'profile' ? '#4F6BFF' : '#64748B',
              boxShadow: activeTab === 'profile' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            360 View
          </button>
          <button
            onClick={() => setActiveTab('segments')}
            style={{
              padding: '8px 2px',
              fontSize: 11,
              fontWeight: activeTab === 'segments' ? 700 : 500,
              borderRadius: '7px',
              border: 'none',
              backgroundColor: activeTab === 'segments' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'segments' ? '#4F6BFF' : '#64748B',
              boxShadow: activeTab === 'segments' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Segments
          </button>
          <button
            onClick={() => setActiveTab('tags')}
            style={{
              padding: '8px 2px',
              fontSize: 11,
              fontWeight: activeTab === 'tags' ? 700 : 500,
              borderRadius: '7px',
              border: 'none',
              backgroundColor: activeTab === 'tags' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'tags' ? '#4F6BFF' : '#64748B',
              boxShadow: activeTab === 'tags' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Tags
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #E2E8F0',
            marginBottom: 20,
            gap: 6,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          <button
            onClick={() => setActiveTab('directory')}
            style={{
              padding: '12px 18px',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'directory' ? '2px solid #4F6BFF' : '2px solid transparent',
              color: activeTab === 'directory' ? '#4F6BFF' : '#64748B',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <Users size={16} />
            Customer Directory
            <span
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: activeTab === 'directory' ? '#EEF2FF' : '#F1F5F9',
                color: activeTab === 'directory' ? '#4F6BFF' : '#64748B',
              }}
            >
              {totalCustomersCount}
            </span>
          </button>

          <button
            onClick={() => {
              if (!selectedCustomerId && customers.length > 0) {
                setSelectedCustomerId(customers[0].id);
              }
              setActiveTab('profile');
            }}
            style={{
              padding: '12px 18px',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'profile' ? '2px solid #4F6BFF' : '2px solid transparent',
              color: activeTab === 'profile' ? '#4F6BFF' : '#64748B',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <UserCheck size={16} />
            Customer 360 View
            {customer360 && (
              <span
                style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 12,
                  backgroundColor: '#EEF2FF',
                  color: '#4F6BFF',
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {customer360.customer.name}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('segments')}
            style={{
              padding: '12px 18px',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'segments' ? '2px solid #4F6BFF' : '2px solid transparent',
              color: activeTab === 'segments' ? '#4F6BFF' : '#64748B',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <Layers size={16} />
            Audience Segments
            <span
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: activeTab === 'segments' ? '#EEF2FF' : '#F1F5F9',
                color: activeTab === 'segments' ? '#4F6BFF' : '#64748B',
              }}
            >
              {segments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tags')}
            style={{
              padding: '12px 18px',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'tags' ? '2px solid #4F6BFF' : '2px solid transparent',
              color: activeTab === 'tags' ? '#4F6BFF' : '#64748B',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <Tag size={16} />
            Tags Catalogue
            <span
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 12,
                backgroundColor: activeTab === 'tags' ? '#EEF2FF' : '#F1F5F9',
                color: activeTab === 'tags' ? '#4F6BFF' : '#64748B',
              }}
            >
              {tags.length}
            </span>
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: CUSTOMER DIRECTORY */}
      {/* ==================================================================== */}
      {activeTab === 'directory' && (
        <div>
          {/* Metrics Overview Bar */}
          {isMobile ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
                marginBottom: 12,
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box', minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customers</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>{totalCustomersCount}</div>
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#EEF2FF', color: '#4F6BFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={16} />
                </div>
              </div>

              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box', minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Passes</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>{customers.filter(c => c.loyaltyCards?.length > 0).length}</div>
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Coins size={16} />
                </div>
              </div>

              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box', minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tags</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>{tags.length}</div>
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FEF3C7', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Award size={16} />
                </div>
              </div>

              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box', minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Segments</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>{segments.length}</div>
                </div>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3E8FF', color: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Layers size={16} />
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
                marginBottom: 20,
              }}
            >
              <Card style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: '#EEF2FF',
                      color: '#4F6BFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Users size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                      Total Customers
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>
                      {totalCustomersCount}
                    </div>
                  </div>
                </div>
              </Card>

              <Card style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: '#ECFDF5',
                      color: '#10B981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Coins size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                      Active Passes
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>
                      {customers.filter(c => c.loyaltyCards?.length > 0).length}
                    </div>
                  </div>
                </div>
              </Card>

              <Card style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: '#FEF3C7',
                      color: '#F59E0B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Award size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                      Active Tags
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>
                      {tags.length}
                    </div>
                  </div>
                </div>
              </Card>

              <Card style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: '#F3E8FF',
                      color: '#8B5CF6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Layers size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                      Active Segments
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>
                      {segments.length}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Search & Filter Controls */}
          <Card style={{ padding: isMobile ? 12 : 16, marginBottom: isMobile ? 12 : 20, width: '100%', boxSizing: 'border-box' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                flexWrap: 'wrap',
                alignItems: isMobile ? 'stretch' : 'center',
                gap: 10,
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {/* Search input */}
              <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : '1 1 240px', minWidth: isMobile ? 0 : 200, width: '100%', boxSizing: 'border-box' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94A3B8',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search name, phone, or email..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: 40,
                    padding: searchQuery ? '8px 36px 8px 36px' : '8px 12px 8px 36px',
                    fontSize: 14,
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    outline: 'none',
                    backgroundColor: '#FFFFFF',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: '#94A3B8',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* Filters & Sort Controls */}
              {isMobile ? (
                /* Mobile Filter & Sort Bar - 2 equal columns */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', boxSizing: 'border-box' }}>
                  <Button
                    variant={activeFilterCount > 0 ? 'primary' : 'outline'}
                    onClick={() => setIsMobileFilterModalOpen(true)}
                    style={{
                      width: '100%',
                      height: 40,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      padding: '0 8px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <Filter size={15} />
                    Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
                  </Button>

                  <div style={{ display: 'flex', gap: 4, width: '100%', minWidth: 0 }}>
                    <select
                      value={sortBy}
                      onChange={e => {
                        setSortBy(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: 40,
                        padding: '0 6px',
                        fontSize: 12,
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <option value="lastVisitAt">Last Visit</option>
                      <option value="totalVisits">Visits</option>
                      <option value="totalSpendMinor">Spend</option>
                      <option value="pointsBalance">Points</option>
                      <option value="stampsBalance">Stamps</option>
                      <option value="joinedAt">Join Date</option>
                      <option value="name">Name</option>
                    </select>

                    <Button
                      variant="outline"
                      onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                      style={{ padding: 0, height: 40, width: 38, minWidth: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      title={`Toggle order (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`}
                    >
                      <ArrowUpDown size={15} />
                    </Button>
                  </div>
                </div>
              ) : (
                /* Desktop Inline Filters and Sort */
                <>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      width: 'auto',
                    }}
                  >
                    {/* Status Filter */}
                    <select
                      value={statusFilter}
                      onChange={e => {
                        setStatusFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        height: 40,
                        width: 'auto',
                        padding: '8px 12px',
                        fontSize: 13,
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                      }}
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="BLOCKED">Blocked</option>
                    </select>

                    {/* Branch Filter */}
                    <select
                      value={branchFilter}
                      onChange={e => {
                        setBranchFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        height: 40,
                        width: 'auto',
                        padding: '8px 12px',
                        fontSize: 13,
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                      }}
                    >
                      <option value="ALL">All Branches</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>

                    {/* Tag Filter */}
                    <select
                      value={tagFilter}
                      onChange={e => {
                        setTagFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        height: 40,
                        width: 'auto',
                        padding: '8px 12px',
                        fontSize: 13,
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                      }}
                    >
                      <option value="ALL">All Tags</option>
                      {tags.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>

                    {/* Segment Filter */}
                    <select
                      value={segmentFilter}
                      onChange={e => {
                        setSegmentFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        height: 40,
                        width: 'auto',
                        padding: '8px 12px',
                        fontSize: 13,
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                      }}
                    >
                      <option value="ALL">All Segments</option>
                      {segments.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.customerCount})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sort selector */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: 'auto',
                      justifyContent: 'flex-start',
                    }}
                  >
                    <span style={{ fontSize: 13, color: '#64748B', whiteSpace: 'nowrap' }}>Sort:</span>
                    <select
                      value={sortBy}
                      onChange={e => {
                        setSortBy(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        height: 40,
                        padding: '8px 12px',
                        fontSize: 13,
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                      }}
                    >
                      <option value="lastVisitAt">Last Visit</option>
                      <option value="totalVisits">Total Visits</option>
                      <option value="totalSpendMinor">Spend</option>
                      <option value="pointsBalance">Points</option>
                      <option value="stampsBalance">Stamps</option>
                      <option value="joinedAt">Join Date</option>
                      <option value="name">Name</option>
                    </select>

                    <Button
                      variant="outline"
                      onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                      style={{ padding: '8px 10px', height: 40, minWidth: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title={`Toggle order (${sortOrder === 'asc' ? 'Ascending' : 'Descending'})`}
                    >
                      <ArrowUpDown size={16} />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* Customer Records List/Table */}
          {loadingCustomers ? (
            <Card style={{ padding: 48, textAlign: 'center', color: '#64748B', marginBottom: 20 }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              Loading customer records...
            </Card>
          ) : customers.length === 0 ? (
            <Card style={{ padding: isMobile ? 32 : 48, textAlign: 'center', marginBottom: 20 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: '#F1F5F9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                  color: '#94A3B8',
                }}
              >
                <Users size={24} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>
                No customers found
              </h3>
              <p style={{ fontSize: 14, color: '#64748B', maxWidth: 360, margin: '0 auto 16px' }}>
                No customer records matched your search or filters. Try adjusting your query or register a new customer.
              </p>
              <Button variant="primary" onClick={() => setIsRegisterModalOpen(true)}>
                <Plus size={16} style={{ marginRight: 6 }} />
                Register Customer
              </Button>
            </Card>
          ) : isMobile ? (
            /* Mobile Stacked Customer Cards (Direct, no double-card nesting) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20, width: '100%', boxSizing: 'border-box' }}>
              {customers.map(c => (
                <div
                  key={c.id}
                  onClick={() => handleSelectCustomer(c)}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    width: '100%',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                >
                  {/* Top Row: Avatar, Name & Phone, and Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          backgroundColor: '#4F6BFF',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(c.name)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.phone}
                        </div>
                      </div>
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <StatusBadge status={c.status === 'ACTIVE' ? 'active' : 'inactive'} label={c.status} />
                    </div>
                  </div>

                  {/* Branch and Tags Row */}
                  {(c.branch || (c.tags && c.tags.length > 0)) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, width: '100%' }}>
                      {c.branch && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 6,
                            backgroundColor: '#F1F5F9',
                            fontSize: 11,
                            color: '#475569',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Store size={12} style={{ flexShrink: 0 }} />
                          {c.branch.name}
                        </span>
                      )}

                      {c.tags?.map((t: any) => (
                        <span
                          key={t.tag.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            backgroundColor: `${t.tag.color}15`,
                            color: t.tag.color,
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.tag.color, flexShrink: 0 }} />
                          {t.tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 3-Column Metric Row: Visits | Points | Spend */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      padding: '10px 8px',
                      backgroundColor: '#F8FAFC',
                      borderRadius: 8,
                      border: '1px solid #F1F5F9',
                      textAlign: 'center',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Visits
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.totalVisits}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Points
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#4F6BFF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.pointsBalance}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Spend
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatCurrency(c.totalSpendMinor)}
                      </div>
                    </div>
                  </div>

                  {/* Full-width touch action button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      handleSelectCustomer(c);
                    }}
                    style={{ width: '100%', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}
                  >
                    <Eye size={14} />
                    View Customer
                  </Button>
                </div>
              ))}

              {/* Mobile Pagination Toolbar */}
              {totalPages > 1 && (
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: 10,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#64748B', textAlign: 'center' }}>
                    Showing {(currentPage - 1) * pageSize + 1} to{' '}
                    {Math.min(currentPage * pageSize, totalCustomersCount)} of {totalCustomersCount} customers
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      style={{ minHeight: 38, padding: '0 14px' }}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      style={{ minHeight: 38, padding: '0 14px' }}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Desktop Data Table Container */
            <Card style={{ overflow: 'hidden', padding: 0, marginBottom: 20 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Customer</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Tags</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Branch</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Loyalty Balance</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Visits & Spend</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Last Visit</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map(c => (
                      <tr
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {/* Customer Details */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                backgroundColor: '#4F6BFF',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: 13,
                              }}
                            >
                              {getInitials(c.name)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: '#0F172A' }}>{c.name}</div>
                              <div style={{ fontSize: 12, color: '#64748B' }}>{c.phone}</div>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '14px 16px' }}>
                          <StatusBadge status={c.status === 'ACTIVE' ? 'active' : 'inactive'} label={c.status} />
                        </td>

                        {/* Tags */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {c.tags?.length > 0 ? (
                              c.tags.map((t: any) => (
                                <span
                                  key={t.tag.id}
                                  style={{
                                    fontSize: 11,
                                    padding: '2px 8px',
                                    borderRadius: 12,
                                    backgroundColor: `${t.tag.color}15`,
                                    color: t.tag.color,
                                    fontWeight: 600,
                                    border: `1px solid ${t.tag.color}30`,
                                  }}
                                >
                                  {t.tag.name}
                                </span>
                              ))
                            ) : (
                              <span style={{ fontSize: 12, color: '#94A3B8' }}>None</span>
                            )}
                          </div>
                        </td>

                        {/* Branch */}
                        <td style={{ padding: '14px 16px', color: '#475569' }}>
                          {c.branch?.name || 'All Branches'}
                        </td>

                        {/* Loyalty Balances */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#059669',
                                backgroundColor: '#ECFDF5',
                                padding: '2px 8px',
                                borderRadius: 6,
                              }}
                            >
                              {c.stampsBalance} stamps
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#2563EB',
                                backgroundColor: '#EFF6FF',
                                padding: '2px 8px',
                                borderRadius: 6,
                              }}
                            >
                              {c.pointsBalance} pts
                            </span>
                          </div>
                        </td>

                        {/* Visits & Spend */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>
                            {formatCurrency(c.totalSpendMinor)}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748B' }}>
                            {c.totalVisits} visit{c.totalVisits === 1 ? '' : 's'}
                          </div>
                        </td>

                        {/* Last Visit */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ color: '#0F172A', fontWeight: 500 }}>
                            {formatRelativeTime(c.lastVisitAt)}
                          </div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>
                            {formatDate(c.lastVisitAt)}
                          </div>
                        </td>

                        {/* Action */}
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={e => {
                              e.stopPropagation();
                              handleSelectCustomer(c);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Eye size={14} />
                            View 360
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderTop: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                  }}
                >
                  <div style={{ fontSize: 13, color: '#64748B', textAlign: 'left' }}>
                    Showing {(currentPage - 1) * pageSize + 1} to{' '}
                    {Math.min(currentPage * pageSize, totalCustomersCount)} of {totalCustomersCount} customers
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 'auto', justifyContent: 'center' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      style={{ minHeight: 38, padding: '0 14px' }}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      style={{ minHeight: 38, padding: '0 14px' }}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: CUSTOMER 360 VIEW & PROFILE */}
      {/* ==================================================================== */}
      {activeTab === 'profile' && (
        <div>
          {!selectedCustomerId ? (
            <Card style={{ padding: 48, textAlign: 'center' }}>
              <UserCheck size={36} style={{ color: '#94A3B8', margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>
                No customer selected
              </h3>
              <p style={{ fontSize: 14, color: '#64748B', maxWidth: 400, margin: '0 auto 16px' }}>
                Select a customer from the directory to view their complete 360° profile, activity timeline, loyalty cards, staff notes, and tags.
              </p>
              <Button variant="primary" onClick={() => setActiveTab('directory')}>
                Open Customer Directory
              </Button>
            </Card>
          ) : loading360 ? (
            <Card style={{ padding: 48, textAlign: 'center', color: '#64748B' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              Loading customer 360 profile...
            </Card>
          ) : customer360 ? (
            <div>
              {/* Back button on mobile */}
              {isMobile && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('directory')}
                  style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 38 }}
                >
                  <ChevronLeft size={16} /> Back to Directory
                </Button>
              )}

              {/* Profile Hero Header */}
              <Card style={{ padding: isMobile ? 16 : 24, marginBottom: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: 16, width: isMobile ? '100%' : 'auto' }}>
                    <div
                      style={{
                        width: isMobile ? 48 : 56,
                        height: isMobile ? 48 : 56,
                        borderRadius: '50%',
                        backgroundColor: '#4F6BFF',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: isMobile ? 18 : 20,
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(customer360.customer.name)}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: '#0F172A', margin: 0, wordBreak: 'break-word' }}>
                          {customer360.customer.name}
                        </h2>
                        <StatusBadge
                          status={customer360.customer.status === 'ACTIVE' ? 'active' : 'inactive'}
                          label={customer360.customer.status}
                        />
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: isMobile ? '6px 12px' : 16,
                          marginTop: 6,
                          fontSize: 13,
                          color: '#64748B',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Phone size={14} style={{ flexShrink: 0 }} />
                          {customer360.customer.phone}
                        </span>
                        {customer360.customer.email && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, wordBreak: 'break-all' }}>
                            <Mail size={14} style={{ flexShrink: 0 }} />
                            {customer360.customer.email}
                          </span>
                        )}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={14} style={{ flexShrink: 0 }} />
                          Joined {formatDate(customer360.customer.joinedAt)}
                        </span>
                        {customer360.customer.branch && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Store size={14} style={{ flexShrink: 0 }} />
                            {customer360.customer.branch.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: isMobile ? '100%' : 'auto' }}>
                    <Button
                      variant="primary"
                      onClick={handleOpenEditProfile}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: isMobile ? '100%' : 'auto', minHeight: 40, fontSize: 13, fontWeight: 600 }}
                    >
                      <Edit2 size={14} />
                      Edit Profile
                    </Button>
                    <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? (onNavigate ? '1fr 1fr' : '1fr') : undefined, gap: 8, width: isMobile ? '100%' : 'auto' }}>
                      {onNavigate && (
                        <Button
                          variant="outline"
                          onClick={() => onNavigate('loyalty')}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38, fontSize: 13, padding: '0 8px', whiteSpace: 'nowrap' }}
                        >
                          <Award size={14} />
                          Loyalty Terminal
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => setIsAssignTagOpen(true)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38, fontSize: 13, padding: '0 8px', whiteSpace: 'nowrap' }}
                      >
                        <Tag size={14} />
                        Assign Tag
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Assigned Tags Pills */}
                {customer360.tags.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 18,
                      paddingTop: 16,
                      borderTop: '1px solid #F1F5F9',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Assigned Tags:</span>
                    {customer360.tags.map(t => (
                      <span
                        key={t.id}
                        style={{
                          fontSize: 12,
                          padding: '3px 10px',
                          borderRadius: 14,
                          backgroundColor: `${t.color}15`,
                          color: t.color,
                          fontWeight: 600,
                          border: `1px solid ${t.color}30`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {t.name}
                        <button
                          onClick={() => handleRemoveTag(t.id)}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            color: t.color,
                          }}
                          title="Remove Tag"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Card>

              {/* KPI Summary Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: isMobile ? 10 : 16,
                  marginBottom: 20,
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <Card style={{ padding: isMobile ? 12 : 18 }}>
                  <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Lifetime Spend
                  </div>
                  <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
                    {formatCurrency(customer360.customer.totalSpendMinor)}
                  </div>
                  <div style={{ fontSize: 11, color: '#10B981', marginTop: 4 }}>
                    {customer360.customer.totalVisits} visits
                  </div>
                </Card>

                <Card style={{ padding: isMobile ? 12 : 18 }}>
                  <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Stamps Balance
                  </div>
                  <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: '#059669', marginTop: 4 }}>
                    {customer360.customer.stampsBalance}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                    {customer360.loyalty.lifetimeStampsEarned} earned
                  </div>
                </Card>

                <Card style={{ padding: isMobile ? 12 : 18 }}>
                  <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Points Balance
                  </div>
                  <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: '#2563EB', marginTop: 4 }}>
                    {customer360.customer.pointsBalance}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                    {customer360.loyalty.lifetimePointsEarned} earned
                  </div>
                </Card>

                <Card style={{ padding: isMobile ? 12 : 18 }}>
                  <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Rewards
                  </div>
                  <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: '#8B5CF6', marginTop: 4 }}>
                    {customer360.rewardsSummary.totalRedeemed} redeemed
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {customer360.rewardsSummary.activeVouchers.length} active voucher{customer360.rewardsSummary.activeVouchers.length === 1 ? '' : 's'}
                  </div>
                </Card>
              </div>

              {/* Profile Sub-tabs */}
              {isMobile ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    backgroundColor: '#F1F5F9',
                    padding: '3px',
                    borderRadius: '10px',
                    marginBottom: 16,
                    gap: 3,
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <button
                    onClick={() => setProfileSubTab('timeline')}
                    style={{
                      padding: '8px 4px',
                      fontSize: 11,
                      fontWeight: profileSubTab === 'timeline' ? 700 : 500,
                      borderRadius: '7px',
                      border: 'none',
                      backgroundColor: profileSubTab === 'timeline' ? '#FFFFFF' : 'transparent',
                      color: profileSubTab === 'timeline' ? '#4F6BFF' : '#64748B',
                      boxShadow: profileSubTab === 'timeline' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Clock size={12} />
                    Timeline
                  </button>

                  <button
                    onClick={() => setProfileSubTab('notes')}
                    style={{
                      padding: '8px 4px',
                      fontSize: 11,
                      fontWeight: profileSubTab === 'notes' ? 700 : 500,
                      borderRadius: '7px',
                      border: 'none',
                      backgroundColor: profileSubTab === 'notes' ? '#FFFFFF' : 'transparent',
                      color: profileSubTab === 'notes' ? '#4F6BFF' : '#64748B',
                      boxShadow: profileSubTab === 'notes' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <Edit2 size={12} />
                    Notes ({customer360.notes.length})
                  </button>

                  <button
                    onClick={() => setProfileSubTab('consents')}
                    style={{
                      padding: '8px 4px',
                      fontSize: 11,
                      fontWeight: profileSubTab === 'consents' ? 700 : 500,
                      borderRadius: '7px',
                      border: 'none',
                      backgroundColor: profileSubTab === 'consents' ? '#FFFFFF' : 'transparent',
                      color: profileSubTab === 'consents' ? '#4F6BFF' : '#64748B',
                      boxShadow: profileSubTab === 'consents' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <ShieldCheck size={12} />
                    Privacy
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    borderBottom: '1px solid #E2E8F0',
                    marginBottom: 20,
                    gap: 8,
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                    paddingBottom: 2,
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  <button
                    onClick={() => setProfileSubTab('timeline')}
                    style={{
                      padding: '10px 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      borderBottom: profileSubTab === 'timeline' ? '2px solid #4F6BFF' : '2px solid transparent',
                      color: profileSubTab === 'timeline' ? '#4F6BFF' : '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Clock size={16} />
                    Activity Timeline
                  </button>

                  <button
                    onClick={() => setProfileSubTab('notes')}
                    style={{
                      padding: '10px 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      borderBottom: profileSubTab === 'notes' ? '2px solid #4F6BFF' : '2px solid transparent',
                      color: profileSubTab === 'notes' ? '#4F6BFF' : '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Edit2 size={16} />
                    Staff Notes ({customer360.notes.length})
                  </button>

                  <button
                    onClick={() => setProfileSubTab('consents')}
                    style={{
                      padding: '10px 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      borderBottom: profileSubTab === 'consents' ? '2px solid #4F6BFF' : '2px solid transparent',
                      color: profileSubTab === 'consents' ? '#4F6BFF' : '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <ShieldCheck size={16} />
                    Privacy & Consents
                  </button>
                </div>
              )}

              {/* Sub-tab 1: Activity Timeline */}
              {profileSubTab === 'timeline' && (
                <Card style={{ padding: isMobile ? 12 : 20, width: '100%', boxSizing: 'border-box' }}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: isMobile ? 'column' : 'row',
                      alignItems: isMobile ? 'stretch' : 'center',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                      gap: 10,
                      width: '100%',
                    }}
                  >
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                      Unified Activity Timeline
                    </h3>

                    {/* Timeline Filter */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : undefined, gap: 6, width: isMobile ? '100%' : 'auto' }}>
                      {['ALL', 'EVENT', 'LOYALTY', 'REDEMPTION'].map(type => (
                        <button
                          key={type}
                          onClick={() => setTimelineTypeFilter(type)}
                          style={{
                            padding: '6px 4px',
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: 6,
                            border: '1px solid',
                            borderColor: timelineTypeFilter === type ? '#4F6BFF' : '#CBD5E1',
                            backgroundColor: timelineTypeFilter === type ? '#EEF2FF' : '#FFFFFF',
                            color: timelineTypeFilter === type ? '#4F6BFF' : '#64748B',
                            cursor: 'pointer',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {type === 'ALL' ? 'All' : type === 'EVENT' ? 'Events' : type === 'LOYALTY' ? 'Loyalty' : 'Rewards'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {loadingTimeline ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                      Loading timeline activity...
                    </div>
                  ) : timelineItems.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>
                      No timeline events found for this filter.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {timelineItems.map((item, idx) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            gap: isMobile ? 8 : 14,
                            position: 'relative',
                            width: '100%',
                            boxSizing: 'border-box',
                          }}
                        >
                          {/* Dot and connecting line */}
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              width: isMobile ? 16 : 24,
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                backgroundColor: item.badgeColor || '#4F6BFF',
                                marginTop: 6,
                                flexShrink: 0,
                              }}
                            />
                            {idx < timelineItems.length - 1 && (
                              <div
                                style={{
                                  width: 2,
                                  flexGrow: 1,
                                  backgroundColor: '#E2E8F0',
                                  marginTop: 4,
                                }}
                              />
                            )}
                          </div>

                          {/* Event Content Card */}
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              backgroundColor: '#F8FAFC',
                              borderRadius: 8,
                              padding: isMobile ? '10px 12px' : '12px 14px',
                              border: '1px solid #E2E8F0',
                              overflow: 'hidden',
                              boxSizing: 'border-box',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: isMobile ? 'column' : 'row',
                                justifyContent: 'space-between',
                                alignItems: isMobile ? 'flex-start' : 'center',
                                gap: isMobile ? 4 : 8,
                                marginBottom: 4,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    backgroundColor: `${item.badgeColor || '#4F6BFF'}20`,
                                    color: item.badgeColor || '#4F6BFF',
                                    textTransform: 'uppercase',
                                    flexShrink: 0,
                                  }}
                                >
                                  {item.badgeLabel || item.source}
                                </span>
                                <span style={{ fontWeight: 600, color: '#0F172A', fontSize: 13, wordBreak: 'break-word' }}>
                                  {item.title}
                                </span>
                              </div>
                              <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                                {formatDate(item.timestamp)} ({formatRelativeTime(item.timestamp)})
                              </span>
                            </div>

                            {item.description && (
                              <div style={{ fontSize: 12, color: '#475569', marginTop: 3, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                                {item.description}
                              </div>
                            )}

                            {item.actor && (
                              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4, wordBreak: 'break-all' }}>
                                Actor: {item.actor}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Sub-tab 2: Staff Notes */}
              {profileSubTab === 'notes' && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
                  {/* Add Note Form */}
                  <Card style={{ padding: isMobile ? 16 : 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>
                      Add Staff Note
                    </h3>
                    <form onSubmit={handleAddNote}>
                      <Textarea
                        rows={4}
                        placeholder="Write a private note about customer preferences, VIP status, or interactions..."
                        value={newNoteContent}
                        onChange={e => setNewNoteContent(e.target.value)}
                        style={{ marginBottom: 12 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#94A3B8' }}>
                          {newNoteContent.length} / 2000 chars
                        </span>
                        <Button
                          type="submit"
                          variant="primary"
                          disabled={isSubmittingNote || !newNoteContent.trim()}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40 }}
                        >
                          <Send size={14} />
                          {isSubmittingNote ? 'Saving...' : 'Post Note'}
                        </Button>
                      </div>
                    </form>
                  </Card>

                  {/* Notes Roster */}
                  <Card style={{ padding: isMobile ? 16 : 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>
                      Note History ({customer360.notes.length})
                    </h3>

                    {customer360.notes.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8' }}>
                        No notes recorded for this customer yet.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {customer360.notes.map(n => (
                          <div
                            key={n.id}
                            style={{
                              backgroundColor: '#F8FAFC',
                              borderRadius: 8,
                              padding: 12,
                              border: '1px solid #E2E8F0',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 6,
                              }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                                {n.author?.name || 'Staff Member'}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 11, color: '#94A3B8', marginRight: 4 }}>
                                  {formatDate(n.createdAt)}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingNoteId(n.id);
                                    setEditingNoteContent(n.content);
                                  }}
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    color: '#64748B',
                                    padding: 6,
                                    minWidth: 32,
                                    minHeight: 32,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                  title="Edit note"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteNote(n.id)}
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    cursor: 'pointer',
                                    color: '#EF4444',
                                    padding: 6,
                                    minWidth: 32,
                                    minHeight: 32,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                  title="Delete note"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>

                            {editingNoteId === n.id ? (
                              <div>
                                <Textarea
                                  rows={3}
                                  value={editingNoteContent}
                                  onChange={e => setEditingNoteContent(e.target.value)}
                                  style={{ marginBottom: 8, fontSize: 13 }}
                                />
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <Button size="sm" variant="outline" onClick={() => setEditingNoteId(null)}>
                                    Cancel
                                  </Button>
                                  <Button size="sm" variant="primary" onClick={() => handleSaveEditNote(n.id)}>
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 13, color: '#0F172A', whiteSpace: 'pre-wrap' }}>
                                {n.content}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* Sub-tab 3: Privacy & Consents */}
              {profileSubTab === 'consents' && (
                <Card style={{ padding: isMobile ? 14 : 24 }}>
                  <h3 style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, color: '#0F172A', marginBottom: 16 }}>
                    Customer Consent & Privacy Preferences
                  </h3>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: 16,
                      marginBottom: 24,
                    }}
                  >
                    <div
                      style={{
                        padding: isMobile ? 12 : 16,
                        borderRadius: 8,
                        backgroundColor: customer360.customer.marketingConsent ? '#ECFDF5' : '#F1F5F9',
                        border: `1px solid ${customer360.customer.marketingConsent ? '#A7F3D0' : '#E2E8F0'}`,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>
                        Marketing Communications Consent
                      </div>
                      <div
                        style={{
                          fontSize: isMobile ? 15 : 16,
                          fontWeight: 700,
                          color: customer360.customer.marketingConsent ? '#059669' : '#64748B',
                          marginTop: 4,
                          wordBreak: 'break-word',
                        }}
                      >
                        {customer360.customer.marketingConsent ? 'Granted (Opted In)' : 'Revoked / Not Opted In'}
                      </div>
                    </div>
                  </div>

                  <h4 style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 12 }}>
                    Consent History Log
                  </h4>

                  {customer360.consents.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                      No consent history records available.
                    </div>
                  ) : isMobile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {customer360.consents.map((c, i) => (
                        <div
                          key={i}
                          style={{
                            backgroundColor: '#F8FAFC',
                            borderRadius: 8,
                            padding: 12,
                            border: '1px solid #E2E8F0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>{c.channel}</span>
                            <StatusBadge status={c.granted ? 'active' : 'inactive'} label={c.granted ? 'Granted' : 'Revoked'} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#64748B' }}>
                            <span>Policy v{c.version}</span>
                            <span>{formatDate(c.grantedAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead>
                          <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Channel</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Policy Version</th>
                            <th style={{ padding: '10px 14px', fontWeight: 600 }}>Timestamp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customer360.consents.map((c, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 600 }}>{c.channel}</td>
                              <td style={{ padding: '10px 14px' }}>
                                <StatusBadge status={c.granted ? 'active' : 'inactive'} label={c.granted ? 'Granted' : 'Revoked'} />
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748B' }}>{c.version}</td>
                              <td style={{ padding: '10px 14px', color: '#64748B' }}>{formatDate(c.grantedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: AUDIENCE SEGMENTATION */}
      {/* ==================================================================== */}
      {activeTab === 'segments' && (
        <div>
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? 12 : 0,
              marginBottom: 20,
            }}
          >
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Targeted Audience Segments
              </h2>
              <p style={{ fontSize: 14, color: '#64748B', margin: '4px 0 0 0' }}>
                Group customers dynamically using deterministic rules based on spend, visit frequency, recency, and tags.
              </p>
            </div>

            <Button
              variant="primary"
              onClick={() => {
                setSegmentError(null);
                setIsCreateSegmentOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: isMobile ? '100%' : 'auto', minHeight: 42 }}
            >
              <Plus size={16} />
              Create Segment
            </Button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 16,
            }}
          >
            {segments.map(s => (
              <Card key={s.id} style={{ padding: isMobile ? 14 : 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0, wordBreak: 'break-word', minWidth: 0, flex: 1 }}>
                      {s.name}
                    </h3>
                    <div style={{ flexShrink: 0 }}>
                      <StatusBadge status={s.status === 'ACTIVE' ? 'active' : 'inactive'} label={s.status} />
                    </div>
                  </div>

                  <p style={{ fontSize: 13, color: '#64748B', minHeight: isMobile ? 'auto' : 36, marginBottom: 14, wordBreak: 'break-word' }}>
                    {s.description || 'No description provided.'}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: '#EEF2FF',
                      borderRadius: 8,
                      padding: '8px 12px',
                      marginBottom: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Users size={16} color="#4F6BFF" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#4F6BFF' }}>
                      {s.customerCount}
                    </span>
                    <span style={{ fontSize: 13, color: '#4F6BFF' }}>
                      matching customer{s.customerCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  {/* Conditions Preview */}
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16, wordBreak: 'break-word' }}>
                    <span style={{ fontWeight: 600 }}>Rule: </span>
                    Match {s.ruleDefinition?.matchType || 'ALL'} of{' '}
                    {s.ruleDefinition?.conditions?.length || 0} condition{s.ruleDefinition?.conditions?.length === 1 ? '' : 's'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #F1F5F9', paddingTop: 12 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewSegmentCustomers(s)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38 }}
                  >
                    <Eye size={14} />
                    View Roster
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteSegment(s.id, s.name)}
                    style={{ color: '#EF4444', borderColor: '#FCA5A5', minHeight: 38, flexShrink: 0 }}
                    title="Delete segment"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: TAGS MANAGEMENT */}
      {/* ==================================================================== */}
      {activeTab === 'tags' && (
        <div>
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              gap: isMobile ? 12 : 0,
              marginBottom: 20,
            }}
          >
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Customer Tags Catalogue
              </h2>
              <p style={{ fontSize: 14, color: '#64748B', margin: '4px 0 0 0' }}>
                Organize your customer base with color-coded tags for VIP tiers, interests, or manual groupings.
              </p>
            </div>

            <Button
              variant="primary"
              onClick={() => {
                setTagError(null);
                setIsCreateTagOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: isMobile ? '100%' : 'auto', minHeight: 42 }}
            >
              <Plus size={16} />
              Create Tag
            </Button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {tags.map(t => (
              <Card key={t.id} style={{ padding: isMobile ? 14 : 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        backgroundColor: t.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </span>
                  </div>

                  <button
                    onClick={() => handleDeleteTag(t.id, t.name)}
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: '#94A3B8',
                      padding: 4,
                      flexShrink: 0,
                    }}
                    title="Delete tag"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#64748B' }}>
                  <span>Assigned to:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>
                    {t._count?.assignments || 0} customer{t._count?.assignments === 1 ? '' : 's'}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODALS */}
      {/* ==================================================================== */}

      {/* Register Customer Modal */}
      <Modal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        title="Register New Customer"
      >
        <form onSubmit={handleRegisterCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {registerError && (
            <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: '#FEF2F2', color: '#B91C1C', fontSize: 13 }}>
              {registerError}
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Full Name *
            </label>
            <Input
              required
              placeholder="e.g. John Doe"
              value={registerForm.name}
              onChange={e => setRegisterForm({ ...registerForm, name: e.target.value })}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Phone Number * (Business Scoped)
            </label>
            <Input
              required
              placeholder="+15551234567"
              value={registerForm.phone}
              onChange={e => setRegisterForm({ ...registerForm, phone: e.target.value })}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Email Address (Optional)
            </label>
            <Input
              type="email"
              placeholder="john@example.com"
              value={registerForm.email}
              onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Home Branch
            </label>
            <select
              value={registerForm.branchId}
              onChange={e => setRegisterForm({ ...registerForm, branchId: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="">Default Branch</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Birthday (Optional)
            </label>
            <Input
              type="date"
              value={registerForm.birthday}
              onChange={e => setRegisterForm({ ...registerForm, birthday: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              id="marketingConsent"
              checked={registerForm.marketingConsent}
              onChange={e => setRegisterForm({ ...registerForm, marketingConsent: e.target.checked })}
            />
            <label htmlFor="marketingConsent" style={{ fontSize: 13, color: '#475569', cursor: 'pointer' }}>
              Customer consents to receive promotions & loyalty updates
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button variant="outline" type="button" onClick={() => setIsRegisterModalOpen(false)} style={{ minHeight: 42, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isRegistering} style={{ minHeight: 42, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              {isRegistering ? 'Registering...' : 'Register Customer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Customer Profile Modal */}
      <Modal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        title="Edit Customer Profile"
      >
        <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {editProfileError && (
            <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: '#FEF2F2', color: '#B91C1C', fontSize: 13 }}>
              {editProfileError}
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Full Name *
            </label>
            <Input
              required
              value={editProfileForm.name}
              onChange={e => setEditProfileForm({ ...editProfileForm, name: e.target.value })}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Email Address
            </label>
            <Input
              type="email"
              value={editProfileForm.email}
              onChange={e => setEditProfileForm({ ...editProfileForm, email: e.target.value })}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Status
            </label>
            <select
              value={editProfileForm.status}
              onChange={e => setEditProfileForm({ ...editProfileForm, status: e.target.value as any })}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Branch
            </label>
            <select
              value={editProfileForm.branchId}
              onChange={e => setEditProfileForm({ ...editProfileForm, branchId: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="">No specific branch</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Birthday
            </label>
            <Input
              type="date"
              value={editProfileForm.birthday}
              onChange={e => setEditProfileForm({ ...editProfileForm, birthday: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button variant="outline" type="button" onClick={() => setIsEditProfileOpen(false)} style={{ minHeight: 42, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isUpdatingProfile} style={{ minHeight: 42, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              {isUpdatingProfile ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Assign Tag Modal */}
      <Modal
        isOpen={isAssignTagOpen}
        onClose={() => setIsAssignTagOpen(false)}
        title="Assign Tag to Customer"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>
            Choose a tag to assign to {customer360?.customer.name}:
          </p>

          <select
            value={selectedTagToAssign}
            onChange={e => setSelectedTagToAssign(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 14,
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
            }}
          >
            <option value="">Select a tag...</option>
            {tags
              .filter(t => !customer360?.tags.some(ct => ct.id === t.id))
              .map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>

          <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="outline" onClick={() => setIsAssignTagOpen(false)} style={{ minHeight: 42, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!selectedTagToAssign || isAssigningTag}
              onClick={handleAssignTag}
              style={{ minHeight: 42, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}
            >
              {isAssigningTag ? 'Assigning...' : 'Assign Tag'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Tag Modal */}
      <Modal
        isOpen={isCreateTagOpen}
        onClose={() => setIsCreateTagOpen(false)}
        title="Create Customer Tag"
      >
        <form onSubmit={handleCreateTag} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tagError && (
            <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: '#FEF2F2', color: '#B91C1C', fontSize: 13 }}>
              {tagError}
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6, display: 'block' }}>
              Tag Name *
            </label>
            <Input
              required
              placeholder="e.g. VIP Gold, Weekend Regular, Vegan"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>
              Badge Color
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TAG_COLORS.map(c => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setNewTagColor(c.hex)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: c.hex,
                    border: newTagColor === c.hex ? '3px solid #0F172A' : '1px solid transparent',
                    cursor: 'pointer',
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button variant="outline" type="button" onClick={() => setIsCreateTagOpen(false)} style={{ minHeight: 42, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isCreatingTag} style={{ minHeight: 42, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              {isCreatingTag ? 'Creating...' : 'Create Tag'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Segment Modal */}
      <Modal
        isOpen={isCreateSegmentOpen}
        onClose={() => setIsCreateSegmentOpen(false)}
        title="Create Audience Segment"
      >
        <form onSubmit={handleCreateSegment} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '80vh', overflowY: 'auto' }}>
          {segmentError && (
            <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: '#FEF2F2', color: '#B91C1C', fontSize: 13 }}>
              {segmentError}
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Segment Name *
            </label>
            <Input
              required
              placeholder="e.g. High Spenders, Lapsed Regulars"
              value={segmentName}
              onChange={e => setSegmentName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' }}>
              Description
            </label>
            <Input
              placeholder="Brief description of this segment"
              value={segmentDescription}
              onChange={e => setSegmentDescription(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6, display: 'block' }}>
              Match Criteria
            </label>
            <select
              value={segmentMatchType}
              onChange={e => setSegmentMatchType(e.target.value as any)}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="ALL">Match ALL conditions (AND)</option>
              <option value="ANY">Match ANY condition (OR)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>
              Rule Conditions
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {segmentConditions.map((cond, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'stretch' : 'center',
                    gap: 8,
                    padding: 10,
                    backgroundColor: '#F8FAFC',
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                  }}
                >
                  {/* Field Selector */}
                  <select
                    value={cond.field}
                    onChange={e => handleConditionChange(idx, 'field', e.target.value)}
                    style={{
                      flex: isMobile ? 'none' : 1,
                      width: isMobile ? '100%' : 'auto',
                      padding: '8px 10px',
                      fontSize: 13,
                      borderRadius: 6,
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      minHeight: 38,
                    }}
                  >
                    <option value="totalVisits">Total Visits</option>
                    <option value="totalSpendMinor">Spend (Paisa / Cents)</option>
                    <option value="stampsBalance">Stamps Balance</option>
                    <option value="pointsBalance">Points Balance</option>
                    <option value="lastVisitAt">Last Visit</option>
                    <option value="status">Customer Status</option>
                    <option value="tagId">Assigned Tag</option>
                  </select>

                  {/* Operator Selector */}
                  <select
                    value={cond.operator}
                    onChange={e => handleConditionChange(idx, 'operator', e.target.value)}
                    style={{
                      flex: isMobile ? 'none' : 1,
                      width: isMobile ? '100%' : 'auto',
                      padding: '8px 10px',
                      fontSize: 13,
                      borderRadius: 6,
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      minHeight: 38,
                    }}
                  >
                    {cond.field === 'lastVisitAt' ? (
                      <>
                        <option value="within_days">Within last X days</option>
                        <option value="before_days">Before X days ago</option>
                      </>
                    ) : cond.field === 'tagId' ? (
                      <>
                        <option value="equals">Has Tag</option>
                        <option value="not_equals">Does Not Have Tag</option>
                      </>
                    ) : cond.field === 'status' ? (
                      <>
                        <option value="equals">Equals</option>
                        <option value="not_equals">Not Equals</option>
                      </>
                    ) : (
                      <>
                        <option value="greater_than_or_equal">Greater than or equal (&gt;=)</option>
                        <option value="less_than_or_equal">Less than or equal (&lt;=)</option>
                        <option value="equals">Equals (==)</option>
                      </>
                    )}
                  </select>

                  {/* Value Input */}
                  {cond.field === 'tagId' ? (
                    <select
                      value={cond.value}
                      onChange={e => handleConditionChange(idx, 'value', e.target.value)}
                      style={{
                        flex: isMobile ? 'none' : 1,
                        width: isMobile ? '100%' : 'auto',
                        padding: '8px 10px',
                        fontSize: 13,
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        minHeight: 38,
                      }}
                    >
                      <option value="">Select Tag...</option>
                      {tags.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  ) : cond.field === 'status' ? (
                    <select
                      value={cond.value}
                      onChange={e => handleConditionChange(idx, 'value', e.target.value)}
                      style={{
                        flex: isMobile ? 'none' : 1,
                        width: isMobile ? '100%' : 'auto',
                        padding: '8px 10px',
                        fontSize: 13,
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        minHeight: 38,
                      }}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                      <option value="BLOCKED">BLOCKED</option>
                    </select>
                  ) : (
                    <input
                      type="number"
                      value={cond.value}
                      onChange={e => handleConditionChange(idx, 'value', Number(e.target.value))}
                      style={{
                        width: isMobile ? '100%' : 90,
                        padding: '8px 10px',
                        fontSize: 13,
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        minHeight: 38,
                      }}
                    />
                  )}

                  {segmentConditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCondition(idx)}
                      style={{
                        alignSelf: isMobile ? 'flex-end' : 'center',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        border: 'none',
                        background: isMobile ? '#FEE2E2' : 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color: '#EF4444',
                        padding: isMobile ? '6px 12px' : 4,
                        fontSize: 12,
                        fontWeight: 600,
                        minHeight: isMobile ? 36 : 'auto',
                      }}
                      title="Remove condition"
                    >
                      <X size={16} />
                      {isMobile && <span>Remove Condition</span>}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCondition}
              style={{ marginTop: 8, minHeight: 38 }}
            >
              <Plus size={14} style={{ marginRight: 4 }} />
              Add Another Condition
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button variant="outline" type="button" onClick={() => setIsCreateSegmentOpen(false)} style={{ minHeight: 42, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSavingSegment} style={{ minHeight: 42, width: isMobile ? '100%' : 'auto', justifyContent: 'center' }}>
              {isSavingSegment ? 'Saving...' : 'Create Segment'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Segment Customers Roster Drawer/Modal */}
      <Modal
        isOpen={activeSegmentForView !== null}
        onClose={() => setActiveSegmentForView(null)}
        title={activeSegmentForView ? `Segment Roster: ${activeSegmentForView.name}` : ''}
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {loadingSegmentCustomers ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>
              <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              Evaluating segment rules...
            </div>
          ) : segmentCustomers.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>
              No customers currently match this segment's criteria.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {segmentCustomers.map(c => (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveSegmentForView(null);
                    handleSelectCustomer(c);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 12,
                    backgroundColor: '#F8FAFC',
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: '#4F6BFF',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {getInitials(c.name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 14 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>{c.phone}</div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
                      {formatCurrency(c.totalSpendMinor)}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B' }}>
                      {c.totalVisits} visits
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Mobile Filter Sheet Modal */}
      <Modal
        isOpen={isMobileFilterModalOpen}
        onClose={() => setIsMobileFilterModalOpen(false)}
        title="Filter Customers"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Customer Status
            </label>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                height: 44,
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Branch
            </label>
            <select
              value={branchFilter}
              onChange={e => {
                setBranchFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                height: 44,
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
              }}
            >
              <option value="ALL">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Tag
            </label>
            <select
              value={tagFilter}
              onChange={e => {
                setTagFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                height: 44,
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
              }}
            >
              <option value="ALL">All Tags</option>
              {tags.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Segment
            </label>
            <select
              value={segmentFilter}
              onChange={e => {
                setSegmentFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                height: 44,
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
              }}
            >
              <option value="ALL">All Segments</option>
              {segments.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.customerCount})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingTop: 14, borderTop: '1px solid #E2E8F0' }}>
            <Button
              variant="outline"
              onClick={() => {
                setStatusFilter('ALL');
                setBranchFilter('ALL');
                setTagFilter('ALL');
                setSegmentFilter('ALL');
                setCurrentPage(1);
                setIsMobileFilterModalOpen(false);
              }}
              style={{ flex: 1, height: 44, justifyContent: 'center' }}
            >
              Reset All
            </Button>
            <Button
              variant="primary"
              onClick={() => setIsMobileFilterModalOpen(false)}
              style={{ flex: 1, height: 44, justifyContent: 'center' }}
            >
              Apply Filters
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
