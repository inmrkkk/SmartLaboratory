import React, { useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { applyDataConsistencyFixes, auditDataConsistency } from "../utils/dataConsistencyUtils";
import "../CSS/DataConsistency.css";

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
    <div className="data-consistency-container">
      <div className="data-consistency-welcome">
        <div className="welcome-content">
          <h1 className="welcome-title">Data Consistency</h1>
          <p className="welcome-subtitle">
            Audits laboratory data across the database and suggests safe auto-fixes.
          </p>
        </div>

        <div className="data-consistency-controls">
          <div className="checkbox-group">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled />
            Dry run
          </div>
          <div className="checkbox-group">
            <input type="checkbox" checked={onlySafe} onChange={(e) => setOnlySafe(e.target.checked)} />
            Only safe fixes
          </div>
          <div className="action-buttons-group">
            <button className="btn-run-audit" onClick={runAudit} disabled={running}>
              {running ? "Running..." : "Run Audit"}
            </button>
            <button
              className="btn-apply-fixes"
              onClick={applyFixes}
              disabled={applying || running || !result?.fixes?.length}
              title={onlySafe ? "Applies only fixes marked safe" : "Applies all queued fixes"}
            >
              {applying ? "Applying..." : "Apply Fixes"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {!result && (
        <div className="initial-state">
          Run an audit to see findings and suggested fixes.
        </div>
      )}

      {result && (
        <>
          <div className="summary-grid">
            <div className="summary-card">
              <div className="summary-label">Laboratories</div>
              <div className="summary-value">{result.summary.laboratories}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Equipment Categories</div>
              <div className="summary-value">{result.summary.equipmentCategories}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Borrow Requests</div>
              <div className="summary-value">{result.summary.borrowRequests}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Damaged/Lost Records</div>
              <div className="summary-value">{result.summary.damagedLostRecords}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Findings</div>
              <div className="summary-value">{result.summary.findings}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Fixes (safe)</div>
              <div className="summary-value">
                {result.summary.safeFixes}/{result.summary.fixes}
              </div>
            </div>
          </div>

          <div className="content-sections">
            <div className="content-section">
              <h3 className="data-consistency-section-header">
                <span className="section-indicator findings"></span>
                Findings
              </h3>
              {result.findings.length === 0 ? (
                <div className="empty-state">
                   No findings. Data looks consistent.
                </div>
              ) : (
                <>
                  {(["error", "warning", "info"]).map((severity) => {
                    const items = groupedFindings[severity] || [];
                    if (!items.length) return null;
                    const label = severity === "error" ? "Errors" : severity === "warning" ? "Warnings" : "Info";
                    return (
                      <div key={severity} className="findings-group">
                        <div className="findings-group-title">{label} ({items.length})</div>
                        <div className="findings-list">
                          {items.slice(0, 50).map((item) => (
                            <div 
                              key={item.id} 
                              className={`finding-item ${severity}`}
                            >
                              <div className="finding-header">
                                <div className="finding-title">
                                  {item.title}
                                </div>
                                <div className={`severity-badge ${severity}`}>
                                  {severity}
                                </div>
                              </div>
                              <pre className="finding-details">
                                {JSON.stringify(item.details, null, 2)}
                              </pre>
                            </div>
                          ))}
                          {items.length > 50 && (
                            <div className="limit-message">
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

            <div className="content-section">
              <h3 className="data-consistency-section-header">
                <span className="section-indicator fixes"></span>
                Proposed Fixes
              </h3>
              {fixesToShow.length === 0 ? (
                <div className="empty-state">
                   No fixes queued.
                </div>
              ) : (
                <div className="fixes-list">
                  {fixesToShow.slice(0, 100).map((fix, idx) => (
                    <div 
                      key={`${fix.path}_${idx}`} 
                      className={`fix-item ${fix.safe ? "safe" : "unsafe"}`}
                    >
                      <div className="fix-header">
                        <div className="fix-reason">
                          {fix.reason}
                        </div>
                        <div className={`safety-badge ${fix.safe ? "safe" : "unsafe"}`}>
                          {fix.safe ? "SAFE" : "REVIEW"}
                        </div>
                      </div>
                      <div className="fix-details">
                        <div className="fix-detail-row">
                          <span className="fix-detail-label">Path:</span>
                          <code className="fix-detail-value">
                            {fix.path}
                          </code>
                        </div>
                        <div className="fix-detail-row">
                          <span className="fix-detail-label">Value:</span>
                          <code className={`fix-detail-value ${fix.safe ? "safe" : "unsafe"}`}>
                            {String(fix.value)}
                          </code>
                        </div>
                      </div>
                    </div>
                  ))}
                  {fixesToShow.length > 100 && (
                    <div className="limit-message">
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
