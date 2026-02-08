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
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Laboratories</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{result.summary.laboratories}</div>
            </div>
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Equipment Categories</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{result.summary.equipmentCategories}</div>
            </div>
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Borrow Requests</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{result.summary.borrowRequests}</div>
            </div>
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Damaged/Lost Records</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{result.summary.damagedLostRecords}</div>
            </div>
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Findings</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{result.summary.findings}</div>
            </div>
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Fixes (safe)</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {result.summary.safeFixes}/{result.summary.fixes}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
              <h3 style={{ marginTop: 0 }}>Findings</h3>
              {result.findings.length === 0 ? (
                <div style={{ opacity: 0.75 }}>No findings. Data looks consistent.</div>
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
                            <div key={item.id} style={{ padding: 10, border: "1px solid #f0f0f0", borderRadius: 8 }}>
                              <div style={{ fontWeight: 600 }}>{item.title}</div>
                              <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
                                {JSON.stringify(item.details, null, 2)}
                              </pre>
                            </div>
                          ))}
                          {items.length > 50 && (
                            <div style={{ opacity: 0.7 }}>
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

            <div style={{ padding: 14, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
              <h3 style={{ marginTop: 0 }}>Proposed Fixes</h3>
              {fixesToShow.length === 0 ? (
                <div style={{ opacity: 0.75 }}>No fixes queued.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {fixesToShow.slice(0, 100).map((fix, idx) => (
                    <div key={`${fix.path}_${idx}`} style={{ padding: 10, border: "1px solid #f0f0f0", borderRadius: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600 }}>{fix.reason}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{fix.safe ? "SAFE" : "REVIEW"}</div>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13 }}>
                        <div><strong>Path:</strong> {fix.path}</div>
                        <div><strong>Value:</strong> <code>{String(fix.value)}</code></div>
                      </div>
                    </div>
                  ))}
                  {fixesToShow.length > 100 && (
                    <div style={{ opacity: 0.7 }}>Showing 100 of {fixesToShow.length}.</div>
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
