import React from 'react';
import { QrCode, Download, Printer, Share2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useToast } from '../../context/ToastContext';

export interface QRCardProps {
  businessName: string;
  slug: string;
  tagline?: string;
  className?: string;
}

export const QRCard: React.FC<QRCardProps> = ({
  businessName,
  slug,
  tagline = 'Scan at checkout to collect stamps & unlock rewards',
  className = '',
}) => {
  const { addToast } = useToast();

  const handleDownload = () => {
    addToast({
      type: 'success',
      title: 'QR Code Downloaded',
      message: `${businessName} high-resolution QR saved to your downloads.`,
    });
  };

  const handlePrint = () => {
    addToast({
      type: 'info',
      title: 'Counter Standee Ready',
      message: 'Opening printable PDF standee format...',
    });
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`https://reployty.com/join/${slug}`);
      addToast({
        type: 'success',
        title: 'Link Copied',
        message: 'Customer loyalty signup link copied to clipboard.',
      });
    }
  };

  return (
    <Card
      title="Store QR Standee"
      subtitle="Place at your billing counter or tables"
      className={className}
      action={
        <Button variant="ghost" size="sm" iconOnly onClick={handleShare} aria-label="Share loyalty link">
          <Share2 size={16} />
        </Button>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 'var(--space-4)',
          padding: 'var(--space-2) 0',
        }}
      >
        {/* Styled QR Frame */}
        <div
          style={{
            padding: 'var(--space-5)',
            borderRadius: 'var(--radius-card)',
            border: '2px dashed var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-3)',
            maxWidth: 240,
            width: '100%',
          }}
        >
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-subtle)',
              position: 'relative',
            }}
          >
            <QrCode size={108} color="var(--color-text-primary)" strokeWidth={1.5} />
            <div
              style={{
                position: 'absolute',
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFF',
                fontWeight: 700,
                fontSize: 12,
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              R
            </div>
          </div>
          <div>
            <span
              style={{
                display: 'block',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              {businessName}
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
              }}
            >
              reployty.com/join/{slug}
            </span>
          </div>
        </div>

        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            maxWidth: 280,
          }}
        >
          {tagline}
        </p>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={handleDownload}
          >
            Download PNG
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Printer size={14} />}
            onClick={handlePrint}
          >
            Print Standee
          </Button>
        </div>
      </div>
    </Card>
  );
};
