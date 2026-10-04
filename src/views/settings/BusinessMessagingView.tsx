import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Mail,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Shield,
  Save,
  RefreshCw,
  Power,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTenant } from '../../context/TenantContext';
import { useToast } from '../../context/ToastContext';
import { AdminRoute } from '../../types/loyalty';
import { MaskedProviderConfigResponse } from '../../types/provider';

export interface BusinessMessagingViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

type ChannelTab = 'SMS' | 'WHATSAPP' | 'EMAIL';

export const BusinessMessagingView: React.FC<BusinessMessagingViewProps> = ({ onNavigate }) => {
  const { currentBusiness } = useTenant();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ChannelTab>('SMS');
  const [configs, setConfigs] = useState<Record<ChannelTab, MaskedProviderConfigResponse | null>>({
    SMS: null,
    WHATSAPP: null,
    EMAIL: null,
  });

  // SMS (MSG91) Form State
  const [smsAuthKey, setSmsAuthKey] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [smsRoute, setSmsRoute] = useState('4');
  const [smsEntityId, setSmsEntityId] = useState('');
  const [smsTemplateId, setSmsTemplateId] = useState('');
  const [smsSaving, setSmsSaving] = useState(false);
  const [smsTesting, setSmsTesting] = useState(false);
  const [smsTestResult, setSmsTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // WhatsApp (Meta) Form State
  const [waAccessToken, setWaAccessToken] = useState('');
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('');
  const [waBusinessAccountId, setWaBusinessAccountId] = useState('');
  const [waAppSecret, setWaAppSecret] = useState('');
  const [waDefaultLanguage, setWaDefaultLanguage] = useState('en_US');
  const [waSaving, setWaSaving] = useState(false);
  const [waTesting, setWaTesting] = useState(false);
  const [waTestResult, setWaTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Email (SendGrid) Form State
  const [emailApiKey, setEmailApiKey] = useState('');
  const [emailFromEmail, setEmailFromEmail] = useState('');
  const [emailFromName, setEmailFromName] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/business/messaging/config');
      if (res.ok) {
        const data = await res.json();
        const confMap: Record<ChannelTab, MaskedProviderConfigResponse | null> = {
          SMS: null,
          WHATSAPP: null,
          EMAIL: null,
        };
        (data.configs || []).forEach((c: MaskedProviderConfigResponse) => {
          if (c.channel === 'SMS' || c.channel === 'WHATSAPP' || c.channel === 'EMAIL') {
            confMap[c.channel as ChannelTab] = c;
          }
        });
        setConfigs(confMap);

        // Populate forms from fetched configs
        if (confMap.SMS) {
          setSmsSenderId(confMap.SMS.settings?.senderId || '');
          setSmsRoute(String(confMap.SMS.settings?.route || '4'));
          setSmsEntityId(confMap.SMS.settings?.entityId || '');
          setSmsTemplateId(confMap.SMS.settings?.dltTemplateId || '');
        }
        if (confMap.WHATSAPP) {
          setWaPhoneNumberId(confMap.WHATSAPP.settings?.phoneNumberId || '');
          setWaBusinessAccountId(confMap.WHATSAPP.settings?.businessAccountId || '');
          setWaDefaultLanguage(confMap.WHATSAPP.settings?.defaultLanguage || 'en_US');
        }
        if (confMap.EMAIL) {
          setEmailFromEmail(confMap.EMAIL.settings?.fromEmail || '');
          setEmailFromName(confMap.EMAIL.settings?.fromName || '');
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch provider configs:', err);
      addToast({ type: 'error', title: 'Error', message: 'Failed to load messaging configurations' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, [currentBusiness?.id]);

  // Save SMS Config
  const handleSaveSms = async () => {
    try {
      setSmsSaving(true);
      const payload: any = {
        provider: 'MSG91',
        isEnabled: configs.SMS?.isEnabled ?? true,
        settings: {
          senderId: smsSenderId.trim(),
          route: Number(smsRoute) || 4,
          entityId: smsEntityId.trim() || undefined,
          dltTemplateId: smsTemplateId.trim() || undefined,
        },
      };
      if (smsAuthKey.trim()) {
        payload.credentials = { authKey: smsAuthKey.trim() };
      }

      const res = await fetch('/api/business/messaging/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'SMS', ...payload }),
      });

      if (res.ok) {
        addToast({ type: 'success', title: 'Config Saved', message: 'SMS (MSG91) provider saved successfully' });
        setSmsAuthKey('');
        await fetchConfigs();
      } else {
        const err = await res.json();
        addToast({ type: 'error', title: 'Save Failed', message: err.error || 'Failed to save SMS config' });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Network error' });
    } finally {
      setSmsSaving(false);
    }
  };

  // Test SMS Connection
  const handleTestSms = async () => {
    try {
      setSmsTesting(true);
      setSmsTestResult(null);
      const res = await fetch('/api/business/messaging/config/SMS/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smsAuthKey.trim() ? { credentials: { authKey: smsAuthKey.trim() } } : {}),
      });
      const data = await res.json();
      setSmsTestResult({
        success: data.success,
        message: data.message || (data.success ? 'MSG91 credentials verified' : data.error || 'Failed'),
      });
      if (data.success) {
        addToast({ type: 'success', title: 'Connected', message: 'MSG91 connection verified' });
      } else {
        addToast({ type: 'error', title: 'Connection Failed', message: data.message || 'Connection test failed' });
      }
    } catch (err: any) {
      setSmsTestResult({ success: false, message: err.message || 'Network error' });
    } finally {
      setSmsTesting(false);
    }
  };

  // Save WhatsApp Config
  const handleSaveWhatsApp = async () => {
    try {
      setWaSaving(true);
      const payload: any = {
        provider: 'META_WHATSAPP',
        isEnabled: configs.WHATSAPP?.isEnabled ?? true,
        settings: {
          phoneNumberId: waPhoneNumberId.trim(),
          businessAccountId: waBusinessAccountId.trim() || undefined,
          defaultLanguage: waDefaultLanguage.trim() || 'en_US',
        },
      };
      if (waAccessToken.trim() || waAppSecret.trim()) {
        payload.credentials = {
          accessToken: waAccessToken.trim() || undefined,
          appSecret: waAppSecret.trim() || undefined,
        };
      }

      const res = await fetch('/api/business/messaging/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'WHATSAPP', ...payload }),
      });

      if (res.ok) {
        addToast({ type: 'success', title: 'Config Saved', message: 'Meta WhatsApp Cloud API config saved' });
        setWaAccessToken('');
        setWaAppSecret('');
        await fetchConfigs();
      } else {
        const err = await res.json();
        addToast({ type: 'error', title: 'Save Failed', message: err.error || 'Failed to save WhatsApp config' });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Network error' });
    } finally {
      setWaSaving(false);
    }
  };

  // Test WhatsApp Connection
  const handleTestWhatsApp = async () => {
    try {
      setWaTesting(true);
      setWaTestResult(null);
      const res = await fetch('/api/business/messaging/config/WHATSAPP/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          waAccessToken.trim()
            ? { credentials: { accessToken: waAccessToken.trim(), appSecret: waAppSecret.trim() || undefined } }
            : {}
        ),
      });
      const data = await res.json();
      setWaTestResult({
        success: data.success,
        message: data.message || (data.success ? 'Meta Cloud API verified' : data.error || 'Failed'),
      });
      if (data.success) {
        addToast({ type: 'success', title: 'Connected', message: 'Meta Cloud API verified' });
      } else {
        addToast({ type: 'error', title: 'Connection Failed', message: data.message || 'Connection test failed' });
      }
    } catch (err: any) {
      setWaTestResult({ success: false, message: err.message || 'Network error' });
    } finally {
      setWaTesting(false);
    }
  };

  // Save Email Config
  const handleSaveEmail = async () => {
    try {
      setEmailSaving(true);
      const payload: any = {
        provider: 'SENDGRID',
        isEnabled: configs.EMAIL?.isEnabled ?? true,
        settings: {
          fromEmail: emailFromEmail.trim(),
          fromName: emailFromName.trim() || undefined,
        },
      };
      if (emailApiKey.trim()) {
        payload.credentials = { apiKey: emailApiKey.trim() };
      }

      const res = await fetch('/api/business/messaging/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'EMAIL', ...payload }),
      });

      if (res.ok) {
        addToast({ type: 'success', title: 'Config Saved', message: 'SendGrid email provider config saved' });
        setEmailApiKey('');
        await fetchConfigs();
      } else {
        const err = await res.json();
        addToast({ type: 'error', title: 'Save Failed', message: err.error || 'Failed to save Email config' });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Network error' });
    } finally {
      setEmailSaving(false);
    }
  };

  // Test Email Connection
  const handleTestEmail = async () => {
    try {
      setEmailTesting(true);
      setEmailTestResult(null);
      const res = await fetch('/api/business/messaging/config/EMAIL/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailApiKey.trim() ? { credentials: { apiKey: emailApiKey.trim() } } : {}),
      });
      const data = await res.json();
      setEmailTestResult({
        success: data.success,
        message: data.message || (data.success ? 'SendGrid API key verified' : data.error || 'Failed'),
      });
      if (data.success) {
        addToast({ type: 'success', title: 'Connected', message: 'SendGrid connection verified' });
      } else {
        addToast({ type: 'error', title: 'Connection Failed', message: data.message || 'Connection test failed' });
      }
    } catch (err: any) {
      setEmailTestResult({ success: false, message: err.message || 'Network error' });
    } finally {
      setEmailTesting(false);
    }
  };

  // Toggle Channel
  const handleToggleChannel = async (channel: ChannelTab, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/business/messaging/config/${channel}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !currentEnabled }),
      });
      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Status Updated',
          message: `${channel} provider ${!currentEnabled ? 'enabled' : 'paused'}`,
        });
        await fetchConfigs();
      } else {
        const err = await res.json();
        addToast({ type: 'error', title: 'Toggle Failed', message: err.error || 'Failed to toggle status' });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Network error' });
    }
  };

  const getStatusBadge = (cfg: MaskedProviderConfigResponse | null) => {
    if (!cfg?.isConfigured) {
      return <StatusBadge status="inactive" label="Not Configured" />;
    }
    if (cfg.isEnabled) {
      return <StatusBadge status="active" label="Connected" />;
    }
    return <StatusBadge status="pending" label="Paused" />;
  };

  return (
    <PageContainer>
      <PageHeader
        title="Messaging & External Providers"
        description="Configure enterprise SMS (MSG91), WhatsApp (Meta Cloud API), and Email (SendGrid) connectors."
        actions={
          onNavigate ? (
            <Button variant="outline" size="sm" onClick={() => onNavigate('settings')}>
              Back to Settings
            </Button>
          ) : undefined
        }
      />

      {/* Security Notice */}
      <Card
        style={{
          padding: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
          backgroundColor: '#F8FAFC',
          border: '1px solid var(--color-border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <Shield size={20} color="var(--color-primary)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>Tenant-Isolated Credential Security:</strong> All
          provider API keys, auth tokens, and app secrets are encrypted and stored strictly server-side. Credentials
          are never exposed to browsers or logged.
        </div>
      </Card>

      {/* Provider Channel Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border-subtle)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('SMS')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'SMS' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'SMS' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'SMS' ? 600 : 500,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Smartphone size={18} />
          SMS (MSG91)
          {configs.SMS?.isConfigured && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: configs.SMS.isEnabled ? '#10B981' : '#94A3B8',
              }}
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('WHATSAPP')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'WHATSAPP' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'WHATSAPP' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'WHATSAPP' ? 600 : 500,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <MessageSquare size={18} />
          WhatsApp (Meta Cloud API)
          {configs.WHATSAPP?.isConfigured && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: configs.WHATSAPP.isEnabled ? '#10B981' : '#94A3B8',
              }}
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('EMAIL')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'EMAIL' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'EMAIL' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeTab === 'EMAIL' ? 600 : 500,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Mail size={18} />
          Email (SendGrid)
          {configs.EMAIL?.isConfigured && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: configs.EMAIL.isEnabled ? '#10B981' : '#94A3B8',
              }}
            />
          )}
        </button>
      </div>

      {loading ? (
        <Card style={{ padding: 'var(--space-6)' }}>
          <Skeleton height={32} style={{ marginBottom: 'var(--space-4)' }} />
          <Skeleton height={48} style={{ marginBottom: 'var(--space-3)' }} />
          <Skeleton height={48} style={{ marginBottom: 'var(--space-3)' }} />
          <Skeleton height={40} width={160} />
        </Card>
      ) : (
        <>
          {/* SMS TAB CONTENT */}
          {activeTab === 'SMS' && (
            <Card style={{ padding: 'var(--space-6)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-5)',
                  paddingBottom: 'var(--space-4)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: 0 }}>
                    MSG91 SMS Gateway
                  </h3>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    High-throughput transactional and promotional SMS delivery with India DLT compliance.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  {getStatusBadge(configs.SMS)}
                  {configs.SMS?.isConfigured && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleChannel('SMS', configs.SMS?.isEnabled ?? false)}
                    >
                      <Power size={14} style={{ marginRight: 6 }} />
                      {configs.SMS?.isEnabled ? 'Pause' : 'Enable'}
                    </Button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    MSG91 Auth Key
                  </label>
                  <Input
                    type="password"
                    placeholder={configs.SMS?.maskedCredentials?.authKey ? `Current: ${configs.SMS.maskedCredentials.authKey}` : 'Enter MSG91 Auth Key'}
                    value={smsAuthKey}
                    onChange={(e) => setSmsAuthKey(e.target.value)}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    Leave blank to preserve existing key.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    Sender ID (Header)
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. RPLTYX (6 alphanumeric chars)"
                    value={smsSenderId}
                    onChange={(e) => setSmsSenderId(e.target.value)}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    DLT approved 6-character sender ID.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    DLT Entity ID / PE ID (Optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. 1101234567890123456"
                    value={smsEntityId}
                    onChange={(e) => setSmsEntityId(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    Default DLT Template ID (Optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. 1107161234567890123"
                    value={smsTemplateId}
                    onChange={(e) => setSmsTemplateId(e.target.value)}
                  />
                </div>
              </div>

              {smsTestResult && (
                <div
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-4)',
                    backgroundColor: smsTestResult.success ? '#ECFDF5' : '#FEF2F2',
                    border: `1px solid ${smsTestResult.success ? '#A7F3D0' : '#FECACA'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--font-size-sm)',
                    color: smsTestResult.success ? '#065F46' : '#991B1B',
                  }}
                >
                  {smsTestResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{smsTestResult.message}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <Button
                  variant="outline"
                  onClick={handleTestSms}
                  disabled={smsTesting || (!configs.SMS?.isConfigured && !smsAuthKey.trim())}
                >
                  <RefreshCw size={14} style={{ marginRight: 6 }} className={smsTesting ? 'animate-spin' : ''} />
                  {smsTesting ? 'Testing...' : 'Test Connection'}
                </Button>
                <Button variant="primary" onClick={handleSaveSms} disabled={smsSaving}>
                  <Save size={14} style={{ marginRight: 6 }} />
                  {smsSaving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </Card>
          )}

          {/* WHATSAPP TAB CONTENT */}
          {activeTab === 'WHATSAPP' && (
            <Card style={{ padding: 'var(--space-6)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-5)',
                  paddingBottom: 'var(--space-4)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: 0 }}>
                    Meta WhatsApp Cloud API
                  </h3>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    Official Meta Cloud API connector for approved template-based business notifications.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  {getStatusBadge(configs.WHATSAPP)}
                  {configs.WHATSAPP?.isConfigured && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleChannel('WHATSAPP', configs.WHATSAPP?.isEnabled ?? false)}
                    >
                      <Power size={14} style={{ marginRight: 6 }} />
                      {configs.WHATSAPP?.isEnabled ? 'Pause' : 'Enable'}
                    </Button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    Permanent Access Token
                  </label>
                  <Input
                    type="password"
                    placeholder={configs.WHATSAPP?.maskedCredentials?.accessToken ? `Current: ${configs.WHATSAPP.maskedCredentials.accessToken}` : 'System User Token (EAAB...)'}
                    value={waAccessToken}
                    onChange={(e) => setWaAccessToken(e.target.value)}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    Meta System User permanent token with whatsapp_business_messaging scope.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    Phone Number ID
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. 106543219876543"
                    value={waPhoneNumberId}
                    onChange={(e) => setWaPhoneNumberId(e.target.value)}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    From Meta WhatsApp App &gt; API Setup.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    WhatsApp Business Account ID (WABA ID)
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. 102938475610293"
                    value={waBusinessAccountId}
                    onChange={(e) => setWaBusinessAccountId(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    App Secret (for Webhook Signature Verification)
                  </label>
                  <Input
                    type="password"
                    placeholder={configs.WHATSAPP?.maskedCredentials?.appSecret ? `Current: ${configs.WHATSAPP.maskedCredentials.appSecret}` : 'Meta App Secret'}
                    value={waAppSecret}
                    onChange={(e) => setWaAppSecret(e.target.value)}
                  />
                </div>
              </div>

              {waTestResult && (
                <div
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-4)',
                    backgroundColor: waTestResult.success ? '#ECFDF5' : '#FEF2F2',
                    border: `1px solid ${waTestResult.success ? '#A7F3D0' : '#FECACA'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--font-size-sm)',
                    color: waTestResult.success ? '#065F46' : '#991B1B',
                  }}
                >
                  {waTestResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{waTestResult.message}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <Button
                  variant="outline"
                  onClick={handleTestWhatsApp}
                  disabled={waTesting || (!configs.WHATSAPP?.isConfigured && !waAccessToken.trim())}
                >
                  <RefreshCw size={14} style={{ marginRight: 6 }} className={waTesting ? 'animate-spin' : ''} />
                  {waTesting ? 'Testing...' : 'Test Connection'}
                </Button>
                <Button variant="primary" onClick={handleSaveWhatsApp} disabled={waSaving}>
                  <Save size={14} style={{ marginRight: 6 }} />
                  {waSaving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </Card>
          )}

          {/* EMAIL TAB CONTENT */}
          {activeTab === 'EMAIL' && (
            <Card style={{ padding: 'var(--space-6)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-5)',
                  paddingBottom: 'var(--space-4)',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <div>
                  <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: 0 }}>
                    SendGrid Mail Send API
                  </h3>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    Transactional and dynamic email delivery with verified sender domain authentication.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  {getStatusBadge(configs.EMAIL)}
                  {configs.EMAIL?.isConfigured && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleChannel('EMAIL', configs.EMAIL?.isEnabled ?? false)}
                    >
                      <Power size={14} style={{ marginRight: 6 }} />
                      {configs.EMAIL?.isEnabled ? 'Pause' : 'Enable'}
                    </Button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    SendGrid API Key
                  </label>
                  <Input
                    type="password"
                    placeholder={configs.EMAIL?.maskedCredentials?.apiKey ? `Current: ${configs.EMAIL.maskedCredentials.apiKey}` : 'SG.xxxxxxxxxxxx'}
                    value={emailApiKey}
                    onChange={(e) => setEmailApiKey(e.target.value)}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    SendGrid API key with Mail Send permission.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    Verified Sender Email
                  </label>
                  <Input
                    type="email"
                    placeholder="e.g. rewards@mybusiness.com"
                    value={emailFromEmail}
                    onChange={(e) => setEmailFromEmail(e.target.value)}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    Must match a Single Sender Verification or Authenticated Domain in SendGrid.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 500, fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
                    Sender Name
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Reployty Rewards Team"
                    value={emailFromName}
                    onChange={(e) => setEmailFromName(e.target.value)}
                  />
                </div>
              </div>

              {emailTestResult && (
                <div
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-4)',
                    backgroundColor: emailTestResult.success ? '#ECFDF5' : '#FEF2F2',
                    border: `1px solid ${emailTestResult.success ? '#A7F3D0' : '#FECACA'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--font-size-sm)',
                    color: emailTestResult.success ? '#065F46' : '#991B1B',
                  }}
                >
                  {emailTestResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{emailTestResult.message}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <Button
                  variant="outline"
                  onClick={handleTestEmail}
                  disabled={emailTesting || (!configs.EMAIL?.isConfigured && !emailApiKey.trim())}
                >
                  <RefreshCw size={14} style={{ marginRight: 6 }} className={emailTesting ? 'animate-spin' : ''} />
                  {emailTesting ? 'Testing...' : 'Test Connection'}
                </Button>
                <Button variant="primary" onClick={handleSaveEmail} disabled={emailSaving}>
                  <Save size={14} style={{ marginRight: 6 }} />
                  {emailSaving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </PageContainer>
  );
};
