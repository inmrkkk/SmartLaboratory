import React, { useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { applyDataConsistencyFixes, auditDataConsistency } from "../utils/dataConsistencyUtils";

export default function DataConsistencyAudit() {
  const { isAdmin } = useAuth();
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [onlySafe, setOnlySafe] = useState(true);

  const groupedFindings = useMemo(() => {
    if (!result?.findings) return { error: [], warning: [], info: [] };
    return result.findings.reduce(
      (acc, item) => {
        const key = item.severity || "info";
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      },
      { error: [], warning: [], info: [] }
    );
  }, [result]);

  const fixesToShow = useMemo(() => {
    if (!result?.fixes) return [];
    if (!onlySafe) return result.fixes;
    return result.fixes.filter((f) => f.safe);
  }, [result, onlySafe]);

  const runAudit = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await auditDataConsistency({ dryRun: true });
      setResult(res);
    } catch (e) {
      setError(e?.message || "Failed to run audit");
    } finally {
      setRunning(false);
    }
  };

  const applyFixes = async () => {
    if (!result?.fixes?.length) return;
    const applicableFixes = onlySafe ? result.fixes.filter((f) => f.safe) : result.fixes;

    if (!applicableFixes.length) return;

    const confirmed = window.confirm(
      `Apply ${applicableFixes.length} data consistency fix(es)? This will modify your database.`
    );
    if (!confirmed) return;

    setApplying(true);
    setError(null);

    try {
      await applyDataConsistencyFixes(applicableFixes);
      const rerun = await auditDataConsistency({ dryRun: true });
      setResult(rerun);
    } catch (e) {
      setError(e?.message || "Failed to apply fixes");
    } finally {
      setApplying(false);
    }
  };

  if (!isAdmin()) {
    return (
      <div className="dashboard-content-centered">
        <div className="access-denied">
          <h1>Access Denied</h1>
          <p>You don't have permission to access this section. Admin privileges required.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Data Consistency</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Audits laboratory data across the database and suggests safe auto-fixes.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled />
            Dry run
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={onlySafe} onChange={(e) => setOnlySafe(e.target.checked)} />
            Only safe fixes
          </label>
          <button className="btn btn-primary" onClick={runAudit} disabled={running}>
            {running ? "Running..." : "Run Audit"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={applyFixes}
            disabled={applying || running || !result?.fixes?.length}
            title={onlySafe ? "Applies only fixes marked safe" : "Applies all queued fixes"}
          >
            {applying ? "Applying..." : "Apply Fixes"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f3c2c2", background: "#fff5f5", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {!result && (
        <div style={{ marginTop: 16, padding: 16, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
          Run an audit to see findings and suggested fixes.
        </div>
      )}

      {result && (
        <>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div style={{ 
              padding: 16, 
              border: "1px solid #e2e8f0", 
              borderRadius: 12, 
              background: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease"
            }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Laboratories</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", marginTop: 4 }}>{result.summary.laboratories}</div>
            </div>
            <div style={{ 
              padding: 16, 
              border: "1px solid #e2e8f0", 
              borderRadius: 12, 
              background: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease"
            }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Equipment Categories</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", marginTop: 4 }}>{result.summary.equipmentCategories}</div>
            </div>
            <div style={{ 
              padding: 16, 
              border: "1px solid #e2e8f0", 
              borderRadius: 12, 
              background: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease"
            }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Borrow Requests</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", marginTop: 4 }}>{result.summary.borrowRequests}</div>
            </div>
            <div style={{ 
              padding: 16, 
              border: "1px solid #e2e8f0", 
              borderRadius: 12, 
              background: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease"
            }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Damaged/Lost Records</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", marginTop: 4 }}>{result.summary.damagedLostRecords}</div>
            </div>
            <div style={{ 
              padding: 16, 
              border: "1px solid #e2e8f0", 
              borderRadius: 12, 
              background: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease"
            }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Findings</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", marginTop: 4 }}>{result.summary.findings}</div>
            </div>
            <div style={{ 
              padding: 16, 
              border: "1px solid #e2e8f0", 
              borderRadius: 12, 
              background: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease"
            }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Fixes (safe)</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1e293b", marginTop: 4 }}>
                {result.summary.safeFixes}/{result.summary.fixes}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <div style={{ 
              padding: 20, 
              border: "1px solid #e2e8f0", 
              borderRadius: 12, 
              background: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
            }}>
              <h3 style={{ 
                marginTop: 0, 
                marginBottom: 16,
                fontSize: 18,
                fontWeight: 700,
                color: "#1e293b",
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                <span style={{ 
                  width: 4, 
                  height: 20, 
                  background: "#3b82f6", 
                  borderRadius: 2 
                }}></span>
                Findings
              </h3>
              {result.findings.length === 0 ? (
                <div style={{ 
                  opacity: 0.75, 
                  textAlign: "center",
                  padding: 24,
                  background: "#f8fafc",
                  borderRadius: 8,
                  border: "1px dashed #cbd5e1"
                }}>
                  ✅ No findings. Data looks consistent.
                </div>
              ) : (
                <>
                  {(["error", "warning", "info"]).map((severity) => {
                    const items = groupedFindings[severity] || [];
                    if (!items.length) return null;
                    const label = severity === "error" ? "Errors" : severity === "warning" ? "Warnings" : "Info";
                    return (
                      <div key={severity} style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{label} ({items.length})</div>
                        <div style={{ display: "grid", gap: 8 }}>
                          {items.slice(0, 50).map((item) => (
                            <div 
                              key={item.id} 
                              style={{ 
                                padding: 12, 
                                border: `1px solid ${
                                  severity === "error" ? "#fca5a5" : 
                                  severity === "warning" ? "#fcd34d" : 
                                  "#ddd6fe"
                                }`, 
                                borderRadius: 8,
                                background: severity === "error" ? "#fef2f2" : 
                                           severity === "warning" ? "#fffbeb" : 
                                           "#faf5ff",
                                borderLeft: `4px solid ${
                                  severity === "error" ? "#dc2626" : 
                                  severity === "warning" ? "#f59e0b" : 
                                  "#7c3aed"
                                }`
                              }}
                            >
                              <div style={{ 
                                display: "flex", 
                                justifyContent: "space-between", 
                                alignItems: "flex-start",
                                gap: 12
                              }}>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>
                                  {item.title}
                                </div>
                                <div style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  padding: "2px 8px",
                                  borderRadius: "12px",
                                  background: severity === "error" ? "#dc2626" : 
                                             severity === "warning" ? "#f59e0b" : 
                                             "#7c3aed",
                                  color: "white"
                                }}>
                                  {severity}
                                </div>
                              </div>
                              <pre style={{ 
                                margin: "8px 0 0", 
                                whiteSpace: "pre-wrap",
                                fontSize: 12,
                                color: "#475569",
                                background: "rgba(0,0,0,0.02)",
                                padding: 8,
                                borderRadius: 4,
                                border: "1px solid rgba(0,0,0,0.06)"
                              }}>
                                {JSON.stringify(item.details, null, 2)}
                              </pre>
                            </div>
                          ))}
                          {items.length > 50 && (
                            <div style={{ 
                              opacity: 0.7, 
                              textAlign: "center",
                              padding: 12,
                              background: "#f8fafc",
                              borderRadius: 8,
                              border: "1px dashed #cbd5e1"
                            }}>
                              Showing 50 of {items.length}. Refine the rules if you need the full list in UI.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div style={{ 
              padding: 20, 
              border: "1px solid #e2e8f0", 
              borderRadius: 12, 
              background: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
            }}>
              <h3 style={{ 
                marginTop: 0, 
                marginBottom: 16,
                fontSize: 18,
                fontWeight: 700,
                color: "#1e293b",
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                <span style={{ 
                  width: 4, 
                  height: 20, 
                  background: "#10b981", 
                  borderRadius: 2 
                }}></span>
                Proposed Fixes
              </h3>
              {fixesToShow.length === 0 ? (
                <div style={{ 
                  opacity: 0.75, 
                  textAlign: "center",
                  padding: 24,
                  background: "#f8fafc",
                  borderRadius: 8,
                  border: "1px dashed #cbd5e1"
                }}>
                  🔧 No fixes queued.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {fixesToShow.slice(0, 100).map((fix, idx) => (
                    <div 
                      key={`${fix.path}_${idx}`} 
                      style={{ 
                        padding: 12, 
                        border: `1px solid ${fix.safe ? "#86efac" : "#fca5a5"}`, 
                        borderRadius: 8,
                        background: fix.safe ? "#f0fdf4" : "#fef2f2",
                        borderLeft: `4px solid ${fix.safe ? "#16a34a" : "#dc2626"}`
                      }}
                    >
                      <div style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        gap: 10, 
                        flexWrap: "wrap",
                        alignItems: "flex-start"
                      }}>
                        <div style={{ 
                          fontWeight: 600, 
                          fontSize: 14,
                          flex: 1,
                          minWidth: 200
                        }}>
                          {fix.reason}
                        </div>
                        <div style={{ 
                          fontSize: 11, 
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          padding: "4px 8px",
                          borderRadius: "12px",
                          background: fix.safe ? "#16a34a" : "#dc2626",
                          color: "white",
                          whiteSpace: "nowrap"
                        }}>
                          {fix.safe ? "SAFE" : "REVIEW"}
                        </div>
                      </div>
                      <div style={{ 
                        marginTop: 8, 
                        fontSize: 13,
                        display: "grid",
                        gap: 4
                      }}>
                        <div style={{ 
                          display: "flex", 
                          gap: 8,
                          alignItems: "center"
                        }}>
                          <strong style={{ color: "#374151", minWidth: 50 }}>Path:</strong>
                          <code style={{ 
                            background: "rgba(0,0,0,0.05)", 
                            padding: "2px 6px", 
                            borderRadius: 4,
                            fontSize: 11,
                            color: "#1f2937",
                            wordBreak: "break-all"
                          }}>
                            {fix.path}
                          </code>
                        </div>
                        <div style={{ 
                          display: "flex", 
                          gap: 8,
                          alignItems: "center"
                        }}>
                          <strong style={{ color: "#374151", minWidth: 50 }}>Value:</strong>
                          <code style={{ 
                            background: fix.safe ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)", 
                            padding: "2px 6px", 
                            borderRadius: 4,
                            fontSize: 12,
                            color: fix.safe ? "#166534" : "#991b1b",
                            fontWeight: 600
                          }}>
                            {String(fix.value)}
                          </code>
                        </div>
                      </div>
                    </div>
                  ))}
                  {fixesToShow.length > 100 && (
                    <div style={{ 
                      opacity: 0.7, 
                      textAlign: "center",
                      padding: 12,
                      background: "#f8fafc",
                      borderRadius: 8,
                      border: "1px dashed #cbd5e1"
                    }}>
                      Showing 100 of {fixesToShow.length} fixes.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
