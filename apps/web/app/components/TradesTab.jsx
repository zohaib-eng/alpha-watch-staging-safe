'use client'

import { useEffect, useState } from 'react'

export function TradesTab({ data, role, getRiskLevel, onExecuteTrade }) {
  const [executing, setExecuting] = useState(null)
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [walletConnected, setWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState(null)

  // Check for Phantom wallet
  useEffect(() => {
    const checkWallet = async () => {
      if (typeof window !== 'undefined' && window.solana) {
        try {
          // Try to get connected wallet without forcing user interaction
          let publicKey = null

          if (window.solana.publicKey) {
            publicKey = window.solana.publicKey
          } else if (window.solana.request) {
            try {
              const response = await window.solana.request({
                method: 'getPublicKey'
              })
              publicKey = response
            } catch (err) {
              console.log('Wallet not connected yet (getPublicKey failed)')
            }
          }

          if (publicKey) {
            const address = typeof publicKey === 'string' ? publicKey : publicKey.toString()
            setWalletAddress(address)
            setWalletConnected(true)
          }
        } catch (err) {
          console.log('Wallet check failed:', err.message)
        }
      }
    }

    checkWallet()

    // Also listen for wallet changes
    if (window.solana && window.solana.on) {
      window.solana.on('connect', (publicKey) => {
        setWalletAddress(publicKey.toString())
        setWalletConnected(true)
      })
      window.solana.on('disconnect', () => {
        setWalletConnected(false)
        setWalletAddress(null)
      })
    }
  }, [])

  const connectWallet = async () => {
    if (!window.solana) {
      alert('❌ Phantom Wallet not installed. Please install it from https://phantom.app')
      return
    }

    try {
      console.log('Attempting to connect Phantom wallet...')
      console.log('window.solana available:', !!window.solana)
      console.log('window.solana methods:', {
        connect: typeof window.solana.connect,
        publicKey: window.solana.publicKey,
        isConnected: window.solana.isConnected
      })

      // Check if already connected
      if (window.solana.isConnected && window.solana.publicKey) {
        const address = window.solana.publicKey.toString()
        console.log('✅ Already connected:', address)
        setWalletAddress(address)
        setWalletConnected(true)
        return
      }

      // Request connection with options
      console.log('Calling window.solana.connect()...')
      const result = await window.solana.connect()

      // Handle different response formats
      let publicKey = null
      if (result?.publicKey) {
        publicKey = result.publicKey
      } else if (window.solana.publicKey) {
        publicKey = window.solana.publicKey
      }

      if (!publicKey) {
        throw new Error('Failed to get public key from wallet')
      }

      const address = publicKey.toString ? publicKey.toString() : publicKey
      console.log('✅ Connected:', address)
      setWalletAddress(address)
      setWalletConnected(true)
      alert('✅ Wallet connected!')
    } catch (err) {
      console.error('Connection error:', err)
      console.error('Error details:', {
        message: err?.message,
        code: err?.code,
        type: err?.constructor?.name
      })

      // User rejection is common and expected
      if (err?.message?.includes('User')) {
        alert('❌ Connection rejected by user')
      } else {
        alert(`❌ Connection failed: ${err?.message || 'Unknown error. Check console.'}`)
      }
    }
  }

  const disconnectWallet = async () => {
    try {
      if (window.solana) {
        if (typeof window.solana.disconnect === 'function') {
          await window.solana.disconnect()
        } else if (window.solana.request) {
          await window.solana.request({ method: 'disconnect' })
        }
      }
      setWalletConnected(false)
      setWalletAddress(null)
    } catch (err) {
      console.error('Disconnect failed:', err)
      setWalletConnected(false)
      setWalletAddress(null)
    }
  }

  const handleExecuteClick = (candidate) => {
    if (!walletConnected) {
      connectWallet()
      return
    }
    setSelectedCandidate(candidate)
  }

  const confirmExecute = async () => {
    if (!selectedCandidate || !walletAddress) return

    setExecuting(selectedCandidate.id)
    try {
      // Step 1: Get unsigned transaction from API
      const orderRes = await fetch('/api/trades/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: selectedCandidate.id,
          inputMint: selectedCandidate.inputMint,
          outputMint: selectedCandidate.outputMint,
          amount: selectedCandidate.amount,
          wallet: walletAddress
        })
      })

      if (!orderRes.ok) {
        const errorData = await orderRes.json().catch(() => null)
        const errorMessage = errorData?.error || errorData?.message || orderRes.statusText || String(orderRes.status)
        throw new Error(`Failed to create order: ${orderRes.status} ${errorMessage}`)
      }

      const orderData = await orderRes.json()
      console.log('Order created:', orderData)

      // Step 2: Sign transaction with wallet
      if (!window.solana) {
        throw new Error('Solana wallet not found')
      }

      if (!orderData.transaction) {
        throw new Error('No transaction received from server')
      }

      console.log('Transaction received, requesting Phantom to sign...')

      // Phantom's signTransaction method
      // It shows a popup and returns signed tx
      const signResult = await window.solana.signTransaction(
        Buffer.from(orderData.transaction, 'base64')
      )

      // signResult should have the signed transaction
      const signedTxBase64 = typeof signResult === 'string'
        ? signResult
        : Buffer.from(signResult).toString('base64')

      console.log('✅ Transaction signed by Phantom')

      // Step 3: Execute trade
      const execRes = await fetch('/api/trades/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: selectedCandidate.id,
          signedTransaction: signedTxBase64,
          wallet: walletAddress
        })
      })

      if (!execRes.ok) {
        const errorData = await execRes.json().catch(() => ({}))
        throw new Error(`Execution failed: ${errorData.error || execRes.status}`)
      }

      const result = await execRes.json()
      console.log('Trade result:', result)
      setTxHash(result.txHash || result.simulatedTxHash)
      alert(`✅ Trade executed!\nMode: ${result.mode}\nTx: ${result.txHash || 'simulated'}`)

      // Refresh parent data
      if (onExecuteTrade) {
        onExecuteTrade()
      }
    } catch (error) {
      console.error('Trade execution failed:', error)
      alert(`❌ Trade failed: ${error.message}`)
    } finally {
      setExecuting(null)
      setSelectedCandidate(null)
    }
  }

  return (
    <section style={{ background: '#0f172a', padding: 20, borderRadius: 20, border: '1px solid #1e293b', overflowX: 'auto' }}>
      <h2 style={{ marginTop: 0 }}>Trades</h2>

      {/* Wallet Connection Status */}
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        {walletConnected ? (
          <div>
            <span style={{ color: '#22c55e', fontWeight: 'bold' }}>✅ Connected</span>
            <span style={{ color: '#94a3b8', marginLeft: 12 }}>
              {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-8)}
            </span>
            <button
              onClick={disconnectWallet}
              style={{
                marginLeft: 16,
                padding: '6px 12px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>❌ Not Connected</span>
            <button
              onClick={connectWallet}
              style={{
                marginLeft: 16,
                padding: '6px 12px',
                background: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              Connect Phantom Wallet
            </button>
          </div>
        )}
      </div>

      {/* Available Candidates */}
      {walletConnected && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, color: '#e2e8f0' }}>Execute Trade</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {data?.candidates && data.candidates.length > 0 ? (
              data.candidates.map(candidate => (
                <div
                  key={candidate.id}
                  style={{
                    background: selectedCandidate === candidate.id ? '#1e3a3a' : '#0f172a',
                    border: selectedCandidate === candidate.id ? '2px solid #22c55e' : '1px solid #1e293b',
                    padding: 12,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => setSelectedCandidate(candidate)}
                >
                  <div style={{ fontWeight: 'bold', color: '#e2e8f0' }}>{candidate.token}</div>
                  <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                    {candidate.pair} • {candidate.chain}
                  </div>
                  <div style={{ color: '#22c55e', fontSize: 12, marginTop: 4 }}>
                    Score: {candidate.score}/100
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleExecuteClick(candidate)
                      }}
                      disabled={executing === candidate.id}
                      style={{
                        padding: '6px 10px',
                        background: executing === candidate.id ? '#64748b' : '#1d4ed8',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: executing === candidate.id ? 'not-allowed' : 'pointer',
                        fontSize: 11,
                        flex: 1
                      }}
                    >
                      {executing === candidate.id ? 'Executing...' : 'Execute'}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ color: '#94a3b8' }}>No candidates available</p>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {selectedCandidate && walletConnected && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              background: '#0f172a',
              padding: 24,
              borderRadius: 16,
              border: '1px solid #1e293b',
              maxWidth: 400,
              width: '90%'
            }}
          >
            <h3 style={{ marginTop: 0, color: '#22c55e' }}>⚠️ Confirm Trade Execution</h3>
            <p style={{ color: '#94a3b8', marginBottom: 12 }}>
              You're about to execute a trade on the Solana blockchain. This action depends on your EXECUTION_MODE setting.
            </p>
            <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>Candidate ID</div>
                  <div style={{ fontWeight: 'bold', color: '#e2e8f0' }}>{selectedCandidate?.id}</div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>Wallet</div>
                  <div style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: 11 }}>
                    {walletAddress?.slice(0, 8)}...
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={confirmExecute}
                disabled={executing !== null}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: executing !== null ? '#64748b' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: executing !== null ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {executing !== null ? 'Executing...' : 'Execute Trade'}
              </button>
              <button
                onClick={() => setSelectedCandidate(null)}
                disabled={executing !== null}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trade History */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Trade History</h3>
        {data?.trades && data.trades.length > 0 ? (
          <div
            style={{
              maxHeight: 400,
              overflowY: 'auto',
              background: '#1e293b',
              borderRadius: 8,
              padding: 12
            }}
          >
            {data.trades
              .filter(t => t.type?.includes('TRADE'))
              .map((trade, i) => (
                <div
                  key={i}
                  style={{
                    padding: 8,
                    borderBottom: i < data.trades.length - 1 ? '1px solid #0f172a' : 'none',
                    fontSize: 12
                  }}
                >
                  <div style={{ color: '#22c55e', fontWeight: 'bold' }}>{trade.type}</div>
                  <div style={{ color: '#94a3b8', marginTop: 2 }}>{trade.message}</div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                    {new Date(trade.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>No trades executed yet</p>
        )}
      </div>
    </section>
  )
}
