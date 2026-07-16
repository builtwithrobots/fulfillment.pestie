'use client'

import { Check, Clipboard } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/button'

export function CopyResultsButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Button color="blue" onClick={copy}>
      {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
      {copied ? 'Copied!' : 'Copy results'}
    </Button>
  )
}
