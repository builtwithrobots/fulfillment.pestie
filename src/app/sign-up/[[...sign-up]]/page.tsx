import { SignUp } from '@clerk/nextjs'

export const metadata = { title: 'Sign up' }

export default function SignUpPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <SignUp />
    </main>
  )
}
