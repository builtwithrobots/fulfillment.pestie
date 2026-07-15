import { Heading } from '@/components/heading'
import { Text } from '@/components/text'

export const metadata = { title: 'Shift planning' }

export default function Page() {
  return (
    <>
      <Heading>Shift planning</Heading>
      <Text className="mt-2">Input FAK/RAK volume targets and let the sequencer recommend headcount per line.</Text>
    </>
  )
}
