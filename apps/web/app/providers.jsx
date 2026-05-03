'use client'

import { useEffect } from 'react'

export function Providers({ children }) {
  useEffect(() => {
    // Dynamically load Reown Kit on client side only
    const initReown = async () => {
      try {
        const { createAppKit } = await import('@reown/appkit')
        const { SolanaAdapter } = await import('@reown/appkit-adapter-solana')
        const { solana } = await import('@reown/appkit/networks')

        const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID

        if (!projectId) {
          console.warn('NEXT_PUBLIC_REOWN_PROJECT_ID not set, wallet connection may not work')
          return
        }

        try {
          const solanaAdapter = new SolanaAdapter({
            chains: [solana],
          })

          createAppKit({
            adapters: [solanaAdapter],
            networks: [solana],
            projectId,
            metadata: {
              name: 'Alpha Watch Trading',
              description: 'Real-time Arbitrage Trading Bot with Jupiter & 0x',
              url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
              icons: ['https://assets.coingecko.com/coins/images/4128/large/SNS_logo.png']
            },
            allWallets: 'SHOW',
            featuredWalletIds: [],
          })
        } catch (err) {
          console.warn('Reown Kit initialization failed:', err.message)
        }
      } catch (err) {
        console.warn('Failed to load Reown Kit:', err.message)
      }
    }

    initReown()
  }, [])

  return <>{children}</>
}
