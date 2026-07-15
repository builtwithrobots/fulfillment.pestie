import { Heading } from '@/components/heading'
import { Text } from '@/components/text'

export const metadata = { title: 'Settings' }

export default function Page() {
  return (
    <>
      <Heading>Settings</Heading>
      <Text className="mt-2">Configure lines, stations, rates, roster, and pesticide types.</Text>
    </>
  )
}
