import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { getCurrentAppUser, listAppUsers } from '@/lib/users/data'
import { hasRank } from '@/lib/users/roles'
import { ClearAppData } from './clear-app-data'
import { TeamAdmin } from './team-admin'

export const metadata = { title: 'Settings' }

export default async function Page() {
  const me = await getCurrentAppUser()
  const isAdmin = hasRank(me.role, 'supervisor')
  const users = isAdmin ? await listAppUsers().catch(() => []) : []

  return (
    <>
      <Heading>Settings</Heading>
      <Text className="mt-2">Configure lines, stations, rates, roster, and pesticide types.</Text>

      {isAdmin && (
        <>
          <Divider className="my-10" />
          <Subheading>Team</Subheading>
          <Text className="mt-2">
            Manage who can do what. Directors and supervisors edit the floor layout and roster; floor leads and up
            assign people to stations; executives have read-only access.
          </Text>
          <div className="mt-4">
            <TeamAdmin users={users} currentUserId={me.clerkUserId} />
          </div>
        </>
      )}

      <Divider className="my-10" />

      <Subheading>App data</Subheading>
      <Text className="mt-2">
        Reset this device&apos;s installed copy of the app. This clears the cached app files (and, when signed in, signs
        you out); your studies and data live in the cloud and are untouched.
      </Text>
      <div className="mt-4">
        <ClearAppData />
      </div>
    </>
  )
}
