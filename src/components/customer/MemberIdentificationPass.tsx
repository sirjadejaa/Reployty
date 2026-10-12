import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check, Maximize2, X, Sparkles } from 'lucide-react';

export interface MemberIdentificationPassProps {
  customerPhone?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  businessName?: string | null;
  businessLogo?: string | null;
  primaryColor?: string;
  cardStatus?: string;
  compact?: boolean;
  showInstructions?: boolean;
  className?: string;
}

/**
 * Format phone number for clean member identification.
 */
function formatMemberCode(phone?: string | null, id?: string | null): string {
  if (phone && phone.trim()) {
    return phone.trim();
  }
  if (id && id.trim()) {
    return `ID: ${id.slice(0, 8).toUpperCase()}`;
  }
  return 'Member Pass';
}

export const MemberIdentificationPass: React.FC<MemberIdentificationPassProps> = ({
  customerPhone,
  customerId,
  customerName = 'Valued Customer',
  businessName,
  businessLogo,
  primaryColor = '#4F6BFF',
  cardStatus = 'ACTIVE',
  compact = false,
  showInstructions = true,
  className = '',
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(true);

  // The authoritative identifier counter staff use to look up or credit the customer
  const memberCode = (customerPhone && customerPhone.trim()) || customerId || 'REPLOYTY-MEMBER-PASS';

  // Construct Staff Awarding Terminal URL so scanning directly opens the terminal with this customer pre-selected
  const terminalUrl = (() => {
    const rawTarget = (customerPhone && customerPhone.trim()) || customerId || '';
    if (!rawTarget) return 'REPLOYTY-MEMBER-PASS';
    const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : '';
    if (origin) {
      return `${origin}/#terminal?customer=${encodeURIComponent(rawTarget)}`;
    }
    return `/#terminal?customer=${encodeURIComponent(rawTarget)}`;
  })();

  useEffect(() => {
    let isMounted = true;
    setGenerating(true);

    // Generate real scannable QR code encoding the terminal URL
    QRCode.toDataURL(terminalUrl, {
      width: compact ? 240 : 360,
      margin: 2,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (isMounted) {
          setQrDataUrl(url);
          setGenerating(false);
        }
      })
      .catch((err) => {
        console.error('Failed to generate member QR code:', err);
        if (isMounted) {
          setGenerating(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [terminalUrl, compact]);

  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard && memberCode) {
        await navigator.clipboard.writeText(memberCode);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    } catch {
      // Ignore clipboard write failure
    }
  };

  return (
    <>
      <div
        className={className}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: compact ? '16px' : '20px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        {/* Header Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#64748B',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {businessLogo ? (
              <img
                src={businessLogo}
                alt="Logo"
                style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <QrCode size={15} color={primaryColor} />
            )}
            <span>Member Identification Pass</span>
          </div>

          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: cardStatus === 'ACTIVE' ? '#ECFDF5' : '#F1F5F9',
              color: cardStatus === 'ACTIVE' ? '#059669' : '#64748B',
              letterSpacing: '0.05em',
            }}
          >
            {cardStatus}
          </span>
        </div>

        {/* Real QR Code Display Container */}
        <div
          style={{
            display: 'inline-block',
            padding: '12px',
            backgroundColor: '#F8FAFC',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            margin: '6px 0 12px',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: compact ? 130 : 160,
              height: compact ? 130 : 160,
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
              cursor: qrDataUrl ? 'pointer' : 'default',
            }}
            onClick={() => qrDataUrl && setIsZoomed(true)}
            title="Click to enlarge QR code for scanning"
          >
            {generating ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#94A3B8',
                  fontSize: '11px',
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    border: '2px solid #E2E8F0',
                    borderTopColor: primaryColor,
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span>Generating QR...</span>
              </div>
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Member Pass QR Code for ${customerName}`}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  imageRendering: 'pixelated',
                }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#64748B',
                }}
              >
                <QrCode size={36} />
                <span style={{ fontSize: '10px' }}>QR Unavailable</span>
              </div>
            )}
          </div>

          {/* Quick Enlarge Action */}
          {qrDataUrl && (
            <button
              type="button"
              onClick={() => setIsZoomed(true)}
              style={{
                position: 'absolute',
                bottom: '16px',
                right: '16px',
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Enlarge QR code"
              aria-label="Enlarge QR code"
            >
              <Maximize2 size={13} />
            </button>
          )}
        </div>

        {/* Member Identifier & Copy Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            margin: '4px 0',
          }}
        >
          <span
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#0F172A',
              fontFamily: 'monospace',
              letterSpacing: '0.05em',
            }}
          >
            {formatMemberCode(customerPhone, customerId)}
          </span>

          <button
            type="button"
            onClick={handleCopyCode}
            style={{
              background: isCopied ? '#DCFCE7' : '#F1F5F9',
              border: `1px solid ${isCopied ? '#86EFAC' : '#E2E8F0'}`,
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: 600,
              color: isCopied ? '#15803D' : '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease',
            }}
            title="Copy member code"
          >
            {isCopied ? <Check size={12} /> : <Copy size={12} />}
            <span>{isCopied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Staff Instructions */}
        {showInstructions && (
          <div
            style={{
              fontSize: '12px',
              color: '#64748B',
              marginTop: '6px',
              lineHeight: 1.4,
            }}
          >
            Scan with staff phone to open Staff Awarding Terminal or scan at counter checkout.
          </div>
        )}
      </div>

      {/* Fullscreen High-Contrast QR Modal for Counter Checkout */}
      {isZoomed && qrDataUrl && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setIsZoomed(false)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '24px',
              padding: '24px',
              maxWidth: '320px',
              width: '100%',
              textAlign: 'center',
              position: 'relative',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
              }}
              title="Close"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                color: '#0F172A',
                fontSize: '14px',
                fontWeight: 700,
                marginBottom: '4px',
              }}
            >
              <Sparkles size={16} color={primaryColor} />
              <span>{businessName || 'Member Pass'}</span>
            </div>

            <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px' }}>
              Scan with staff phone camera to open terminal, or hold up to counter scanner
            </div>

            <div
              style={{
                padding: '16px',
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '2px solid #0F172A',
                display: 'inline-block',
                margin: '0 auto 16px',
              }}
            >
              <img
                src={qrDataUrl}
                alt="Enlarged Member QR Code"
                style={{
                  width: '220px',
                  height: '220px',
                  display: 'block',
                  imageRendering: 'pixelated',
                }}
              />
            </div>

            <div
              style={{
                fontSize: '16px',
                fontWeight: 800,
                color: '#0F172A',
                fontFamily: 'monospace',
                letterSpacing: '0.06em',
              }}
            >
              {formatMemberCode(customerPhone, customerId)}
            </div>

            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>
              Passholder: {customerName}
            </div>

            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              style={{
                marginTop: '18px',
                width: '100%',
                padding: '10px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Done Scanning
            </button>
          </div>
        </div>
      )}
    </>
  );
};
