import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import './globals.css'
import './folio.css'
import './operating.css'
import './planning.css'
import './workflow-usability.css'
import './workspace.css'
import './crm-reports.css'
import './documents-workspace.css'
import './projects-workspace.css'
import { AuthProvider } from '@/components/AuthProvider'

export const metadata: Metadata = {
  title: 'Compass',
  description: 'Operator management console for switchflow.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg'
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
