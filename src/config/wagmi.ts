'use client'

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { cookieStorage, createStorage, createConfig, http } from 'wagmi'
import { intuitionTestnet } from '@0xintuition/protocol'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

/**
 * Whether wallet features are enabled.
 * Requires NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to be set.
 */
export const walletEnabled = Boolean(projectId)

export const wagmiConfig = walletEnabled
  ? getDefaultConfig({
      appName: 'TrustNomiks',
      projectId: projectId!,
      chains: [intuitionTestnet],
      ssr: true,
      storage: createStorage({ storage: cookieStorage }),
    })
  : createConfig({
      chains: [intuitionTestnet],
      transports: { [intuitionTestnet.id]: http() },
      ssr: true,
    })
