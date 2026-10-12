import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Download,
  Copy,
  ExternalLink,
  Printer,
  Check,
  Store,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../../context/ToastContext';

export interface StoreQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessName: string;
  businessSlug?: string;
  businessLogo?: string | null;
  qrCode: {
    code: string;
    destinationUrl: string;
    scanCount?: number;
  };
}

export const StoreQrCodeModal: React.FC<StoreQrCodeModalProps> = ({
  isOpen,
  onClose,
  businessName,
  businessSlug,
  businessLogo,
  qrCode,
}) => {
  const { addToast } = useToast();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const [customOrigin, setCustomOrigin] = useState<string>('');
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const effectiveOrigin = customOrigin.trim()
    ? customOrigin.startsWith('http://') || customOrigin.startsWith('https://')
      ? customOrigin.trim()
      : `http://${customOrigin.trim()}`
    : defaultOrigin;

  const customerScanUrl = `${effectiveOrigin}/#join/${qrCode.code}`;

  useEffect(() => {
    if (!isOpen || !customerScanUrl) return;

    QRCode.toDataURL(customerScanUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#111827',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate store QR code:', err));
  }, [isOpen, customerScanUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(customerScanUrl);
      setIsCopied(true);
      addToast({
        type: 'success',
        title: 'Link copied!',
        message: 'Customer QR link copied to clipboard.',
      });
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      addToast({
        type: 'info',
        title: 'Scan URL',
        message: customerScanUrl,
      });
    }
  };

  const handleDownloadPng = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${businessSlug || 'store'}-qr-standee.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    addToast({
      type: 'success',
      title: 'QR Code Downloaded',
      message: 'Store QR code downloaded as high-res PNG!',
    });
  };

  const handlePrintStandee = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Store QR Standee"
      maxWidth="480px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleDownloadPng}
            disabled={!qrDataUrl}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={15} />
            Download QR (PNG)
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {/* Printable Standee Card Container */}
        <div
          ref={printAreaRef}
          style={{
            width: '100%',
            maxWidth: '360px',
            backgroundColor: '#FFFFFF',
            border: '2px solid #E2E8F0',
            borderRadius: '20px',
            padding: '24px 20px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.06)',
            boxSizing: 'border-box',
            marginBottom: '20px',
          }}
        >
          {/* Header Brand */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            {businessLogo ? (
              <img
                src={businessLogo}
                alt={businessName}
                style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  backgroundColor: '#EEF2FF',
                  color: '#4F6BFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px',
                }}
              >
                <Store size={16} />
              </div>
            )}
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
              {businessName}
            </h3>
          </div>

          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 16px 0', fontWeight: 500 }}>
            Scan with any phone camera
          </p>

          {/* Real Scannable QR Code Image */}
          <div
            style={{
              width: '240px',
              height: '240px',
              margin: '0 auto 16px',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '10px',
              boxSizing: 'border-box',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${businessName}`}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  imageRendering: 'pixelated',
                }}
              />
            ) : (
              <div style={{ color: '#94A3B8', fontSize: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <QrCode size={36} className="animate-spin" />
                <span>Generating scannable QR...</span>
              </div>
            )}
          </div>

          {/* Customer Journey Value Proposition */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '12px',
              padding: '10px 12px',
              border: '1px solid #E2E8F0',
              fontSize: '11px',
              color: '#334155',
              display: 'flex',
              justifyContent: 'space-around',
              fontWeight: 600,
            }}
          >
            <span>🎁 Collect Stamps</span>
            <span>•</span>
            <span>⭐ Leave a Review</span>
          </div>

          <div style={{ marginTop: '10px', fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}>
            No app download required • Instant PWA
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Direct URL Box with Copy */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '8px 12px',
              boxSizing: 'border-box',
              fontSize: '12px',
            }}
          >
            <span
              style={{
                fontFamily: 'monospace',
                color: '#475569',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '280px',
              }}
              title={customerScanUrl}
            >
              {customerScanUrl}
            </span>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: isCopied ? '#16A34A' : '#4F6BFF',
                fontWeight: 600,
                fontSize: '12px',
                padding: '4px 6px',
                borderRadius: '6px',
              }}
            >
              {isCopied ? <Check size={14} /> : <Copy size={14} />}
              <span>{isCopied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {isLocalhost && (
            <div
              style={{
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '11px',
                color: '#1E40AF',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '3px' }}>📱 Scanning with a physical mobile camera?</div>
              <div style={{ marginBottom: '6px', color: '#1E3A8A', lineHeight: 1.4 }}>
                Phones on your Wi-Fi cannot open <code>localhost</code>. Enter your computer's LAN IP to regenerate a phone-scannable QR:
              </div>
              <input
                type="text"
                placeholder="e.g. 192.168.1.15:3000"
                value={customOrigin}
                onChange={(e) => setCustomOrigin(e.target.value)}
                style={{
                  width: '100%',
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: '1px solid #93C5FD',
                  fontSize: '12px',
                  backgroundColor: '#FFFFFF',
                  color: '#1E3A8A',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Secondary Quick Action Links */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(customerScanUrl, '_blank')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px' }}
            >
              <ExternalLink size={14} />
              Open Customer Page
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintStandee}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px' }}
            >
              <Printer size={14} />
              Print Table Standee
            </Button>
          </div>

          {typeof qrCode.scanCount === 'number' && (
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
              Lifetime customer scans: <strong>{qrCode.scanCount}</strong>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
