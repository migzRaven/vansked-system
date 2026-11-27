import { useCallback, useMemo, useRef, useState } from "react";
import * as firestore from "firebase/firestore";

import { db } from "../firebase";

import {
  PAGE_SIZE,
  runHistoricalAggregation,
  validateHistoryDateRange,
} from "../utils/analytics/historyScan.js";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import "./HistoryDashboard.css";

// --------------------------------------------------
// MANILA DATE UTILITIES
// --------------------------------------------------

const manilaDateFormatter = new Intl.DateTimeFormat(
  "en-US",
  {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }
);

const getManilaDate = () => {
  const parts = Object.fromEntries(
    manilaDateFormatter
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
};

// Calendar-only shift on validated YYYY-MM-DD strings.
// Uses Date.UTC on explicit components; never
// new Date("YYYY-MM-DD").

const shiftYMD = (dateString, deltaDays) => {
  const [year, month, day] = dateString
    .split("-")
    .map(Number);

  const shifted = new Date(
    Date.UTC(year, month - 1, day + deltaDays)
  );

  const pad = (value) =>
    String(value).padStart(2, "0");

  return `${shifted.getUTCFullYear()}-${pad(
    shifted.getUTCMonth() + 1
  )}-${pad(shifted.getUTCDate())}`;
};

const manilaTimestampFormatter = new Intl.DateTimeFormat(
  "en-PH",
  {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }
);

const formatScanTime = (ms) =>
  typeof ms === "number"
    ? manilaTimestampFormatter.format(new Date(ms))
    : "—";

// --------------------------------------------------
// SMALL PRESENTATIONAL COMPONENTS
// --------------------------------------------------

const KpiCard = ({ label, value, note }) => (
  <div className="hist-kpi">
    <h4>{label}</h4>
    <p>{value}</p>
    {note ? <span>{note}</span> : null}
  </div>
);

const toPercentText = (value) =>
  value === null || value === undefined
    ? "—"
    : `${value.toFixed(1)}%`;

const toCountText = (value) =>
  value === null || value === undefined ? "—" : value;

// --------------------------------------------------
// PRESET RANGES
// --------------------------------------------------

const RANGE_PRESETS = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "custom", label: "Custom", days: null },
];

const STATUS_ORDER = [
  "Waiting",
  "Boarding",
  "Full",
  "Overdue",
  "Departed",
];

const STATUS_COLORS = {
  Waiting: "var(--waiting)",
  Boarding: "var(--boarding)",
  Full: "var(--full)",
  Overdue: "var(--overdue)",
  Departed: "var(--departed)",
  invalidOrMissing: "var(--muted)",
};

const HISTORY_LABEL =
  "Historical Operational Analytics";

// --------------------------------------------------
// HISTORY DASHBOARD COMPONENT
// --------------------------------------------------

const HistoryDashboard = () => {
  const today = getManilaDate();

  const [presetId, setPresetId] = useState("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [appliedRange, setAppliedRange] = useState(null);

  const [status, setStatus] = useState("idle");
  const [selectionError, setSelectionError] = useState(
    null
  );
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState({
    documentsRead: 0,
    pagesProcessed: 0,
  });

  // Stale-response and single-flight guards. Date input
  // changes never trigger reads; only Apply/Refresh do.

  const requestSeq = useRef(0);
  const runningRef = useRef(false);

  const resolveSelection = () => {
    const preset = RANGE_PRESETS.find(
      ({ id }) => id === presetId
    );

    if (preset.days) {
      return {
        startDate: shiftYMD(today, -(preset.days - 1)),
        endDate: today,
      };
    }

    if (!customStart || !customEnd) {
      return {
        error:
          "Select both a start and an end date for the " +
          "custom range.",
      };
    }

    return {
      startDate: customStart,
      endDate: customEnd,
    };
  };

  const runScan = useCallback(
    async (selection) => {
      if (runningRef.current) {
        return;
      }

      const validation = validateHistoryDateRange(
        selection.startDate,
        selection.endDate
      );

      if (!validation.valid) {
        setSelectionError(validation.message);
        return;
      }

      setSelectionError(null);

      const requestId = requestSeq.current + 1;
      requestSeq.current = requestId;
      runningRef.current = true;

      setStatus("loading");
      setProgress({ documentsRead: 0, pagesProcessed: 0 });
      setResult(null);
      setAppliedRange({
        startDate: selection.startDate,
        endDate: selection.endDate,
      });

      try {
        const scanResult =
          await runHistoricalAggregation({
            startDate: selection.startDate,
            endDate: selection.endDate,
            db,
            firestore,
            onProgress: (update) => {
              if (requestSeq.current === requestId) {
                setProgress(update);
              }
            },
          });

        if (requestSeq.current !== requestId) {
          return;
        }

        setResult(scanResult);
        setStatus(scanResult.ok ? "done" : "error");
      } catch {
        if (requestSeq.current !== requestId) {
          return;
        }

        setResult({
          ok: false,
          error: {
            code: "unexpected",
            message:
              "Unexpected failure while scanning historical " +
              "trips. The request was aborted before a " +
              "complete report could be produced.",
          },
        });
        setStatus("error");
      } finally {
        runningRef.current = false;
      }
    },
    []
  );

  const handleApply = () => {
    const selection = resolveSelection();

    if (selection.error) {
      setSelectionError(selection.error);
      return;
    }

    runScan(selection);
  };

  const handleRefresh = () => {
    if (appliedRange) {
      runScan(appliedRange);
    }
  };

  const report = status === "done" && result?.ok
    ? result.report
    : null;

  const scanMeta =
    result?.scanMeta ?? null;

  const dailyData = useMemo(
    () =>
      report
        ? Object.entries(report.activity.dailyCounts).map(
            ([date, trips]) => ({ date, trips })
          )
        : [],
    [report]
  );

  const weeklyData = useMemo(
    () =>
      report
        ? Object.entries(report.activity.weeklyCounts).map(
            ([week, trips]) => ({
              label: `Week of ${week}`,
              trips,
            })
          )
        : [],
    [report]
  );

  const statusData = useMemo(() => {
    if (!report) {
      return [];
    }

    const known = STATUS_ORDER.map((name) => ({
      name,
      trips: report.statusCounts[name] || 0,
    }));

    return [
      ...known,
      {
        name: "Invalid or missing",
        trips: report.statusCounts.invalidOrMissing || 0,
      },
    ];
  }, [report]);

  const routeData = useMemo(
    () =>
      report
        ? Object.entries(report.routes.counts).map(
            ([route, trips]) => ({ route, trips })
          )
        : [],
    [report]
  );

  const hourData = useMemo(
    () =>
      report
        ? Object.entries(report.activity.hourCounts).map(
            ([hour, trips]) => ({ hour, trips })
          )
        : [],
    [report]
  );

  const weekdayData = useMemo(
    () =>
      report
        ? Object.entries(report.activity.weekdayCounts).map(
            ([weekday, trips]) => ({ weekday, trips })
          )
        : [],
    [report]
  );

  const fleetRows = useMemo(
    () =>
      report
        ? Object.entries(report.vehicles.tripCounts).map(
            ([plate, trips]) => ({ plate, trips })
          )
        : [],
    [report]
  );

  const fleetMatchText = report
    ? `${report.vehicles.vehiclesMatchedInCurrentFleet} of ${
        report.vehicles.vehiclesMatchedInCurrentFleet +
        report.vehicles.vehiclesUnmatchedInCurrentFleet
      } distinct vehicles matched the current fleet registry.`
    : null;

  const demand = report?.passengerDemand ?? null;

  const demandDailyData = useMemo(
    () =>
      demand
        ? demand.daily.map(({ date, passengers }) => ({
            date,
            passengers,
          }))
        : [],
    [demand]
  );

  return (
    <div className="hist-page">
      <header className="hist-header">
        <h2>{HISTORY_LABEL}</h2>
        <p className="hist-subtitle">
          One-shot paginated reads of historical trips
          within a selected Asia/Manila date range. Read
          only; no data is modified.
        </p>
      </header>

      {/* ------------------------------------------
          DATE RANGE CONTROLS
      ------------------------------------------ */}

      <section className="hist-card hist-controls">
        <h3>Date range</h3>

        <div className="hist-presets">
          {RANGE_PRESETS.map((preset) => (
            <label
              key={preset.id}
              className={
                presetId === preset.id
                  ? "hist-preset selected"
                  : "hist-preset"
              }
            >
              <input
                type="radio"
                name="hist-preset"
                value={preset.id}
                checked={presetId === preset.id}
                onChange={() => setPresetId(preset.id)}
                disabled={status === "loading"}
              />
              {preset.label}
            </label>
          ))}
        </div>

        {presetId === "custom" ? (
          <div className="hist-custom-dates">
            <label>
              Start (Manila date)
              <input
                type="date"
                value={customStart}
                onChange={(event) =>
                  setCustomStart(event.target.value)
                }
                disabled={status === "loading"}
              />
            </label>
            <label>
              End (Manila date)
              <input
                type="date"
                value={customEnd}
                onChange={(event) =>
                  setCustomEnd(event.target.value)
                }
                disabled={status === "loading"}
              />
            </label>
          </div>
        ) : null}

        <div className="hist-actions">
          <button
            type="button"
            className="hist-apply"
            onClick={handleApply}
            disabled={status === "loading"}
          >
            {status === "loading"
              ? "Scanning…"
              : "Apply and scan"}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={
              status === "loading" || !appliedRange
            }
          >
            Refresh
          </button>
        </div>

        {selectionError ? (
          <p className="hist-error-text" role="alert">
            {selectionError}
          </p>
        ) : null}

        <p className="hist-note">
          Changing dates above does not read any data.
          Reads happen only when you apply or refresh a
          range.
        </p>
      </section>

      {/* ------------------------------------------
          SCAN STATUS
      ------------------------------------------ */}

      {status === "loading" ? (
        <section className="hist-card hist-scan-status">
          <h3>Scan in progress…</h3>
          <p>
            Documents read:{" "}
            <strong>{progress.documentsRead}</strong> ·
            Pages processed:{" "}
            <strong>{progress.pagesProcessed}</strong> ·
            Page size: {PAGE_SIZE}
          </p>
        </section>
      ) : null}

      {status === "error" && result && !result.ok ? (
        <section
          className="hist-card hist-scan-status hist-failed"
          role="alert"
        >
          <h3>Scan did not complete</h3>
          <p>{result.error.message}</p>
          {scanMeta ? (
            <p className="hist-note">
              Read {scanMeta.documentsRead} documents
              across {scanMeta.pagesProcessed} pages
              before the failure. Partial counts are NOT
              shown as a historical report.
            </p>
          ) : null}
        </section>
      ) : null}

      {status === "done" && scanMeta ? (
        <section className="hist-card hist-scan-status">
          <h3>Scan summary</h3>
          <ul className="hist-scan-facts">
            <li>
              Date range:{" "}
              <strong>
                {scanMeta.startDate} → {scanMeta.endDate}
              </strong>
            </li>
            <li>
              Completed at:{" "}
              {formatScanTime(scanMeta.completedAtMs)} (
              {scanMeta.durationMs} ms)
            </li>
            <li>
              Documents read:{" "}
              <strong>{scanMeta.documentsRead}</strong>{" "}
              across {scanMeta.pagesProcessed} pages
            </li>
            <li>
              Candidate accounting:{" "}
              {report.candidates.processed} processed ·{" "}
              {report.candidates.validDateIncluded} valid
              in-range ·{" "}
              {report.candidates.invalidDateExcluded}{" "}
              invalid-date excluded
            </li>
            <li>
              Fleet registry: {scanMeta.fleetStatus}
              {scanMeta.notes?.fleet
                ? ` — ${scanMeta.notes.fleet}`
                : ""}
            </li>
          </ul>
          <p className="hist-note">
            {scanMeta.notes.scope}
          </p>
          <p className="hist-note">
            {scanMeta.notes.snapshotConsistency}
          </p>
        </section>
      ) : null}

      {/* ------------------------------------------
          REPORT
      ------------------------------------------ */}

      {report ? (
        <>
          {report.occupancy.eligibleRecords === 0 ? (
            <div className="hist-banner hist-banner-warn" role="status">
              No occupancy-eligible departed records exist
              in this range. Occupancy metrics are
              unavailable rather than zero.{" "}
              {report.occupancy.zeroDenominatorNote ?? ""}
            </div>
          ) : null}

          {/* DATA-QUALITY BANNER (always visible) */}

          <div className="hist-banner" role="status">
            <strong>Data quality:</strong>{" "}
            {report.occupancy.eligibleRecords} of{" "}
            {report.occupancy.departedTotal} departed
            records are occupancy-eligible ·{" "}
            {report.departedCoverage.possibleLegacyDepartures}{" "}
            possible legacy departures ·{" "}
            {report.departedCoverage.invariantViolationsTotal}{" "}
            occupancy-invariant violations. Occupancy is
            dispatcher-recorded estimated data derived
            from reported vacancies at departure. It is
            not independently verified passenger data.
          </div>

          {/* 1. KPI CARDS */}

          <section className="hist-card">
            <h3>Trip activity overview</h3>
            <div className="hist-kpis">
              <KpiCard
                label="Total trips (valid in-range dates)"
                value={report.candidates.validDateIncluded}
              />
              <KpiCard
                label="Distinct active dates"
                value={Object.keys(
                  report.activity.dailyCounts
                ).length}
              />
              <KpiCard
                label="Departed trips"
                value={report.occupancy.departedTotal}
              />
              <KpiCard
                label="Occupancy-eligible departed"
                value={
                  report.occupancy.eligibleRecords
                }
              />
              <KpiCard
                label="Possible legacy departures"
                value={
                  report.departedCoverage
                    .possibleLegacyDepartures
                }
                note="Missing departureConfirmedAt — review indicator only"
              />
              <KpiCard
                label="Invariant violations"
                value={
                  report.departedCoverage
                    .invariantViolationsTotal
                }
              />
              <KpiCard
                label="Vehicles in trip records"
                value={Object.keys(
                  report.vehicles.tripCounts
                ).length}
              />
            </div>
          </section>

          {/* 2. DAILY AND WEEKLY ACTIVITY */}

          <section className="hist-card">
            <h3>Daily trip counts</h3>
            {dailyData.length === 0 ? (
              <p className="hist-empty">
                No trips found for the selected range.
              </p>
            ) : (
              <div className="hist-chart">
                <ResponsiveContainer>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="trips"
                      name="Trips"
                      fill="var(--navy-700)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="hist-card">
            <h3>Weekly trip counts (Monday-start weeks)</h3>
            {weeklyData.length === 0 ? (
              <p className="hist-empty">
                No weekly activity for the selected range.
              </p>
            ) : (
              <div className="hist-chart">
                <ResponsiveContainer>
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="trips"
                      name="Trips"
                      fill="var(--navy-700)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* 3. STATUS DISTRIBUTION */}

          <section className="hist-card">
            <h3>Current recorded status of trips scheduled within the selected date range.</h3>
            <p className="hist-note">
              These are the current status values stored on
              trip documents — snapshots, not reconstructed
              status history.
            </p>
            <div className="hist-chart">
              <ResponsiveContainer>
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="trips" name="Trips">
                    {statusData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={
                          STATUS_COLORS[entry.name] ??
                          "var(--navy-700)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 4. ROUTE ANALYTICS */}

          <section className="hist-card">
            <h3>Trips by destination</h3>
            {routeData.length === 0 ? (
              <p className="hist-empty">
                No route data for the selected range.
              </p>
            ) : (
              <>
                <div className="hist-chart">
                  <ResponsiveContainer>
                    <BarChart
                      data={routeData}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis allowDecimals={false} />
                      <YAxis
                        dataKey="route"
                        type="category"
                        width={140}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <Bar
                        dataKey="trips"
                        name="Trips"
                        fill="var(--navy-700)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <h4 className="hist-table-title">
                  Route activity by week
                </h4>
                <div className="hist-table-wrapper">
                  <table className="hist-table">
                    <thead>
                      <tr>
                        <th>Week of</th>
                        <th>Destination</th>
                        <th>Trips</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(
                        report.routes.byWeek
                      ).flatMap(([week, routes]) =>
                        Object.entries(routes).map(
                          ([route, trips]) => (
                            <tr key={`${week}-${route}`}>
                              <td>{week}</td>
                              <td>{route}</td>
                              <td>{trips}</td>
                            </tr>
                          )
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* 5. DEPARTURE-TIME ANALYTICS */}

          <section className="hist-card">
            <h3>Scheduled departures by hour (Asia/Manila)</h3>
            <p className="hist-note">
              Hours reflect the scheduled departureAt
              value, not the physically observed dispatch
              time.{" "}
              {report.activity.hourExcludedNoValidDepartureAt >
              0
                ? `${report.activity.hourExcludedNoValidDepartureAt} records excluded from hour charts (no valid departureAt).`
                : ""}
            </p>
            {hourData.length === 0 ? (
              <p className="hist-empty">
                No scheduled departure hours in this range.
              </p>
            ) : (
              <div className="hist-chart">
                <ResponsiveContainer>
                  <BarChart data={hourData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="trips"
                      name="Trips"
                      fill="var(--navy-700)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="hist-card">
            <h3>Scheduled departures by weekday</h3>
            {weekdayData.length === 0 ? (
              <p className="hist-empty">
                No weekday distribution in this range.
              </p>
            ) : (
              <div className="hist-chart">
                <ResponsiveContainer>
                  <BarChart data={weekdayData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="weekday"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="trips"
                      name="Trips"
                      fill="var(--navy-700)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* 6. FLEET UTILIZATION */}

          <section className="hist-card">
            <h3>Trips per vehicle (normalized plate)</h3>
            {scanMeta.fleetStatus !== "loaded" &&
            scanMeta.fleetStatus !== "provided" ? (
              <div
                className="hist-banner hist-banner-warn"
                role="status"
              >
                Fleet matching is unavailable or
                incomplete for this scan, so matched and
                unmatched labels below must not be treated
                as a complete fleet cross-check.
              </div>
            ) : null}
            {Object.keys(report.vehicles.tripCounts)
              .length === 0 ? (
              <p className="hist-empty">
                No vehicle plates appear in this range.
              </p>
            ) : (
              <>
                <p className="hist-fleet-match">
                  {fleetMatchText}
                </p>
                <div className="hist-table-wrapper">
                  <table className="hist-table">
                    <thead>
                      <tr>
                        <th>Vehicle plate</th>
                        <th>Trips in range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fleetRows.map((row) => (
                        <tr key={row.plate}>
                          <td>{row.plate}</td>
                          <td>{row.trips}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p className="hist-note">
              {report.vehicles.note} Trip-recorded
              capacity values are preserved throughout
              this dashboard; current fleet capacity is
              never substituted.
            </p>
          </section>

          {/* 7. OCCUPANCY ANALYTICS */}

          <section className="hist-card">
            <h3>Occupancy analytics</h3>
            <div className="hist-banner" role="status">
              {report.occupancy.basis}
            </div>
            <div className="hist-kpis">
              <KpiCard
                label="Average recorded passengers per trip"
                value={toCountText(
                  report.occupancy
                    .avgRecordedPassengersPerTrip === null
                    ? null
                    : report.occupancy.avgRecordedPassengersPerTrip.toFixed(
                        1
                      )
                )}
                note={`n = ${report.occupancy.eligibleRecords} eligible records`}
              />
              <KpiCard
                label="Average recorded capacity per trip"
                value={toCountText(
                  report.occupancy
                    .avgRecordedCapacityPerTrip === null
                    ? null
                    : report.occupancy.avgRecordedCapacityPerTrip.toFixed(
                        1
                      )
                )}
                note={`n = ${report.occupancy.eligibleRecords} eligible records`}
              />
              <KpiCard
                label="Weighted load factor"
                value={toPercentText(
                  report.occupancy.weightedLoadFactorPercent
                )}
                note={`Σ seats ${report.occupancy.seatsSum} / Σ capacity ${report.occupancy.capacitySum}`}
              />
            </div>
            {report.occupancy.eligibleRecords > 0 ? (
              <div className="hist-table-wrapper">
                <table className="hist-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Eligible records (n)</th>
                      <th>Recorded seats sum</th>
                      <th>Capacity sum</th>
                      <th>Weighted load factor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.occupancy.daily.map((day) => (
                      <tr key={day.date}>
                        <td>{day.date}</td>
                        <td>{day.eligibleRecords}</td>
                        <td>{day.seatsSum}</td>
                        <td>{day.capacitySum}</td>
                        <td>
                          {toPercentText(
                            day.weightedLoadFactorPercent
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="hist-banner hist-banner-warn" role="status">
              {report.departedCoverage.possibleLegacyDepartures}{" "}
              departed records lack departureConfirmedAt
              (possible legacy departures). Their recorded
              seat values are review indicators only — a
              seatsTaken of 0 on a legacy record is NOT
              proof of an empty van.{" "}
              {report.departedCoverage
                .invariantViolationsTotal >
              0
                ? `Separately, ${report.departedCoverage.invariantViolationsTotal} departed records violate the seats occupancy invariant (deltas: ${Object.entries(
                    report.departedCoverage
                      .invariantDeltaDistribution
                  )
                    .map(
                      ([delta, count]) =>
                        `${count} × ${delta}`
                    )
                    .join(", ")}).`
                : ""}
            </div>
          </section>

          {/* 8. PASSENGER DEMAND INTELLIGENCE */}

          <section className="hist-card">
            <h3>Passenger demand intelligence</h3>
            <div className="hist-banner" role="status">
              {demand.basis}
            </div>
            <div className="hist-kpis">
              <KpiCard
                label="Total passengers"
                value={demand.summary.totalPassengers}
                note="Occupancy-eligible departed trips"
              />
              <KpiCard
                label="Eligible departed trips"
                value={demand.summary.eligibleDepartedTrips}
                note={`${demand.summary.ineligibleDepartedExcluded} departed excluded (ineligible seat data)`}
              />
              <KpiCard
                label="Average passengers per trip"
                value={toCountText(
                  demand.summary.avgPassengersPerTrip === null
                    ? null
                    : demand.summary.avgPassengersPerTrip.toFixed(
                        1
                      )
                )}
                note={`n = ${demand.summary.eligibleDepartedTrips} eligible trips`}
              />
              <KpiCard
                label="Weighted fleet occupancy"
                value={toPercentText(
                  demand.summary.weightedOccupancyPercent
                )}
                note="Σ passengers / Σ capacity over eligible trips"
              />
              <KpiCard
                label="Busiest travel day"
                value={
                  demand.summary.busiestTravelDay
                    ? `${demand.summary.busiestTravelDay.date} (${demand.summary.busiestTravelDay.passengers})`
                    : "—"
                }
                note="By total passengers"
              />
              <KpiCard
                label="Busiest departure hour"
                value={
                  demand.summary.busiestDepartureHour
                    ? `${demand.summary.busiestDepartureHour.hour} (${demand.summary.busiestDepartureHour.passengers})`
                    : "—"
                }
                note="Scheduled departure, Asia/Manila"
              />
            </div>
            {demand.summary.zeroDenominatorNote ? (
              <p className="hist-note">
                {demand.summary.zeroDenominatorNote}
              </p>
            ) : null}

            <h4 className="hist-table-title">Daily passengers</h4>
            {demandDailyData.length === 0 ? (
              <p className="hist-empty">
                No passenger demand in the selected range.
              </p>
            ) : (
              <div className="hist-chart">
                <ResponsiveContainer>
                  <BarChart data={demandDailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="passengers"
                      name="Passengers"
                      fill="var(--navy-700)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <h4 className="hist-table-title">Weekly passengers (Monday-start weeks)</h4>
            {demand.weekly.length === 0 ? (
              <p className="hist-empty">
                No weekly passenger demand.
              </p>
            ) : (
              <div className="hist-table-wrapper">
                <table className="hist-table">
                  <thead>
                    <tr>
                      <th>Week start</th>
                      <th>Passengers</th>
                      <th>Eligible trips</th>
                      <th>Capacity sum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demand.weekly.map((week) => (
                      <tr key={week.weekStart}>
                        <td>{week.weekStart}</td>
                        <td>{week.passengers}</td>
                        <td>{week.eligibleTrips}</td>
                        <td>{week.capacitySum}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 className="hist-table-title">Monthly passengers</h4>
            {demand.monthly.length === 0 ? (
              <p className="hist-empty">
                No monthly passenger demand.
              </p>
            ) : (
              <div className="hist-table-wrapper">
                <table className="hist-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Passengers</th>
                      <th>Eligible trips</th>
                      <th>Capacity sum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demand.monthly.map((month) => (
                      <tr key={month.month}>
                        <td>{month.month}</td>
                        <td>{month.passengers}</td>
                        <td>{month.eligibleTrips}</td>
                        <td>{month.capacitySum}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 className="hist-table-title">Passengers by weekday</h4>
            <div className="hist-table-wrapper">
              <table className="hist-table">
                <thead>
                  <tr>
                    <th>Weekday</th>
                    <th>Passengers</th>
                    <th>Eligible trips</th>
                    <th>Capacity sum</th>
                  </tr>
                </thead>
                <tbody>
                  {demand.weekday.map((weekday) => (
                    <tr key={weekday.weekday}>
                      <td>{weekday.weekday}</td>
                      <td>{weekday.passengers}</td>
                      <td>{weekday.eligibleTrips}</td>
                      <td>{weekday.capacitySum}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 className="hist-table-title">Passengers by departure hour (Asia/Manila)</h4>
            <p className="hist-note">
              {demand.hourlyNote}
              {demand.hourlyExcludedNoValidDepartureAt > 0
                ? ` ${demand.hourlyExcludedNoValidDepartureAt} eligible trips lack a valid departureAt timestamp and are excluded from hourly totals.`
                : ""}
            </p>
            {demand.hourly.length === 0 ? (
              <p className="hist-empty">
                No hourly passenger demand.
              </p>
            ) : (
              <div className="hist-table-wrapper">
                <table className="hist-table">
                  <thead>
                    <tr>
                      <th>Hour</th>
                      <th>Passengers</th>
                      <th>Eligible trips</th>
                      <th>Capacity sum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demand.hourly.map((hour) => (
                      <tr key={hour.hour}>
                        <td>{hour.hour}</td>
                        <td>{hour.passengers}</td>
                        <td>{hour.eligibleTrips}</td>
                        <td>{hour.capacitySum}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 className="hist-table-title">Fleet passenger performance</h4>
            <p className="hist-note">
              {demand.fleetNote}
            </p>
            {demand.fleet.length === 0 ? (
              <p className="hist-empty">
                No fleet passenger performance in the
                selected range.
              </p>
            ) : (
              <div className="hist-table-wrapper">
                <table className="hist-table">
                  <thead>
                    <tr>
                      <th>Vehicle (normalized plate)</th>
                      <th>Passengers</th>
                      <th>Eligible trips</th>
                      <th>Capacity sum</th>
                      <th>Weighted occupancy</th>
                      <th>In current fleet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demand.fleet.map((vehicle) => (
                      <tr key={vehicle.vehicle}>
                        <td>{vehicle.vehicle}</td>
                        <td>{vehicle.passengers}</td>
                        <td>{vehicle.eligibleTrips}</td>
                        <td>{vehicle.capacitySum}</td>
                        <td>
                          {toPercentText(
                            vehicle.occupancyPercent
                          )}
                        </td>
                        <td>
                          {vehicle.matchedInCurrentFleet
                            ? "Yes"
                            : "No"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {status === "idle" && !selectionError ? (
        <section className="hist-card">
          <p className="hist-empty">
            Select a date range and apply it to load
            historical trips. Reports show aggregate
            statistics only — never individual trip
            documents, driver names, or phone numbers.
          </p>
        </section>
      ) : null}
    </div>
  );
};

export default HistoryDashboard;
