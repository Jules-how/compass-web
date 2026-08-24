import Link from 'next/link'
import { OperatorShell } from '@/components/OperatorShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const SHAPES = [
  {
    href: '/sales/outbound/mock/cassette',
    title: 'Cassette',
    blurb: 'The week is a row of launch bays. No hour grid. Inventory drops onto an empty bay.'
  },
  {
    href: '/sales/outbound/mock/runway',
    title: 'Runway',
    blurb: 'Rows are trades. Stamp a wave from sendable or 90-day inventory. Date is a consequence.'
  },
  {
    href: '/sales/outbound/mock/factory',
    title: 'Factory',
    blurb: 'Columns are readiness blockers. Each card is a wave. Date is a field, not the desk.'
  },
  {
    href: '/sales/outbound/mock/clocks',
    title: 'Two clocks',
    blurb: 'Top: this week’s launches as bays. Bottom: work still owed on those launches.'
  }
] as const

export default function OutboundShapesIndexPage() {
  return (
    <OperatorShell
      title="Outbound shapes"
      subtitle="Switch Cassette, Runway, or Factory on live Outbound. Calendar is still there."
      width="full"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {SHAPES.map((shape) => (
          <Link key={shape.href} href={shape.href} className="block">
            <Card className="h-full transition hover:border-stone-300">
              <CardHeader>
                <CardTitle>{shape.title}</CardTitle>
                <CardDescription>{shape.blurb}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-[12px] font-medium text-[#c2410c]">Open preview</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm text-neutral-500">
        <Link href="/sales/outbound" className="font-medium text-[#c2410c] hover:underline">
          ← Live Outbound
        </Link>
      </p>
    </OperatorShell>
  )
}
