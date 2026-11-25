import { useState } from "react";

import { db } from "../firebase";
import { useAuth } from "../context/useAuth";

import { runDataQualityAudit } from "../utils/audit/runAudit";

import "./DataQualityAudit.css";

// --------------------------------------------------
// SMALL RENDER HELPERS
// --------------------------------------------------

const IssuesTable = ({ counts, label }) => {
  const entries = Object.entries(counts || {});

  if (entries.length === 0) {
    return (
      <p className="audit-ok">No {label} found.</p>
    );
  }

  return (
    <table className="audit-table">
      <caption className="sr-only">{label}</caption>
      <thead>
        <tr>
          <th>Item</th>
          <th>Documents</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, count]) => (
          <tr key={key}>
            <td>{key}</td>
            <td>{count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const NoteBox = ({ children }) => (
  <p className="audit-note">{children}</p>
);

// --------------------------------------------------
// DATA QUALITY AUDIT COMPONENT
// --------------------------------------------------

const DataQualityAudit = () => {
  const { isAdmin } = useAuth();

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [report, setReport] = useState(null);
  const [errorText, setErrorText] = useState(null);

  if (!isAdmin) {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1>Data Quality Audit</h1>
          <p>Administrator access required.</p>
        </header>

        <div className="error-message" role="alert">
          This audit can only be started by an
          administrator. Note that Firestore security
          rules authorize active staff reads, so this is
          a frontend restriction, not a database
          restriction.
        </div>
      </div>
    );
  }

  const handleRun = async () => {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    setProgress(null);
    setReport(null);
    setErrorText(null);

    try {
      const result = await runDataQualityAudit({
        db,
        onProgress: setProgress,
      });

      setReport(result);
    } catch (error) {
      console.error("Data quality audit failed:", error);

      setErrorText(
        error?.code === "permission-denied"
          ? "Firestore denied the read. Check that your staff account is active and try again."
          : "The audit could not be completed. Check your connection and permissions, then try again."
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleExport = () => {
    if (!report) {
      return;
    }

    const blob = new Blob(
      [JSON.stringify(report, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `vansked-data-quality-audit-${report.coverage.latest || "report"}.json`;
    link.click();

    URL.revokeObjectURL(url);
  };

  const formatIso = (iso) => {
    try {
      return new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Historical Data Quality Audit</h1>
        <p>
          Read-only scan of trip history. Aggregate
          results only — no document IDs, plates, driver
          names, phone numbers, or raw records are shown
          or exported.
        </p>
      </header>

      <div className="audit-actions">
        <button
          type="button"
          className="audit-run-btn"
          onClick={handleRun}
          disabled={isRunning}
        >
          {isRunning
            ? "Scanning..."
            : "Run Read-Only Audit"}
        </button>

        {progress && (
          <p className="audit-progress" role="status">
            {progress.documentsRead} documents read
            across {progress.pages} page(s)...
          </p>
        )}

        {report && !isRunning && (
          <button
            type="button"
            className="audit-export-btn"
            onClick={handleExport}
          >
            Export Aggregate JSON
          </button>
        )}
      </div>

      {errorText && (
        <div className="error-message" role="alert">
          {errorText}
        </div>
      )}

      {report && (
        <div className="audit-report">

          {/* SCAN WINDOW */}

          <section className="audit-section">
            <h3>Scan Window</h3>
            <p>
              Started {formatIso(report.scanWindow.auditStartedAt)}{" "}
              — completed{" "}
              {formatIso(report.scanWindow.auditCompletedAt)}.
            </p>
            <p>
              Pre/post counts:{" "}
              {report.scanWindow.countBefore === null
                ? "unavailable"
                : `${report.scanWindow.countBefore} → ${report.scanWindow.countAfter}`}
              {report.scanWindow.churnDetected
                ? " (changed during scan)"
                : ""}
              {report.scanWindow.sumMatchesCount === false
                ? "; paginated total does not match the post-scan count"
                : ""}
              .
            </p>
            <NoteBox>
              {report.scanWindow.limitation}
            </NoteBox>
          </section>

          {/* COVERAGE */}

          <section className="audit-section">
            <h3>Coverage</h3>
            <div className="audit-kpis">
              <div className="audit-kpi">
                <h4>Documents Read</h4>
                <p>{report.coverage.documentsRead}</p>
              </div>
              <div className="audit-kpi">
                <h4>Distinct Dates</h4>
                <p>{report.coverage.distinctDates}</p>
              </div>
              <div className="audit-kpi">
                <h4>Earliest Date</h4>
                <p>{report.coverage.earliest || "—"}</p>
              </div>
              <div className="audit-kpi">
                <h4>Latest Date</h4>
                <p>{report.coverage.latest || "—"}</p>
              </div>
            </div>
          </section>

          {/* STATUS COUNTS */}

          <section className="audit-section">
            <h3>Trips by Status</h3>
            <IssuesTable
              counts={report.statusCounts}
              label="status counts"
            />
          </section>

          {/* DEPARTED ELIGIBILITY */}

          <section className="audit-section">
            <h3>Departed Trip Eligibility Layers</h3>
            <IssuesTable
              counts={{
                "raw Departed":
                  report.departedEligibility.rawDeparted,
                "schema-conforming Departed":
                  report.departedEligibility.schemaConforming,
                "occupancy-eligible":
                  report.departedEligibility.occupancyEligible,
                "time-slot-eligible":
                  report.departedEligibility.timeSlotEligible,
                "route-analysis-eligible":
                  report.departedEligibility.routeEligible,
              }}
              label="eligibility layers"
            />
            <NoteBox>
              {report.departedEligibility.note}
            </NoteBox>
          </section>

          {/* FIELD ISSUES */}

          <section className="audit-section">
            <h3>Required Fields — Missing</h3>
            <IssuesTable
              counts={report.fieldIssues.requiredMissing}
              label="missing required fields"
            />

            <h3>Required Fields — Invalid Value</h3>
            <IssuesTable
              counts={report.fieldIssues.requiredInvalid}
              label="invalid required fields"
            />

            <h3>
              Optional Fields — Invalid When Present
            </h3>
            <IssuesTable
              counts={
                report.fieldIssues.optionalInvalidWhenPresent
              }
              label="invalid optional fields"
            />

            <p>
              Documents with unknown extra keys:{" "}
              {
                report.fieldIssues
                  .documentsWithUnknownExtraKeys
              }
            </p>
            <NoteBox>
              {report.fieldIssues.note}
            </NoteBox>
          </section>

          {/* SEAT VALIDITY */}

          <section className="audit-section">
            <h3>Seat Validity</h3>
            <p>
              Departed invariant violations (seatsTaken +
              vacantSeats ≠ capacity):{" "}
              {
                report.seatValidity
                  .departedInvariantViolations
              }
            </p>

            <IssuesTable
              counts={
                report.seatValidity
                  .departedInvariantDeltaDistribution
              }
              label="invariant delta distribution"
            />

            <p>
              Non-departed documents with seatsTaken &gt; 0:{" "}
              {report.seatValidity.nonDepartedWithSeatsTaken}
            </p>
            <NoteBox>{report.seatValidity.note}</NoteBox>
          </section>

          {/* DUPLICATES */}

          <section className="audit-section">
            <h3>Duplicate Candidates</h3>
            <p>
              Strong candidates (date + time24 + plate):{" "}
              {report.duplicates.strongCandidates.groups}{" "}
              group(s),{" "}
              {
                report.duplicates.strongCandidates
                  .documentsInvolved
              }{" "}
              document(s) involved.
            </p>
            <p>
              Possible candidates, plate unavailable (date
              + time24 + route):{" "}
              {report.duplicates.possibleCandidates.groups}{" "}
              group(s),{" "}
              {
                report.duplicates.possibleCandidates
                  .documentsInvolved
              }{" "}
              document(s) involved.
            </p>
            <NoteBox>
              {report.duplicates.note}
            </NoteBox>
          </section>

          {/* TIME CONSISTENCY */}

          <section className="audit-section">
            <h3>
              Time Consistency (Asia/Manila)
            </h3>
            <p>
              Date mismatch vs departureAt:{" "}
              {
                report.timeConsistency
                  .dateMismatchVsDepartureAt
              }
            </p>
            <p>
              time24 mismatch vs departureAt:{" "}
              {
                report.timeConsistency
                  .time24MismatchVsDepartureAt
              }
            </p>
            <p>
              Excluded from checks — invalid date:{" "}
              {report.timeConsistency.dateInvalidExcluded},
              absent time24:{" "}
              {report.timeConsistency.time24AbsentExcluded}
            </p>
            <p>
              Fully consistent documents:{" "}
              {report.timeConsistency.consistentDocuments}
            </p>
          </section>

          {/* OCCUPANCY INDICATORS */}

          <section className="audit-section">
            <h3>Occupancy Review Indicators</h3>
            <IssuesTable
              counts={{
                "Departed with vacantSeats = 1 (matches dialog default)":
                  report.occupancyReviewIndicators
                    .departedVacantSeatsEqualsOne,
                "Departed with vacantSeats = 0":
                  report.occupancyReviewIndicators
                    .departedVacantSeatsZero,
                "Departed, completely empty van":
                  report.occupancyReviewIndicators
                    .departedEmptyVan,
              }}
              label="occupancy review indicators"
            />
            <NoteBox>
              {
                report.occupancyReviewIndicators.note
              }
            </NoteBox>
          </section>

          {/* FLEET CROSS-CHECK */}

          <section className="audit-section">
            <h3>Fleet Capacity Cross-Check</h3>
            <p>
              Vehicles matched:{" "}
              {report.fleetCrossCheck.matchedPlateVehicles},
              unmatched:{" "}
              {report.fleetCrossCheck.unmatchedPlateVehicles}
            </p>
            <p>
              Documents where trip capacity differs from
              current fleet capacity:{" "}
              {
                report.fleetCrossCheck
                  .capacityMismatchDocuments
              }
            </p>
            <IssuesTable
              counts={
                report.fleetCrossCheck.capacityMismatchPairs
              }
              label="capacity difference pairs"
            />
            <NoteBox>
              {report.fleetCrossCheck.note}
            </NoteBox>
          </section>

          {/* HISTORICAL COVERAGE */}

          <section className="audit-section">
            <h3>Historical Coverage</h3>
            <p>
              Departed coverage span:{" "}
              {
                report.historicalCoverage
                  .departedCoverageSpanDays
              }{" "}
              day(s), across{" "}
              {
                report.historicalCoverage
                  .distinctDatesWithOccupancyEligible
              }{" "}
              distinct date(s) with occupancy-eligible
              records.
            </p>

            <h4 className="audit-subheading">
              Occupancy-eligible Departed records by
              weekday
            </h4>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Weekday</th>
                  <th>Records</th>
                  <th>Distinct dates</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(
                  report.historicalCoverage
                    .occupancyEligibleByWeekday
                ).map(([weekday, values]) => (
                  <tr key={weekday}>
                    <td>{weekday}</td>
                    <td>{values.records}</td>
                    <td>{values.distinctDates}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4 className="audit-subheading">
              Occupancy-eligible Departed records by route
            </h4>
            <IssuesTable
              counts={
                report.historicalCoverage
                  .occupancyEligibleByRoute
              }
              label="records by route"
            />

            <h4 className="audit-subheading">
              Occupancy-eligible Departed records by route
              and departure hour (Manila)
            </h4>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Hour slots (records)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(
                  report.historicalCoverage
                    .occupancyEligibleByRouteAndHourSlot
                ).map(([route, slots]) => (
                  <tr key={route}>
                    <td>{route}</td>
                    <td>
                      {Object.entries(slots)
                        .map(
                          ([hour, count]) =>
                            `${hour}:00 — ${count}`
                        )
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* FORECAST READINESS EVIDENCE */}

          <section className="audit-section">
            <h3>Forecast Readiness Evidence</h3>
            <p className="audit-verdict">
              {report.forecastReadiness.decision}
            </p>
            <IssuesTable
              counts={Object.fromEntries(
                Object.entries(
                  report.forecastReadiness
                    .measuredEvidence
                )
                  .filter(
                    ([, value]) =>
                      typeof value === "number" ||
                      typeof value === "string"
                  )
                  .map(([key, value]) => [
                    key,
                    String(value),
                  ])
              )}
              label="measured evidence"
            />
            <h4 className="audit-subheading">
              Records per weekday
            </h4>
            <IssuesTable
              counts={
                report.forecastReadiness
                  .measuredEvidence.recordsPerWeekday
              }
              label="records per weekday"
            />
            <NoteBox>
              {report.forecastReadiness.decisionNote}
            </NoteBox>
          </section>
        </div>
      )}
    </div>
  );
};

export default DataQualityAudit;
