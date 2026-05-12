'use client'

import { useEffect, useState } from 'react'
import { VersionedTransaction } from '@solana/web3.js'

export function TradesTab({ data, role, getRiskLevel, onExecuteTrade, initialCandidateId, onInitialCandidateHandled }) {
  const [executing, setExecuting] = useState(null)
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [walletConnected, setWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState(null)
  const [tradeNotice, setTradeNotice] = useState(null)

  useEffect(() => {
    const checkWallet = async () => {
      if (typeof window === 'undefined' || !window.solana) return

      try {
        let publicKey = null

        if (window.solana.publicKey) {
          publicKey = window.solana.publicKey
        } else if (window.solana.request) {
          try {
            publicKey = await window.solana.request({ method: 'getPublicKey' })
          } catch {
            publicKey = null
          }
        }

        if (publicKey) {
          const address = typeof publicKey === 'string' ? publicKey : publicKey.toString()
          setWalletAddress(address)
          window.localStorage.setItem('alphaWallet', address)
          setWalletConnected(true)
        }
      } catch {
        setWalletConnected(false)
      }
    }

    checkWallet()

    if (typeof window !== 'undefined' && window.solana?.on) {
      window.solana.on('connect', publicKey => {
        const address = publicKey.toString()
        setWalletAddress(address)
        window.localStorage.setItem('alphaWallet', address)
        setWalletConnected(true)
      })
      window.solana.on('disconnect', () => {
        setWalletConnected(false)
        setWalletAddress(null)
        window.localStorage.removeItem('alphaWallet')
        window.localStorage.removeItem('alphaSessionToken')
      })
    }
  }, [])

  useEffect(() => {
    if (!initialCandidateId) return

    const candidate = data?.candidates?.find(item => item.id === initialCandidateId)
    if (!candidate) return

    if (!walletConnected) {
      setTradeNotice({
        type: 'info',
        title: 'Connect Wallet',
        message: 'Connect Phantom Wallet to continue the manual swap from your watchlist.'
      })
      onInitialCandidateHandled?.()
      return
    }

    setSelectedCandidate(candidate)
    setTradeNotice({
      type: 'info',
      title: 'Manual Swap Ready',
      message: `${candidate.pair} is selected. Review and confirm the supervised order.`
    })
    onInitialCandidateHandled?.()
  }, [initialCandidateId, data?.candidates, walletConnected, onInitialCandidateHandled])

  const connectWallet = async () => {
    setTradeNotice(null)

    if (!window.solana) {
      setTradeNotice({
        type: 'error',
        title: 'Wallet Not Found',
        message: 'Install Phantom Wallet, then reconnect.'
      })
      return
    }

    try {
      if (window.solana.isConnected && window.solana.publicKey) {
        const address = window.solana.publicKey.toString()
        setWalletAddress(address)
        window.localStorage.setItem('alphaWallet', address)
        setWalletConnected(true)
        return
      }

      const result = await window.solana.connect()
      const publicKey = result?.publicKey || window.solana.publicKey
      if (!publicKey) throw new Error('Failed to get public key from wallet')

      const address = publicKey.toString ? publicKey.toString() : publicKey
      setWalletAddress(address)
      window.localStorage.setItem('alphaWallet', address)
      setWalletConnected(true)
      setTradeNotice({
        type: 'success',
        title: 'Wallet Connected',
        message: 'You can now create a trade order.'
      })
    } catch (error) {
      setTradeNotice({
        type: 'error',
        title: 'Wallet Connection Failed',
        message: error?.message?.includes('User') ? 'Connection rejected by user.' : (error?.message || 'Unable to connect wallet.')
      })
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
    } finally {
      setWalletConnected(false)
      setWalletAddress(null)
      window.localStorage.removeItem('alphaWallet')
      window.localStorage.removeItem('alphaSessionToken')
      setSelectedCandidate(null)
    }
  }

  const handleExecuteClick = candidate => {
    setTradeNotice(null)
    if (!walletConnected) {
      connectWallet()
      return
    }
    setSelectedCandidate(candidate)
  }

  const confirmExecute = async () => {
    if (!selectedCandidate || !walletAddress) return

    const authHeaders = {
      'x-alpha-role': role || 'operator',
      'x-alpha-actor': walletAddress,
      'x-alpha-wallet': walletAddress
    }

    setExecuting(selectedCandidate.id)
    setTradeNotice(null)

    try {
      const orderRes = await fetch('/api/trades/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
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

        if (errorData?.approvalRequired) {
          setTradeNotice({
            type: 'info',
            title: 'Approval Required',
            message: `Approval request created: ${errorData.approval?.id || 'pending'}. Approve it from the Approvals tab, then run this trade again.`
          })
          if (onExecuteTrade) onExecuteTrade()
          return
        }

        const errorMessage = errorData?.error || errorData?.message || orderRes.statusText || String(orderRes.status)
        throw new Error(`Failed to create order: ${orderRes.status} ${errorMessage}`)
      }

      const orderData = await orderRes.json()

      if (!window.solana) throw new Error('Solana wallet not found')
      if (!orderData.transaction) throw new Error('No transaction received from server')

      const txBytes = Uint8Array.from(atob(orderData.transaction), char => char.charCodeAt(0))
      const transaction = VersionedTransaction.deserialize(txBytes)
      const signedTransaction = await window.solana.signTransaction(transaction)
      const signedTxBase64 = btoa(String.fromCharCode(...signedTransaction.serialize()))

      const execRes = await fetch('/api/trades/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
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
      setTxHash(result.txHash || result.simulatedTxHash)
      setTradeNotice({
        type: 'success',
        title: 'Trade Executed',
        message: `Mode: ${result.mode}. Tx: ${result.txHash || result.simulatedTxHash || 'simulated'}`
      })

      if (onExecuteTrade) onExecuteTrade()
    } catch (error) {
      setTradeNotice({
        type: 'error',
        title: 'Trade Failed',
        message: error.message || 'Unable to complete trade execution.'
      })
    } finally {
      setExecuting(null)
      setSelectedCandidate(null)
    }
  }

  const noticeColor = tradeNotice?.type === 'error'
    ? '#ef4444'
    : tradeNotice?.type === 'success'
      ? '#22c55e'
      : '#3b82f6'

  return (
    <section style={{ background: '#0f172a', padding: 20, borderRadius: 20, border: '1px solid #1e293b', overflowX: 'auto' }}>
      <h2 style={{ marginTop: 0 }}>Trades</h2>

      {tradeNotice && (
        <div style={{ background: '#111827', border: `1px solid ${noticeColor}`, color: '#e2e8f0', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <div style={{ color: noticeColor, fontWeight: 'bold', marginBottom: 4 }}>{tradeNotice.title}</div>
          <div style={{ color: '#cbd5e1', fontSize: 13 }}>{tradeNotice.message}</div>
        </div>
      )}

      <div style={{ background: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 16 }}>
        {walletConnected ? (
          <div>
            <span style={{ color: '#22c55e', fontWeight: 'bold' }}>Connected</span>
            <span style={{ color: '#94a3b8', marginLeft: 12 }}>
              {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-8)}
            </span>
            <button
              onClick={disconnectWallet}
              style={{ marginLeft: 16, padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Not Connected</span>
            <button
              onClick={connectWallet}
              style={{ marginLeft: 16, padding: '6px 12px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
            >
              Connect Phantom Wallet
            </button>
          </div>
        )}
      </div>

      {walletConnected && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, color: '#e2e8f0' }}>Execute Trade</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {data?.candidates && data.candidates.length > 0 ? (
              data.candidates.map(candidate => (
                <div
                  key={candidate.id}
                  style={{
                    background: selectedCandidate?.id === candidate.id ? '#1e3a3a' : '#0f172a',
                    border: selectedCandidate?.id === candidate.id ? '2px solid #22c55e' : '1px solid #1e293b',
                    padding: 12,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => setSelectedCandidate(candidate)}
                >
                  <div style={{ fontWeight: 'bold', color: '#e2e8f0' }}>{candidate.token}</div>
                  <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                    {candidate.pair} - {candidate.chain}
                  </div>
                  <div style={{ color: '#22c55e', fontSize: 12, marginTop: 4 }}>
                    Score: {candidate.score}/100
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      onClick={event => {
                        event.stopPropagation()
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

      {selectedCandidate && walletConnected && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f172a', padding: 24, borderRadius: 16, border: '1px solid #1e293b', maxWidth: 400, width: '90%' }}>
            <h3 style={{ marginTop: 0, color: '#22c55e' }}>Confirm Trade Execution</h3>
            <p style={{ color: '#94a3b8', marginBottom: 12 }}>
              This trade will follow the current server execution mode and approval policy.
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
                style={{ flex: 1, padding: '10px 16px', background: executing !== null ? '#64748b' : '#22c55e', color: 'white', border: 'none', borderRadius: 8, cursor: executing !== null ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >
                {executing !== null ? 'Executing...' : 'Execute Trade'}
              </button>
              <button
                onClick={() => setSelectedCandidate(null)}
                disabled={executing !== null}
                style={{ flex: 1, padding: '10px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Trade History</h3>
        {data?.trades && data.trades.filter(t => t.type?.includes('TRADE')).length > 0 ? (
          <div style={{ maxHeight: 400, overflowY: 'auto', background: '#1e293b', borderRadius: 8, padding: 12 }}>
            {data.trades
              .filter(t => t.type?.includes('TRADE'))
              .map((trade, index) => (
                <div key={index} style={{ padding: 8, borderBottom: index < data.trades.length - 1 ? '1px solid #0f172a' : 'none', fontSize: 12 }}>
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
