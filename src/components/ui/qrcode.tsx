import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';

interface QRCodeCanvasProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  /** Module colour; must stay dark enough for phone cameras. */
  dark?: string;
  className?: string;
}

export function QRCodeCanvas({ value, size = 256, level = 'M', dark = '#000000', className }: QRCodeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 1,
        errorCorrectionLevel: level,
        color: { dark, light: '#ffffff' },
      },
      (error) => {
        if (error) console.error('QR Code generation error:', error);
      }
    );
  }, [value, size, level, dark]);

  return <canvas ref={canvasRef} className={className} />;
}
