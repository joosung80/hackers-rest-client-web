import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'REST Client Web',
  description: 'VS Code REST Client(.http) 문법을 브라우저에서 바로 — 서버 경유로 CORS 걱정 없이',
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1e1e1e' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
