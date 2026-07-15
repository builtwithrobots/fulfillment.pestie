'use client'

import { UserButton } from '@clerk/nextjs'
import {
  ChartBarIcon,
  ClipboardDocumentListIcon,
  QueueListIcon,
  TvIcon,
  UsersIcon,
} from '@heroicons/react/20/solid'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { usePathname } from 'next/navigation'

import { Navbar, NavbarSection, NavbarSpacer } from '@/components/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar'
import { SidebarLayout } from '@/components/sidebar-layout'

const nav = [
  { href: '/', label: 'Overview', icon: ChartBarIcon },
  { href: '/shifts', label: 'Shift planning', icon: ClipboardDocumentListIcon },
  { href: '/labor', label: 'Labor allocation', icon: UsersIcon },
  { href: '/lines', label: 'Lines & stations', icon: QueueListIcon },
  { href: '/displays', label: 'Station displays', icon: TvIcon },
]

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    // reducedMotion="user" makes every Motion animation below (including
    // Catalyst's own sidebar transitions) honor the OS prefers-reduced-motion.
    <MotionConfig reducedMotion="user">
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <UserButton />
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <SidebarHeading>Pestie Fulfillment</SidebarHeading>
          </SidebarHeader>
          <SidebarBody>
            <SidebarSection>
              {nav.map(({ href, label, icon: Icon }) => (
                <SidebarItem key={href} href={href} current={pathname === href}>
                  <Icon />
                  <SidebarLabel>{label}</SidebarLabel>
                </SidebarItem>
              ))}
            </SidebarSection>
            <SidebarSpacer />
            <SidebarSection>
              <SidebarItem href="/settings">
                <SidebarLabel>Settings</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>
        </Sidebar>
      }
    >
      {/* Fade content between routes; keyed by pathname. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </SidebarLayout>
    </MotionConfig>
  )
}
