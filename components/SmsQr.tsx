"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function SmsQr({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSrc("");
      return;
    }
    QRCode.toDataURL(value, { margin: 1, width: 240, errorCorrectionLevel: "M" })
      .then((next: string) => {
        if (!cancelled) setSrc(next);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) {
    return <div className="qr-fallback">QR unavailable. {label}</div>;
  }

  return <img className="qr-code" src={src} alt={label} />;
}
