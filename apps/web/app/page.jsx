'use client';

import { useState, useEffect, useRef } from 'react';
import { TradesTab } from './components/TradesTab';

const tabs = [
  { key: "dashboard", label: "Dashboard" },
  { key: "watchlist", label: "Watchlist" },
  { key: "approvals", label: "Approvals" },
  { key: "trades", label: "Trades" },
  { key: "logs", label: "Logs & Monitoring" }
];

function apiHeaders(role, extra = {}) {
  const storedWallet = typeof window !== 'undefined' ? window.localStorage.getItem('alphaWallet') : null;
  const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem('alphaSessionToken') : null;

  return {
    'Cache-Control': 'no-cache',
    'x-alpha-role': role,
    'x-alpha-actor': storedWallet || role,
    ...(storedWallet ? { 'x-alpha-wallet': storedWallet } : {}),
    ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
    ...extra
  };
}

async function fetchData(endpoint, role = 'operator', retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`/api/${endpoint}`, { 
        method: 'GET',
        headers: apiHeaders(role)
      });
      
      if (!res.ok) {
        console.error(`API Error for ${endpoint} (attempt ${attempt}/${retries}):`, res.status, res.statusText);
        if (attempt < retries) {
          // Wait before retrying (exponential backoff: 100ms, 200ms, 400ms, etc.)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 100));
          continue;
        }
        throw new Error(`API Error: ${res.status}`);
      }
      
      const data = await res.json();
      console.log(`Loaded ${endpoint}:`, Array.isArray(data) ? data.length : Object.keys(data).length, 'items');
      return data;
    } catch (error) {
      if (attempt === retries) {
        console.error(`Final error for ${endpoint}:`, error);
        throw error;
      }
      console.warn(`Retry attempt ${attempt} for ${endpoint}:`, error.message);
    }
  }
}

function card(title, value, sub) {
  return (
    <div style={{background:"#0f172a",padding:20,borderRadius:20,border:"1px solid #1e293b"}}>
      <div style={{color:"#94a3b8",fontSize:14}}>{title}</div>
      <strong style={{display:"block",fontSize:28,marginTop:6}}>{value}</strong>
      <div style={{color:"#64748b",fontSize:13,marginTop:6}}>{sub}</div>
    </div>
  );
}

function Table({ data, columns, emptyMessage, renderRow }) {
  if (!data || data.length === 0) {
    return <p style={{color:"#94a3b8", textAlign:"center", padding:20}}>{emptyMessage}</p>;
  }
  if (renderRow) {
    return (
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:640}}>
        <thead>
          <tr>
            {columns.map(col => <th key={col} align="left">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map(renderRow)}
        </tbody>
      </table>
    );
  }
  return (
    <table style={{width:"100%",borderCollapse:"collapse",minWidth:640}}>
      <thead>
        <tr>
          {columns.map(col => <th key={col} align="left">{col}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i}>
            {columns.map(col => <td key={col} style={{padding:"10px 0"}}>{row[col.toLowerCase()] || row[col] || '-'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RiskWarning({ riskLevel, details }) {
  const colorMap = { high: '#ef4444', medium: '#f97316', low: '#22c55e' };
  const color = colorMap[riskLevel] || colorMap.low;
  return (
    <div style={{background:"#0f172a",padding:10,borderRadius:8,border:'1px solid ' + color, marginTop:10}}>
      <p style={{color, margin:0, fontWeight:'bold'}}>Risk Level: {riskLevel.toUpperCase()}</p>
      <p style={{color:"#94a3b8", margin:0}}>{details}</p>
    </div>
  );
}

function formatDate(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return dateString;
  }
}

function getTypeColor(type) {
  const typeColorMap = {
    'TRADE_EXECUTED': '#22c55e',
    'TRADE_APPROVED': '#3b82f6',
    'TRADE_REJECTED': '#ef4444',
    'CANDIDATE_ADDED': '#f97316',
    'APPROVAL_REQUESTED': '#8b5cf6',
    'ERROR': '#ef4444',
    'WARNING': '#f97316'
  };
  return typeColorMap[type] || '#94a3b8';
}

function LogItem({ log }) {
  const typeColor = getTypeColor(log.type);
  return (
    <div style={{background:"#1e293b", padding:15, borderRadius:8, marginBottom:10, borderLeft:'4px solid ' + typeColor}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"start"}}>
        <div>
          <span style={{color:typeColor, fontWeight:'bold'}}>[{log.type}]</span>
          <span style={{color:"#94a3b8", marginLeft:10}}>by {log.actor || 'system'}</span>
        </div>
        <span style={{color:"#64748b", fontSize:12}}>{formatDate(log.created_at)}</span>
      </div>
      <p style={{color:"#e2e8f0", margin:'10px 0', marginTop:8}}>{log.message}</p>
      {log.metadata && (
        <div style={{background:"#0f172a", padding:8, borderRadius:4, fontSize:12, color:"#cbd5e1"}}>
          {typeof log.metadata === 'object' ? JSON.stringify(log.metadata) : log.metadata}
        </div>
      )}
    </div>
  );
}

function ConfirmationDialog({ isOpen, onClose, onConfirm, title, message, riskDetails }) {
  if (!isOpen) return null;
  return (
    <div style={{
      position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.5)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000
    }}>
      <div style={{background:"#0f172a", padding:20, borderRadius:20, border:"1px solid #1e293b", maxWidth:400, width:"90%"}}>
        <h3 style={{marginTop:0}}>{title}</h3>
        <p style={{color:"#94a3b8"}}>{message}</p>
        {riskDetails && <RiskWarning riskLevel={riskDetails.level} details={riskDetails.details} />}
        <div style={{display:"flex", gap:10, marginTop:20}}>
          <button onClick={onConfirm} style={{padding:"10px 20px", background:"#22c55e", color:"white", border:"none", borderRadius:8, cursor:"pointer"}}>Confirm</button>
          <button onClick={onClose} style={{padding:"10px 20px", background:"#ef4444", color:"white", border:"none", borderRadius:8, cursor:"pointer"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [role, setRole] = useState("operator");
  const [dialog, setDialog] = useState({ isOpen: false, title: '', message: '', riskDetails: null, onConfirm: null });
  const [mounted, setMounted] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const [config, setConfig] = useState({ executionMode: 'dry-run', tradingEnabled: false, mandatoryApprovals: true });
  const [manualCandidateId, setManualCandidateId] = useState(null);
  const [authWallet, setAuthWallet] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const prevDataRef = useRef({});

  const loadData = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      // Fetch server config
      try {
        const configRes = await fetch('/api/config');
        if (configRes.ok) {
          const configData = await configRes.json();
          setConfig(configData);
        }
      } catch (err) {
        console.warn('Failed to fetch config:', err);
      }

      const endpoints = { candidates: 'candidates', watchlist: 'candidates', approvals: 'approvals', trades: 'audit_logs' };
      const results = {};
      
      // Load all endpoints in parallel with better error handling
      const promises = Object.entries(endpoints).map(async ([key, endpoint]) => {
        try {
          const data = await fetchData(endpoint, role);
          results[key] = data || [];
          return { key, success: true };
        } catch (err) {
          if (!silent) console.error(`Error loading ${key}:`, err.message);
          results[key] = []; // Return empty array on error
          return { key, success: false, error: err.message };
        }
      });
      
      const outcomes = await Promise.all(promises);
      const failedEndpoints = outcomes.filter(o => !o.success);
      
      if (failedEndpoints.length > 0) {
        if (!silent) console.warn('Some endpoints failed:', failedEndpoints.map(o => o.key).join(', '));
        // If all endpoints failed, set error
        if (failedEndpoints.length === outcomes.length) {
          setError('Unable to connect to API. Retrying...');
        }
      }
      
      // Detect changes and highlight
      const newHighlighted = new Set();
      ['candidates', 'watchlist', 'trades'].forEach(key => {
        if (results[key] && prevDataRef.current[key]) {
          results[key].forEach((item, idx) => {
            const prevItem = prevDataRef.current[key][idx];
            if (prevItem && (item.score !== prevItem.score || item.price !== prevItem.price)) {
              newHighlighted.add(`${key}-${idx}`);
            }
          });
        }
      });
      setHighlightedIds(newHighlighted);
      setTimeout(() => setHighlightedIds(new Set()), 1500);
      
      prevDataRef.current = results;
      setData(results);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const storedWallet = window.localStorage.getItem('alphaWallet');
    if (storedWallet) {
      setAuthWallet(storedWallet);
      setAuthReady(true);
      return;
    }

    const wallet = window.solana?.publicKey?.toString?.();
    if (wallet) {
      window.localStorage.setItem('alphaWallet', wallet);
      setAuthWallet(wallet);
    }
    setAuthReady(true);
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !authReady) return;

    if (!authWallet) {
      setLoading(false);
      setError(null);
      return;
    }
    
    // Small delay to ensure APIs are ready
    const timer = setTimeout(() => {
      loadData().catch(err => {
        console.error('Initial load error:', err);
        setError('Failed to load data. Retrying...');
      });
    }, 100);
    
    return () => {
      clearTimeout(timer);
    };
  }, [mounted, authReady, authWallet, role]);

  const handleAction = async (action, id, riskLevel = 'low') => {
    if (action === 'Execute Trade') {
      setDialog({
        isOpen: true,
        title: 'Confirm Trade Execution',
        message: `Are you sure you want to execute this trade?`,
        riskDetails: { level: riskLevel, details: `This trade has ${riskLevel} risk. Proceed with caution.` },
        onConfirm: async () => {
          try {
            const res = await fetch('/api/trades/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ candidateId: 1 }) // hardcoded for demo
            });
            const result = await res.json();
            if (res.ok) {
              alert(`Trade executed: ${JSON.stringify(result)}`);
            } else {
              alert(`Error: ${result.error}`);
            }
          } catch (error) {
            alert(`Error: ${error.message}`);
          }
          setDialog({ isOpen: false });
        }
      });
    } else {
      try {
        const status = action === 'Approve' ? 'APPROVED' : 'REJECTED';
        const res = await fetch('/api/approvals', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...apiHeaders(role) },
          body: JSON.stringify({ approvalId: id, status })
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || 'Failed to update approval');
        alert(`${status}: ${id}`);
        loadData();
      } catch (error) {
        alert(`Error: ${error.message}`);
      }
    }
  };

  const toggleWatchStatus = async (candidateId, newStatus) => {
    try {
      const res = await fetch('/api/candidates/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...apiHeaders(role) },
        body: JSON.stringify({ candidateId, status: newStatus })
      });
      if (!res.ok) throw new Error('Failed to update watchlist');
      alert(`Updated watchlist status`);
      loadData(); // Refresh data
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const startManualSwap = (candidateId) => {
    setManualCandidateId(candidateId);
    setActiveTab('trades');
  };

  const toggleAutoTrade = async (candidateId, enabled, mode = 'dry-run') => {
    try {
      const res = await fetch('/api/candidates/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...apiHeaders(role) },
        body: JSON.stringify({ candidateId, enabled, mode })
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Failed to update auto swap');
      loadData();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  const runAutoSwapTests = async () => {
    try {
      const res = await fetch('/api/auto-swap/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...apiHeaders(role) },
        body: JSON.stringify({})
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Failed to queue auto swap tests');
      alert(`Queued ${result.queued || 0} supervised ${result.executionMode} auto swap test(s)`);
      loadData();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  const getRiskLevel = (score) => {
    if (score > 80) return 'high';
    if (score > 60) return 'medium';
    return 'low';
  };

  const renderTabContent = () => {
    if (loading) return <p style={{color:"#94a3b8", textAlign:"center", padding:40}}>Loading...</p>;
    if (error) return (
      <div style={{color:"red", textAlign:"center", padding:40}}>
        <p>{error}</p>
        <button 
          onClick={loadData}
          style={{marginTop:10, padding:"8px 16px", background:"#3b82f6", color:"white", border:"none", borderRadius:8, cursor:"pointer"}}
        >
          Retry
        </button>
      </div>
    );

    switch (activeTab) {
      case "dashboard":
        return (
          <>
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:16, marginBottom:20}}>
              {card("Total Candidates", data.candidates?.length || 0, "Active opportunities")}
              {card("Execution mode", config.executionMode, config.executionMode === 'live' ? '🔥 LIVE' : config.executionMode === 'shadow-order' ? '👻 Simulated' : '🛡️ Safe')}
              {card("Trading enabled", config.tradingEnabled ? 'YES' : 'NO', config.tradingEnabled ? '✅ Active' : '⏸️ Disabled')}
              {card("Mandatory approvals", config.mandatoryApprovals ? 'YES' : 'NO', 'Server-side enforced')}
            </div>
            <section style={{background:"#0f172a",padding:20,borderRadius:20,border:"1px solid #1e293b",overflowX:"auto"}}>
              <h2 style={{marginTop:0}}>Top Candidates</h2>
              <Table 
                data={data.candidates} 
                columns={["Token", "Chain", "Venue", "Status", "Score", "Action"]} 
                emptyMessage="No candidates found. Worker may not be scanning yet." 
                renderRow={(row, i) => {
                  const isHighlighted = highlightedIds.has(`candidates-${i}`);
                  const isWatched = row.status === 'WATCH';
                  return [
                    <tr key={`${i}-main`} style={{background: isHighlighted ? '#1e3a3a' : 'transparent', transition: 'background 0.3s'}}>
                      <td style={{padding:"10px 0"}}>{row.token}</td>
                      <td>{row.chain}</td>
                      <td>{row.venue}</td>
                      <td>{row.status}</td>
                      <td style={{fontWeight: isHighlighted ? 'bold' : 'normal', color: isHighlighted ? '#22c55e' : '#e2e8f0'}}>{row.score}</td>
                      <td>
                        {role === 'admin' && (
                          <button 
                            onClick={() => toggleWatchStatus(row.id, isWatched ? 'INACTIVE' : 'WATCH')}
                            style={{padding:"4px 8px", background: isWatched ? '#ef4444' : '#22c55e', color:"white", border:"none", borderRadius:4, cursor:"pointer"}}
                          >
                            {isWatched ? 'Remove' : 'Watch'}
                          </button>
                        )}
                      </td>
                    </tr>,
                    <tr key={`${i}-warning`}>
                      <td colSpan="6" style={{padding:0, border:"none"}}>
                        <RiskWarning riskLevel={getRiskLevel(row.score)} details={`Score: ${row.score}/100`} />
                      </td>
                    </tr>
                  ];
                }}
              />
            </section>
          </>
        );
      case "watchlist":
        return (
          <section style={{background:"#0f172a",padding:20,borderRadius:20,border:"1px solid #1e293b",overflowX:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:12}}>
              <h2 style={{margin:0}}>Watchlist</h2>
              {role === 'admin' && (
                <button
                  onClick={runAutoSwapTests}
                  style={{padding:"8px 12px",background:"#1d4ed8",color:"white",border:"none",borderRadius:8,cursor:"pointer"}}
                >
                  Run Auto Tests
                </button>
              )}
            </div>
            <Table 
              data={data.watchlist?.filter(c => c.status === 'WATCH')} 
              columns={["Token", "Chain", "Venue", "Score", "Liquidity_USD", "Manual", "Auto", "Action"]} 
              emptyMessage="No items in watchlist." 
              renderRow={(row, i) => {
                const isHighlighted = highlightedIds.has(`watchlist-${i}`);
                return [
                  <tr key={`${i}-main`} style={{background: isHighlighted ? '#1e3a3a' : 'transparent', transition: 'background 0.3s'}}>
                    <td style={{padding:"10px 0"}}>{row.token}</td>
                    <td>{row.chain}</td>
                    <td>{row.venue}</td>
                    <td style={{fontWeight: isHighlighted ? 'bold' : 'normal', color: isHighlighted ? '#22c55e' : '#e2e8f0'}}>{row.score}</td>
                    <td>{row.liquidity_usd || '-'}</td>
                    <td>
                      <button
                        onClick={() => startManualSwap(row.id)}
                        style={{padding:"4px 8px", background:"#2563eb", color:"white", border:"none", borderRadius:4, cursor:"pointer"}}
                      >
                        Manual Swap
                      </button>
                    </td>
                    <td>
                      {role === 'admin' ? (
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <input
                            type="checkbox"
                            checked={Boolean(row.auto_trade_enabled)}
                            onChange={(event) => toggleAutoTrade(row.id, event.target.checked, row.auto_trade_mode || 'dry-run')}
                          />
                          <select
                            value={row.auto_trade_mode || 'dry-run'}
                            onChange={(event) => toggleAutoTrade(row.id, Boolean(row.auto_trade_enabled), event.target.value)}
                            style={{background:"#0f172a",color:"white",border:"1px solid #334155",borderRadius:4,padding:"4px"}}
                          >
                            <option value="dry-run">dry-run</option>
                            <option value="shadow-order">shadow</option>
                          </select>
                        </div>
                      ) : (
                        <span style={{color: row.auto_trade_enabled ? "#22c55e" : "#94a3b8"}}>
                          {row.auto_trade_enabled ? row.auto_trade_mode || 'dry-run' : 'Off'}
                        </span>
                      )}
                    </td>
                    <td>
                      {role === 'admin' && (
                        <button 
                          onClick={() => toggleWatchStatus(row.id, 'INACTIVE')}
                          style={{padding:"4px 8px", background:"#ef4444", color:"white", border:"none", borderRadius:4, cursor:"pointer"}}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>,
                  <tr key={`${i}-warning`}>
                    <td colSpan="8" style={{padding:0, border:"none"}}>
                      <RiskWarning riskLevel={getRiskLevel(row.score)} details={`Liquidity: $${row.liquidity_usd || 0}`} />
                    </td>
                  </tr>
                ];
              }}
            />
          </section>
        );
      case "approvals":
        return (
          <section style={{background:"#0f172a",padding:20,borderRadius:20,border:"1px solid #1e293b",overflowX:"auto"}}>
            <h2 style={{marginTop:0}}>Pending Approvals</h2>
            <Table 
              data={data.approvals?.filter(a => a.status === 'PENDING')} 
              columns={["ID", "Candidate_ID", "Reason", ...(role === 'admin' ? ["Actions"] : [])]} 
              emptyMessage="No pending approvals." 
              renderRow={(row, i) => {
                const candidate = data.candidates?.find(c => c.id === row.candidate_id);
                const riskLevel = candidate ? getRiskLevel(candidate.score) : 'low';
                return [
                  <tr key={`${i}-main`}>
                    <td style={{padding:"10px 0"}}>{row.id}</td>
                    <td>{row.candidate_id}</td>
                    <td>{row.reason || '-'}</td>
                    {role === 'admin' && (
                      <td>
                        <button onClick={() => handleAction('Approve', row.id, riskLevel)} style={{marginRight:8, padding:"4px 8px", background:"green", color:"white", border:"none", borderRadius:4}}>Approve</button>
                        <button onClick={() => handleAction('Reject', row.id, riskLevel)} style={{padding:"4px 8px", background:"red", color:"white", border:"none", borderRadius:4}}>Reject</button>
                      </td>
                    )}
                  </tr>,
                  <tr key={`${i}-warning`}>
                    <td colSpan={role === 'admin' ? "4" : "3"} style={{padding:0, border:"none"}}>
                      <RiskWarning riskLevel={riskLevel} details={`Candidate: ${candidate?.token || 'Unknown'}`} />
                    </td>
                  </tr>
                ];
              }}
            />
          </section>
        );
      case "trades":
        return (
          <TradesTab 
            data={data} 
            role={role}
            getRiskLevel={getRiskLevel}
            onExecuteTrade={loadData}
            initialCandidateId={manualCandidateId}
            onInitialCandidateHandled={() => setManualCandidateId(null)}
          />
        );
      case "logs":
        return (
          <section style={{background:"#0f172a",padding:20,borderRadius:20,border:"1px solid #1e293b"}}>
            <h2 style={{marginTop:0}}>Audit Logs & Monitoring</h2>
            <div style={{marginBottom:20}}>
              <p style={{color:"#94a3b8", fontSize:14}}>System events, trades, and errors</p>
            </div>
            {!data.trades || data.trades.length === 0 ? (
              <p style={{color:"#94a3b8", textAlign:"center", padding:20}}>No logs available.</p>
            ) : (
              <div style={{maxHeight:600, overflowY:"auto"}}>
                {data.trades.map((log, i) => (
                  <LogItem key={i} log={log} />
                ))}
              </div>
            )}
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <main style={{padding:24,maxWidth:1400,margin:"0 auto"}} suppressHydrationWarning>
      <h1 style={{fontSize:40,marginBottom:8}}>Alpha Watch</h1>
      <p style={{color:"#94a3b8",marginBottom:20}}>Tablet-ready operator console with multi-tab navigation.</p>

      {!mounted ? (
        <p style={{color:"#94a3b8", textAlign:"center", padding:40}}>Initializing...</p>
      ) : authReady && !authWallet ? (
        <section style={{background:"#0f172a",padding:24,borderRadius:12,border:"1px solid #1e293b",maxWidth:520}}>
          <h2 style={{marginTop:0}}>Wallet Required</h2>
          <p style={{color:"#94a3b8"}}>
            Connect Phantom Wallet from the Trades tab or reconnect your wallet, then refresh. Production APIs require an allowlisted wallet.
          </p>
          <button
            onClick={() => {
              const wallet = window.solana?.publicKey?.toString?.();
              if (wallet) {
                window.localStorage.setItem('alphaWallet', wallet);
                setAuthWallet(wallet);
              } else {
                setActiveTab('trades');
              }
            }}
            style={{padding:"10px 14px",background:"#1d4ed8",color:"white",border:"none",borderRadius:8,cursor:"pointer"}}
          >
            Check Wallet
          </button>
        </section>
      ) : (
        <>
          <div style={{marginBottom:20}}>
            <label style={{color:"#94a3b8", marginRight:10}}>Role:</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{padding:"8px", background:"#0f172a", color:"white", border:"1px solid #1e293b", borderRadius:8}}>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div style={{display:"flex", gap:12, overflowX:"auto", paddingBottom:8, marginBottom:20}}>
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding:"12px 16px",
                  borderRadius:14,
                  background: activeTab === tab.key ? "#1d4ed8" : "#0f172a",
                  border:"1px solid #1e293b",
                  whiteSpace:"nowrap",
                  fontWeight:600,
                  cursor:"pointer",
                  color:"white"
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{display:"grid", gridTemplateColumns:"minmax(0,2fr) minmax(320px,1fr)", gap:20, alignItems:"start"}}>
            <div>
              {error && <p style={{color:"red", textAlign:"center", padding:20}}>{error} - <button onClick={() => loadData()} style={{color:"blue", background:"none", border:"none", cursor:"pointer"}}>Retry</button></p>}
              {!error && renderTabContent()}
            </div>

            <aside style={{display:"grid",gap:16}}>
              <div style={{background:"#0f172a",padding:20,borderRadius:20,border:"1px solid #1e293b"}}>
                <h3 style={{marginTop:0}}>Quick Stats</h3>
                <p style={{color:"#94a3b8"}}>Candidates: {data.candidates?.length || 0}</p>
                <p style={{color:"#94a3b8"}}>Approvals: {data.approvals?.filter(a => a.status === 'PENDING').length || 0}</p>
                <p style={{color:"#94a3b8"}}>Role: {role}</p>
              </div>
              <div style={{background:"#0f172a",padding:20,borderRadius:20,border:"1px solid #1e293b"}}>
                <h3 style={{marginTop:0}}>System Status</h3>
                <p style={{color:"#94a3b8"}}>Worker: {loading ? 'Checking...' : 'Online'}</p>
                <p style={{color:"#94a3b8"}}>DB: Connected</p>
                {role === 'admin' && <p style={{color:"#94a3b8"}}>Admin Actions: Enabled</p>}
              </div>
            </aside>
          </div>

          <ConfirmationDialog 
            isOpen={dialog.isOpen} 
            onClose={() => setDialog({ isOpen: false })} 
            onConfirm={dialog.onConfirm} 
            title={dialog.title} 
            message={dialog.message} 
            riskDetails={dialog.riskDetails} 
          />
        </>
      )}
    </main>
  );
}
