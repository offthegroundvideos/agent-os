// Lets OTG-OS install to a phone home screen and open full screen on the dashboard.
export default function manifest() {
  return {
    name: 'OTG-OS',
    short_name: 'OTG-OS',
    description: 'OFF THE GROUND operating system',
    start_url: '/os',
    scope: '/',
    display: 'standalone',
    background_color: '#03040c',
    theme_color: '#03040c',
    icons: [
      { src: '/otg-os-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
