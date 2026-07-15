import { Heading } from '@/components/heading'
import { Text } from '@/components/text'

export const metadata = { title: 'Labor allocation' }

export default function Page() {
  return (
    <>
      <Heading>Labor allocation</Heading>
      <Text className="mt-2">Assign employees to lines and stations, track callouts, manage the float pool.</Text>
    </>
  )
}
