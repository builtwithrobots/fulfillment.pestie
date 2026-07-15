import { Heading, Subheading } from '@/components/heading'
import { Stat } from './stat'

export default function OverviewPage() {
  return (
    <>
      <Heading>Executive overview</Heading>
      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Headcount deployed" value="0 / 0" change="+0%" />
        <Stat title="Overall efficiency" value="0%" change="+0%" />
        <Stat title="Kits completed" value="0" change="+0%" />
        <Stat title="EOD projection" value="0" change="+0%" />
      </div>
      <Subheading className="mt-14">7-day output trend</Subheading>
      <p className="mt-2 text-sm text-zinc-500">
        Wire this to Supabase once the schema is applied. See <code>supabase/migrations</code>.
      </p>
    </>
  )
}
