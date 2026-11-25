import { describe, it } from "node:test";

import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateRecord,
  createAuditRecord,
  createAuditState,
  finalizeReport,
  getManilaParts,
  getManilaWeekday,
  getDestination,
  isValidCalendarDate,
} from "../src/utils/audit/auditRules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --------------------------------------------------
// FIXTURE HELPERS
// --------------------------------------------------

const ts = (isoWithOffset) => ({
  toMillis: () => Date.parse(isoWithOffset),
});

const baseDepartedTrip = () => ({
  date: "2026-02-11",
  time24: "09:30",
  departureAt: ts("2026-02-11T09:30:00+08:00"),
  departureTime: "9:30 AM",
  driver: "driver-one",
  plateNumber: "abc 123",
  phone: "09170000000",
  fare: "50",
  route: "St. Bernard to Tacloban",
  capacity: 14,
  seatsTaken: 12,
  vacantSeats: 2,
  status: "Departed",
  createdAt: ts("2026-02-11T09:00:00+08:00"),
});

// --------------------------------------------------
// RECORD-LEVEL CHECKS
// --------------------------------------------------

describe("createAuditRecord eligibility layers", () => {
  it("treats a fully valid departed trip as eligible everywhere", () => {
    const record = createAuditRecord(baseDepartedTrip());

    assert.equal(record.schemaConforming, true);
    assert.equal(record.occupancyEligible, true);
    assert.equal(record.timeSlotEligible, true);
    assert.equal(record.routeEligible, true);
    assert.equal(record.destination, "Tacloban");
    assert.equal(record.plateNormalized, "ABC123");
    assert.equal(record.invariantDelta, 0);
  });

  it("does not report missing optional fields as errors", () => {
    const data = baseDepartedTrip();
    delete data.time24;
    delete data.createdAt;

    const record = createAuditRecord(data);

    assert.equal(record.missingRequired, null);
    assert.equal(record.optionalInvalid, null);
    assert.equal(record.schemaConforming, true);
  });

  it("flags an optional field only when present and invalid", () => {
    const data = baseDepartedTrip();
    data.time24 = "9:30";

    const record = createAuditRecord(data);

    assert.deepEqual(record.optionalInvalid, ["time24"]);
    assert.equal(record.schemaConforming, false);
    assert.equal(record.time24, null);
  });

  it("keeps occupancy eligibility when only fare is invalid", () => {
    const data = baseDepartedTrip();
    data.fare = "fifty";

    const record = createAuditRecord(data);

    assert.ok(record.invalidRequired.includes("fare"));
    assert.equal(record.occupancyEligible, true);
    assert.equal(record.schemaConforming, false);
  });

  it("keeps occupancy eligibility when only phone is missing", () => {
    const data = baseDepartedTrip();
    delete data.phone;

    const record = createAuditRecord(data);

    assert.ok(
      record.missingRequired.includes("phone")
    );
    assert.equal(record.occupancyEligible, true);
  });

  it("blocks time-slot eligibility when departureAt is invalid", () => {
    const data = baseDepartedTrip();
    data.departureAt = "not-a-timestamp";

    const record = createAuditRecord(data);

    assert.ok(
      record.invalidRequired.includes("departureAt")
    );
    assert.equal(record.occupancyEligible, true);
    assert.equal(record.timeSlotEligible, false);
    assert.equal(record.time24Consistent, false);
  });

  it("rejects out-of-bounds seatsTaken", () => {
    const data = baseDepartedTrip();
    data.seatsTaken = 20;

    const record = createAuditRecord(data);

    assert.ok(
      record.invalidRequired.includes("seatsTaken")
    );
    assert.equal(record.occupancyEligible, false);
    assert.equal(record.timeSlotEligible, false);
  });

  it("reports an invariant violation with its delta", () => {
    const data = baseDepartedTrip();
    data.seatsTaken = 11;

    const record = createAuditRecord(data);

    assert.equal(record.invariantDelta, -1);
    assert.equal(record.occupancyEligible, false);
    assert.equal(record.schemaConforming, true);
  });

  it("marks a missing date document as not eligible", () => {
    const data = baseDepartedTrip();
    delete data.date;

    const record = createAuditRecord(data);

    assert.ok(record.missingRequired.includes("date"));
    assert.equal(record.dateValid, false);
    assert.equal(record.occupancyEligible, false);
    assert.equal(record.timeSlotEligible, false);
  });

  it("counts unknown extra keys as informational only", () => {
    const data = baseDepartedTrip();
    data.legacyField = "ignored";

    const record = createAuditRecord(data);

    assert.deepEqual(record.unknownKeys, ["legacyField"]);
    assert.equal(record.schemaConforming, false);
  });
});

// --------------------------------------------------
// MANILA TIME HELPERS
// --------------------------------------------------

describe("Asia/Manila helpers", () => {
  it("derives Manila local date and time from a UTC instant", () => {
    const parts = getManilaParts(
      Date.parse("2026-02-11T21:30:00-05:00")
    );

    assert.equal(parts.date, "2026-02-12");
    assert.equal(parts.time24, "10:30");
  });

  it("formats Manila midnight without a 24:00 artifact", () => {
    const parts = getManilaParts(
      Date.parse("2026-02-11T00:00:00+08:00")
    );

    assert.equal(parts.date, "2026-02-11");
    assert.equal(parts.time24, "00:00");
  });

  it("maps calendar dates to weekdays", () => {
    assert.equal(getManilaWeekday("2026-02-11"), "Wed");
    assert.equal(getManilaWeekday("2026-13-40"), null);
  });

  it("validates calendar dates strictly", () => {
    assert.equal(isValidCalendarDate("2026-02-11"), true);
    assert.equal(isValidCalendarDate("2026-02-30"), false);
    assert.equal(isValidCalendarDate("2026-2-30"), false);
  });

  it("extracts destinations consistently with Analytics", () => {
    assert.equal(
      getDestination("St. Bernard to Tacloban"),
      "Tacloban"
    );
    assert.equal(getDestination("Tacloban"), null);
    assert.equal(getDestination(""), null);
  });
});

// --------------------------------------------------
// AGGREGATION
// --------------------------------------------------

describe("aggregateRecord", () => {
  it("groups strong duplicates and separates incomplete keys", () => {
    const state = createAuditState();

    aggregateRecord(state, createAuditRecord(baseDepartedTrip()), new Map());
    aggregateRecord(state, createAuditRecord(baseDepartedTrip()), new Map());

    const plateless = { ...baseDepartedTrip() };
    delete plateless.plateNumber;
    delete plateless.time24;

    aggregateRecord(state, createAuditRecord(plateless), new Map());

    assert.equal(state.duplicatesStrong.size, 1);
    assert.equal(state.duplicatesStrong.get("2026-02-11|09:30|ABC123"), 2);
    assert.equal(
      state.duplicatesStrongExcluded.time24MissingOrEmpty,
      1
    );
    assert.equal(state.duplicatesPossible.size, 0);
    assert.equal(
      state.duplicatesPossibleExcluded.time24MissingOrEmpty,
      1
    );
  });

  it("groups plate-less possible duplicates by date, time24, and route", () => {
    const state = createAuditState();

    const make = () => {
      const data = baseDepartedTrip();
      delete data.plateNumber;
      return data;
    };

    aggregateRecord(state, createAuditRecord(make()), new Map());
    aggregateRecord(state, createAuditRecord(make()), new Map());

    assert.equal(state.duplicatesStrong.size, 0);
    assert.equal(state.duplicatesStrongExcluded.plateMissing, 2);
    assert.equal(state.duplicatesPossible.size, 1);
    assert.equal(
      state.duplicatesPossible.get("2026-02-11|09:30|Tacloban"),
      2
    );
  });

  it("detects date mismatches against departureAt in Manila", () => {
    const state = createAuditState();

    const data = baseDepartedTrip();
    delete data.time24;
    data.departureAt = ts("2026-02-11T21:30:00-05:00");

    aggregateRecord(state, createAuditRecord(data), new Map());

    assert.equal(state.dateMismatchCount, 1);
    assert.equal(state.dateCheckedCount, 1);
    assert.equal(state.time24AbsentExcluded, 1);
    assert.equal(state.time24ComparableCount, 0);
    assert.equal(state.distinctDates.has("2026-02-11"), true);
  });

  it("tracks occupancy indicators and fleet capacity mismatches", () => {
    const state = createAuditState();

    const fleet = new Map([["ABC123", 12]]);

    aggregateRecord(
      state,
      createAuditRecord(baseDepartedTrip()),
      fleet
    );

    assert.equal(state.rawDeparted, 1);
    assert.equal(state.occupancyEligible, 1);
    assert.equal(state.fleetCapacityMismatchTotal, 1);
    assert.equal(state.fleetCapacityPairs["trip 14 | fleet 12"], 1);
  });

  it("scans documents with no valid date without crashing", () => {
    const state = createAuditState();

    const data = baseDepartedTrip();
    delete data.date;

    aggregateRecord(state, createAuditRecord(data), new Map());

    assert.equal(state.documentsRead, 1);
    assert.equal(state.distinctDates.size, 0);
    assert.equal(state.dateRange.earliest, null);
    assert.equal(state.duplicatesStrongExcluded.invalidDate, 1);
  });
});

// --------------------------------------------------
// FINAL REPORT
// --------------------------------------------------

describe("finalizeReport", () => {
  const runScan = (records, meta = {}) => {
    const state = createAuditState();

    records.forEach((data) => {
      aggregateRecord(state, createAuditRecord(data), new Map());
    });

    return finalizeReport(state, {
      auditStartedAt: new Date("2026-02-11T21:00:00+08:00"),
      auditCompletedAt: new Date("2026-02-11T21:05:00+08:00"),
      countBefore: null,
      countAfter: null,
      fleetSize: 0,
      ...meta,
    });
  };

  it("defers the forecast decision while reporting measured evidence", () => {
    const report = runScan([{ ...baseDepartedTrip(), status: "Waiting" }]);

    assert.match(
      report.forecastReadiness.decision,
      /^deferred/
    );

    assert.equal(
      report.forecastReadiness.decisionNote.includes(
        "No automatic forecast verdict"
      ),
      true
    );

    assert.equal(
      report.forecastReadiness.measuredEvidence
        .occupancyEligibleDepartedRecords,
      0
    );
  });

  it("reports measurable span and per-weekday evidence without thresholds", () => {
    const records = [];

    for (let day = 1; day <= 21; day += 1) {
      const date = `2026-02-${String(day).padStart(2, "0")}`;

      records.push({
        ...baseDepartedTrip(),
        date,
        time24: "09:30",
        plateNumber: `VAN${String(day).padStart(2, "0")}`,
        departureAt: ts(`2026-02-${String(day).padStart(2, "0")}T09:30:00+08:00`),
      });
    }

    const report = runScan(records);

    const evidence =
      report.forecastReadiness.measuredEvidence;

    assert.equal(
      evidence.totalTripDateSpanDays,
      20
    );

    assert.equal(
      evidence.departedTripDateSpanDays,
      20
    );

    assert.equal(
      evidence.distinctDatesWithOccupancyEligibleDepartures,
      21
    );

    assert.equal(
      evidence.occupancyEligibleDepartedRecords,
      21
    );

    Object.values(evidence.recordsPerWeekday).forEach(
      (count) => {
        assert.equal(typeof count, "number");
        assert.ok(count >= 2);
      }
    );

    assert.equal(
      evidence.schemaConformingRate,
      "100.00%"
    );
    assert.equal(
      evidence.strongDuplicateCandidateGroups,
      0
    );
  });

  it("reports invariant violations and duplicate rates as measurements only", () => {
    const records = [];

    for (let day = 1; day <= 21; day += 1) {
      const date = `2026-02-${String(day).padStart(2, "0")}`;

      records.push({
        ...baseDepartedTrip(),
        date,
        plateNumber: `VAN${String(day).padStart(2, "0")}`,
        departureAt: ts(`2026-02-${String(day).padStart(2, "0")}T09:30:00+08:00`),
        seatsTaken: day === 1 ? 11 : 12,
      });
    }

    const report = runScan(records);

    const evidence =
      report.forecastReadiness.measuredEvidence;

    assert.equal(
      evidence.occupancyEligibleDepartedRecords,
      20
    );
    assert.equal(
      evidence.departedInvariantViolations,
      1
    );

    assert.ok(
      report.seatValidity.departedInvariantViolations === 1
    );
  });

  it("reports churn detection and scan-window limitations", () => {
    const report = runScan([baseDepartedTrip()], {
      countBefore: 2,
      countAfter: 3,
    });

    assert.equal(report.scanWindow.churnDetected, true);
    assert.ok(report.scanWindow.limitation.length > 50);
  });

  it("never emits document IDs, plates, driver names, or phone values", () => {
    const report = runScan([baseDepartedTrip()]);

    const serialized = JSON.stringify(report);

    const sentinels = [
      "ABC123",
      "abc 123",
      "driver-one",
      "09170000000",
      "9:30 AM",
    ];

    sentinels.forEach((sentinel) => {
      assert.equal(
        serialized.includes(sentinel),
        false,
        `Report leaked private value: ${sentinel}`
      );
    });
  });
});

// --------------------------------------------------
// PHASE 1.1 — DATE SPANS, DENOMINATORS, PROVENANCE
// --------------------------------------------------

describe("date coverage spans", () => {
  it("separates total trip span from departed trip span", () => {
    const records = [
      {
        ...baseDepartedTrip(),
        status: "Waiting",
        date: "2026-02-11",
        departureAt: ts("2026-02-11T09:30:00+08:00"),
      },
      {
        ...baseDepartedTrip(),
        date: "2026-02-15",
        plateNumber: "VANA1",
        departureAt: ts("2026-02-15T09:30:00+08:00"),
      },
      {
        ...baseDepartedTrip(),
        date: "2026-02-18",
        plateNumber: "VANA2",
        departureAt: ts("2026-02-18T09:30:00+08:00"),
      },
    ];

    const state = createAuditState();

    records.forEach((data) => {
      aggregateRecord(
        state,
        createAuditRecord(data),
        new Map()
      );
    });

    const finalized = finalizeReport(state, {
      auditStartedAt: new Date(),
      auditCompletedAt: new Date(),
      countBefore: null,
      countAfter: null,
      fleetSize: 0,
    });

    const coverage = finalized.historicalCoverage;

    assert.equal(coverage.earliestAllTrips, "2026-02-11");
    assert.equal(coverage.latestAllTrips, "2026-02-18");
    assert.equal(coverage.totalTripDateSpanDays, 7);

    assert.equal(
      coverage.earliestDepartedTrips,
      "2026-02-15"
    );
    assert.equal(
      coverage.latestDepartedTrips,
      "2026-02-18"
    );
    assert.equal(
      coverage.departedTripDateSpanDays,
      3
    );

    assert.equal(
      coverage.distinctDatesWithOccupancyEligibleDepartures,
      2
    );
  });
});

describe("time-consistency denominators", () => {
  it("tracks checked, consistent, mismatched, and excluded counts", () => {
    const state = createAuditState();

    const consistentDoc = baseDepartedTrip();

    const dateMismatchedDoc = {
      ...baseDepartedTrip(),
      plateNumber: "VANB1",
      time24: "10:30",
      departureAt: ts("2026-02-11T21:30:00-05:00"),
    };

    const time24AbsentDoc = {
      ...baseDepartedTrip(),
      plateNumber: "VANB2",
      departureAt: ts("2026-02-11T09:30:00+08:00"),
    };
    delete time24AbsentDoc.time24;

    const noDepartureAtDoc = {
      ...baseDepartedTrip(),
      plateNumber: "VANB3",
      departureAt: "not-a-timestamp",
    };

    [
      consistentDoc,
      dateMismatchedDoc,
      time24AbsentDoc,
      noDepartureAtDoc,
    ].forEach((data) => {
      aggregateRecord(
        state,
        createAuditRecord(data),
        new Map()
      );
    });

    assert.equal(state.dateCheckedCount, 3);
    assert.equal(state.dateConsistentCount, 2);
    assert.equal(state.dateMismatchCount, 1);
    assert.equal(
      state.dateInvalidExcludedFromConsistency,
      0
    );
    assert.equal(
      state.dateNoValidDepartureAtExcluded,
      1
    );

    assert.equal(state.time24ComparableCount, 2);
    assert.equal(state.time24ConsistentCount, 2);
    assert.equal(state.time24MismatchCount, 0);
    assert.equal(state.time24AbsentExcluded, 1);

    assert.equal(
      state.missingRequiredCounts.time24,
      undefined
    );
    assert.equal(
      state.optionalInvalidCounts.time24,
      undefined
    );
  });
});

describe("departure provenance indicators", () => {
  it("groups departed documents by departureConfirmedAt state", () => {
    const state = createAuditState();

    const legacyDoc = baseDepartedTrip();
    delete legacyDoc.departureConfirmedAt;
    delete legacyDoc.time24;
    legacyDoc.plateNumber = "VANC1";

    const modernViolatingDoc = {
      ...baseDepartedTrip(),
      plateNumber: "VANC2",
      departureConfirmedAt: ts(
        "2026-02-11T09:35:00+08:00"
      ),
      seatsTaken: 11,
    };

    const modernValidDoc = {
      ...baseDepartedTrip(),
      plateNumber: "VANC3",
      departureConfirmedAt: ts(
        "2026-02-11T09:35:00+08:00"
      ),
    };

    const weirdTimestampDoc = {
      ...baseDepartedTrip(),
      plateNumber: "VANC4",
      departureConfirmedAt: "not-a-timestamp",
    };

    [
      legacyDoc,
      modernViolatingDoc,
      modernValidDoc,
      weirdTimestampDoc,
    ].forEach((data) => {
      aggregateRecord(
        state,
        createAuditRecord(data),
        new Map()
      );
    });

    const provenance = state.departureProvenance;

    assert.equal(provenance.missing.documents, 1);
    assert.equal(
      provenance.missing.occupancyEligible,
      1
    );
    assert.equal(
      provenance.missing.invariantViolations,
      0
    );

    assert.equal(
      provenance.presentAndValid.documents,
      2
    );
    assert.equal(
      provenance.presentAndValid.occupancyEligible,
      1
    );
    assert.equal(
      provenance.presentAndValid.invariantViolations,
      1
    );

    assert.equal(
      provenance.presentButInvalid.documents,
      1
    );
    assert.equal(
      provenance.presentButInvalid.occupancyEligible,
      1
    );
    assert.equal(
      provenance.presentButInvalid.invariantViolations,
      0
    );
  });

  it("reports provenance labels without personal or raw data", () => {
    const state = createAuditState();

    aggregateRecord(
      state,
      createAuditRecord({
        ...baseDepartedTrip(),
        departureConfirmedAt: ts(
          "2026-02-11T09:35:00+08:00"
        ),
      }),
      new Map()
    );

    const report = finalizeReport(state, {
      auditStartedAt: new Date(),
      auditCompletedAt: new Date(),
      countBefore: null,
      countAfter: null,
      fleetSize: 0,
    });

    const serialized = JSON.stringify(
      report.departureProvenance
    );

    ["abc 123", "ABC123", "driver-one", "09170000000"]
      .forEach((sentinel) => {
        assert.equal(
          serialized.includes(sentinel),
          false
        );
      });

    assert.ok(
      report.departureProvenance.missing.label.includes(
        "possible legacy"
      )
    );
    assert.ok(
      report.departureProvenance.presentAndValid.label.includes(
        "newer departure workflow"
      )
    );
    assert.ok(
      report.departureProvenance.note.includes(
        "not absolute proof"
      )
    );
  });
});

// --------------------------------------------------
// READ-ONLY GUARANTEE
// --------------------------------------------------

describe("source read-only guarantee", () => {
  it("avoid Firestore write APIs and realtime listeners", () => {
    const sources = [
      path.join(__dirname, "..", "src", "utils", "audit", "auditRules.js"),
      path.join(__dirname, "..", "src", "utils", "audit", "runAudit.js"),
      path.join(__dirname, "..", "src", "components", "DataQualityAudit.jsx"),
    ];

    const forbidden =
      /(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction|onSnapshot|deleteField|arrayUnion|arrayRemove|increment)\s*\(/;

    sources.forEach((sourcePath) => {
      const contents = fs.readFileSync(sourcePath, "utf8");

      assert.match(
        contents,
        /\S/,
        `${sourcePath} should not be empty`
      );

      assert.doesNotMatch(
        contents,
        forbidden,
        `${sourcePath} must not contain write operations or listeners`
      );
    });
  });
});
