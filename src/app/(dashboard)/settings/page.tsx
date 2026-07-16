import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { ClearAppData } from './clear-app-data'

export const metadata = { title: 'Settings' }

export default function Page() {
  return (
    <>
      <Heading>Settings</Heading>
      <Text className="mt-2">Configure lines, stations, rates, roster, and pesticide types.</Text>

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
