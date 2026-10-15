import { ImageResponse } from 'next/og';

// iPhone home-screen icon (iOS needs a PNG): the OTG-OS core on deep space.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const ring = (inset, color, width, opacity = 1) => ({
    position: 'absolute', top: inset, left: inset, right: inset, bottom: inset,
    borderRadius: 9999, border: `${width}px solid ${color}`, opacity,
  });
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: 'radial-gradient(circle at 50% 40%, #16123a, #03040c 75%)' }}>
        <div style={ring(22, '#22d3ee', 3, 0.45)} />
        <div style={ring(42, '#a78bfa', 5)} />
        <div style={ring(56, '#22d3ee', 3, 0.8)} />
        <div style={{ position: 'absolute', top: 64, left: 64, width: 52, height: 52, borderRadius: 9999, background: 'radial-gradient(circle at 42% 38%, #ffffff, #22d3ee 50%, rgba(34,211,238,0) 72%)' }} />
      </div>
    ),
    size,
  );
}
