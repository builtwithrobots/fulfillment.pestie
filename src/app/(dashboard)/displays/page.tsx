import { Heading } from '@/components/heading'
import { Text } from '@/components/text'

export const metadata = { title: 'Station displays' }

export default function Page() {
  return (
    <>
      <Heading>Station displays</Heading>
      <Text className="mt-2">Generate pairing codes, assign display templates, and push view changes to screens.</Text>
    </>
  )
}
