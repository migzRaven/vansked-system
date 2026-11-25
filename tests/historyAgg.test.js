// Tests for the Phase 2A historical-aggregation module.
//
// All records are synthetic. No Firestore access, no
// production data, no network. The module under test
// is also statically scanned to prove it stays free of
// Firebase imports and write operations.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateHistoryRecord,
  createHistoryState,
  finalizeHistory,
  getManilaMondayWeekKey,
  UNPARSED_ROUTE,
  UNMATCHED_VEHICLE,
} from "../src/utils/analytics/historyAgg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --------------------------------------------------
// FIXTURES
// --------------------------------------------------

const ts = (iso) => ({ toMillis: () => Date.parse(iso) });

// Fully schema-valid Departed trip with a valid
// departureConfirmedAt (newer departure workflow).
const baseDepartedTrip = (overrides = {}) => ({
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
  departureConfirmedAt: ts(
    "2026-02-11T09:45:00+08:00"
  ),
  ...overrides,
});

const ACTIVE_TRIP = baseDepartedTrip({
  status: "Boarding",
  seatsTaken: 0,
  vacantSeats: 14,
});

// --------------------------------------------------
// DATE VALIDATION AND SCOPE
// --------------------------------------------------

describe("strict date validation and scope", () => {
  it("excludes documents missing the date field as out of scope", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    const noDate = baseDepartedTrip();
    delete noDate.date;

    aggregateHistoryRecord(state, noDate, new Set());

    assert.equal(state.missingDateExcluded, 1);
    assert.equal(state.invalidDateExcluded, 0);
    assert.equal(state.validDateIncluded, 0);
    assert.equal(state.candidatesProcessed, 1);
  });

  it("excludes malformed and impossible calendar dates", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    const invalidDates = [
      "2026-02-30",
      "2026-13-01",
      "2026/02/11",
      "26-02-11",
    ];

    invalidDates.forEach((date) => {
      aggregateHistoryRecord(
        state,
        baseDepartedTrip({ date }),
        new Set()
      );
    });

    assert.equal(state.invalidDateExcluded, 4);
    assert.equal(state.validDateIncluded, 0);
    assert.equal(state.outOfRangeExcluded, 0);
  });

  it("includes documents dated exactly on the inclusive boundaries", () => {
    const state = createHistoryState({
      startDate: "2026-02-11",
      endDate: "2026-02-15",
    });

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({ date: "2026-02-11" }),
      new Set()
    );

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({
        date: "2026-02-15",
        time24: "10:30",
        departureAt: ts("2026-02-15T10:30:00+08:00"),
        departureTime: "10:30 AM",
      }),
      new Set()
    );

    assert.equal(state.validDateIncluded, 2);
    assert.equal(state.outOfRangeExcluded, 0);
  });

  it("excludes documents one day outside the inclusive range", () => {
    const state = createHistoryState({
      startDate: "2026-02-11",
      endDate: "2026-02-15",
    });

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({ date: "2026-02-10" }),
      new Set()
    );

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({ date: "2026-02-16" }),
      new Set()
    );

    assert.equal(state.outOfRangeExcluded, 2);
    assert.equal(state.validDateIncluded, 0);
  });

  it("keeps the candidate count identity for all exclusion buckets", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    aggregateHistoryRecord(
      state,
      baseDepartedTrip(),
      new Set()
    );

    const invalid = baseDepartedTrip({
      date: "2026-02-30",
    });
    aggregateHistoryRecord(state, invalid, new Set());

    const noDate = baseDepartedTrip();
    delete noDate.date;
    aggregateHistoryRecord(state, noDate, new Set());

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({ date: "2026-03-05" }),
      new Set()
    );

    assert.equal(state.candidatesProcessed, 4);
    assert.equal(
      state.candidatesProcessed,
      state.validDateIncluded +
        state.invalidDateExcluded +
        state.missingDateExcluded +
        state.outOfRangeExcluded
    );
  });
});

// --------------------------------------------------
// OCCUPANCY CALCULATIONS
// --------------------------------------------------

describe("occupancy calculations", () => {
  it("computes the three separated occupancy metrics from eligible records", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({
        seatsTaken: 12,
        vacantSeats: 2,
      }),
      new Set()
    );

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({
        date: "2026-02-12",
        time24: "13:30",
        departureAt: ts("2026-02-12T13:30:00+08:00"),
        departureTime: "1:30 PM",
        seatsTaken: 8,
        vacantSeats: 6,
      }),
      new Set()
    );

    const report = finalizeHistory(state);

    assert.equal(report.occupancy.eligibleRecords, 2);
    assert.equal(report.occupancy.seatsSum, 20);
    assert.equal(report.occupancy.capacitySum, 28);
    assert.equal(
      report.occupancy.avgRecordedPassengersPerTrip,
      10
    );
    assert.equal(
      report.occupancy.avgRecordedCapacityPerTrip,
      14
    );
    const expectedLoadFactor = (20 / 28) * 100;
    assert.ok(
      Math.abs(
        report.occupancy.weightedLoadFactorPercent -
          expectedLoadFactor
      ) < 1e-9
    );
    assert.equal(
      Math.round(
        report.occupancy.weightedLoadFactorPercent * 100
      ) / 100,
      71.43
    );
    assert.equal(report.occupancy.zeroDenominatorNote, null);
  });

  it("returns null (never zero) with an explanatory note for empty datasets", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    const report = finalizeHistory(state);

    assert.equal(report.occupancy.eligibleRecords, 0);
    assert.equal(
      report.occupancy.avgRecordedPassengersPerTrip,
      null
    );
    assert.equal(
      report.occupancy.avgRecordedCapacityPerTrip,
      null
    );
    assert.equal(
      report.occupancy.weightedLoadFactorPercent,
      null
    );
    assert.ok(
      typeof report.occupancy.zeroDenominatorNote ===
        "string" &&
        report.occupancy.zeroDenominatorNote.length > 0
    );
  });

  it("excludes legacy departed records with invariant violations from occupancy sums", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    // Pre-Nov-24 legacy pattern: departure write stored
    // only status and vacantSeats, leaving seatsTaken
    // at its creation value of 0.

    const legacy = baseDepartedTrip();
    delete legacy.departureConfirmedAt;
    legacy.seatsTaken = 0;
    legacy.vacantSeats = 1;

    aggregateHistoryRecord(state, legacy, new Set());

    const report = finalizeHistory(state);

    assert.equal(state.departedTotal, 1);
    assert.equal(
      state.departedCoverage.possibleLegacyDepartures,
      1
    );
    assert.equal(
      state.departedCoverage.legacyWithoutEligibility,
      1
    );
    assert.equal(
      state.departedCoverage.legacyWithEligibility,
      0
    );
    assert.equal(
      state.departedCoverage.invariantViolationsTotal,
      1
    );
    assert.deepEqual(
      state.departedCoverage
        .invariantDeltaDistribution,
      { "-13": 1 }
    );

    assert.equal(report.occupancy.eligibleRecords, 0);
    assert.equal(
      report.occupancy.avgRecordedPassengersPerTrip,
      null
    );
  });

  it("counts a legacy departure that meets eligibility in legacyWithEligibility and keeps it in averages", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    // Missing departureConfirmedAt, but the recorded
    // seats happen to satisfy the invariant. The
    // eligibility engine — not this module — decides.

    const legacyEligible = baseDepartedTrip();
    delete legacyEligible.departureConfirmedAt;
    legacyEligible.seatsTaken = 0;
    legacyEligible.vacantSeats = 14;

    aggregateHistoryRecord(
      state,
      legacyEligible,
      new Set()
    );

    const report = finalizeHistory(state);

    assert.equal(
      state.departedCoverage.legacyWithEligibility,
      1
    );
    assert.equal(
      state.departedOccupancyEligible,
      1
    );
    assert.equal(report.occupancy.eligibleRecords, 1);
    assert.equal(report.occupancy.seatsSum, 0);
    assert.equal(report.occupancy.capacitySum, 14);
    assert.equal(
      report.occupancy.avgRecordedPassengersPerTrip,
      0
    );
  });

  it("does not flag departed records with valid departureConfirmedAt as legacy", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    aggregateHistoryRecord(
      state,
      baseDepartedTrip(),
      new Set()
    );

    assert.equal(state.departedTotal, 1);
    assert.equal(
      state.departedCoverage.possibleLegacyDepartures,
      0
    );
    assert.equal(
      state.departedCoverage.departuresWithVacantOne,
      0
    );
  });

  it("counts departures with vacantSeats === 1 as a review indicator only", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({
        seatsTaken: 13,
        vacantSeats: 1,
      }),
      new Set()
    );

    const report = finalizeHistory(state);

    assert.equal(
      report.departedCoverage.departuresWithVacantOne,
      1
    );
    assert.equal(report.occupancy.eligibleRecords, 1);
    assert.equal(report.occupancy.seatsSum, 13);
    assert.deepEqual(
      report.departedCoverage
        .invariantDeltaDistribution,
      {}
    );
  });
});

// --------------------------------------------------
// TIME AND CALENDAR GROUPING
// --------------------------------------------------

describe("Manila calendar grouping", () => {
  it("derives Monday-start week keys across the Sunday-to-Monday transition", () => {
    // 2026-02-01 is a Sunday completing the week that
    // began Monday 2026-01-26.
    assert.equal(
      getManilaMondayWeekKey("2026-02-01"),
      "2026-01-26"
    );

    // 2026-02-02 is a Monday starting a NEW week;
    // it must not share the previous week key.
    assert.equal(
      getManilaMondayWeekKey("2026-02-02"),
      "2026-02-02"
    );
  });

  it("derives week keys across month and year boundaries", () => {
    // 2026-01-01 is a Thursday; its Monday-start week
    // begins in the previous year.
    assert.equal(
      getManilaMondayWeekKey("2026-01-01"),
      "2025-12-29"
    );
    // 2026-02-01 is a Sunday; its week begins in the
    // previous month.
    assert.equal(
      getManilaMondayWeekKey("2026-02-01"),
      "2026-01-26"
    );
  });

  it("returns null for invalid date strings", () => {
    assert.equal(getManilaMondayWeekKey("2026-02-30"), null);
    assert.equal(getManilaMondayWeekKey("2026/02/11"), null);
  });

  it("separates adjacent daily buckets and rolls weekly counts over on Monday", () => {
    const state = createHistoryState({
      startDate: "2026-01-25",
      endDate: "2026-02-28",
    });

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({ date: "2026-02-01" }),
      new Set()
    );

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({
        date: "2026-02-02",
        time24: "11:00",
        departureAt: ts("2026-02-02T11:00:00+08:00"),
        departureTime: "11:00 AM",
      }),
      new Set()
    );

    const report = finalizeHistory(state);

    assert.deepEqual(report.activity.dailyCounts, {
      "2026-02-01": 1,
      "2026-02-02": 1,
    });
    assert.deepEqual(report.activity.weeklyCounts, {
      "2026-01-26": 1,
      "2026-02-02": 1,
    });
    assert.equal(
      report.activity.weekdayCounts.Sun,
      1
    );
    assert.equal(report.activity.weekdayCounts.Mon, 1);
  });

  it("uses Asia/Manila hours for departure buckets near Manila midnight", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    // 00:15 Manila time is 16:15 UTC on the previous
    // calendar day; only the Manila interpretation is
    // acceptable for the hour bucket.

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({
        time24: "00:15",
        departureAt: ts("2026-02-11T00:15:00+08:00"),
        departureTime: "12:15 AM",
      }),
      new Set()
    );

    const report = finalizeHistory(state);

    assert.deepEqual(report.activity.hourCounts, {
      "00:00": 1,
    });
  });

  it("counts records without a valid departureAt as hour-excluded but keeps their daily occupancy", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({ departureAt: null }),
      new Set()
    );

    const report = finalizeHistory(state);

    assert.equal(
      report.activity.hourExcludedNoValidDepartureAt,
      1
    );
    assert.deepEqual(report.activity.hourCounts, {});
    assert.equal(report.occupancy.eligibleRecords, 1);
    assert.equal(report.occupancy.seatsSum, 12);
  });
});

// --------------------------------------------------
// ROUTES AND VEHICLES
// --------------------------------------------------

describe("route and vehicle grouping", () => {
  it("groups parsed destinations and keeps unparsed routes in an explicit bucket", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    aggregateHistoryRecord(
      state,
      baseDepartedTrip(),
      new Set()
    );

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({
        route: "Silago coastal run",
      }),
      new Set()
    );

    const report = finalizeHistory(state);

    assert.deepEqual(report.routes.counts, {
      [UNPARSED_ROUTE]: 1,
      Tacloban: 1,
    });
    assert.deepEqual(
      report.routes.byWeek["2026-02-09"],
      {
        [UNPARSED_ROUTE]: 1,
        Tacloban: 1,
      }
    );
  });

  it("normalizes plate numbers and separates fleet-matched from unmatched vehicles", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    const fleet = new Set(["ABC123"]);

    aggregateHistoryRecord(
      state,
      baseDepartedTrip(),
      fleet
    );

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({
        plateNumber: "xyz 999",
      }),
      fleet
    );

    const report = finalizeHistory(state);

    assert.equal(
      report.vehicles.tripCounts["ABC123"],
      1
    );
    assert.equal(
      report.vehicles.tripCounts["XYZ999"],
      1
    );
    assert.equal(
      report.vehicles.vehiclesMatchedInCurrentFleet,
      1
    );
    assert.equal(
      report.vehicles.vehiclesUnmatchedInCurrentFleet,
      1
    );
    assert.equal(
      report.vehicles.unmatchedVehicleBucket,
      UNMATCHED_VEHICLE
    );
  });

  it("preserves trip-recorded capacity values instead of current fleet capacity", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    const fleet = new Set(["ABC123", "DEF456"]);

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({ capacity: 14 }),
      fleet
    );

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({
        plateNumber: "def 456",
        capacity: 15,
        seatsTaken: 10,
        vacantSeats: 5,
      }),
      fleet
    );

    const report = finalizeHistory(state);

    assert.equal(report.occupancy.seatsSum, 22);
    assert.equal(report.occupancy.capacitySum, 29);
    assert.equal(
      report.occupancy.avgRecordedCapacityPerTrip,
      14.5
    );
  });

  it("tracks current recorded status counts, including invalid statuses", () => {
    const state = createHistoryState({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });

    aggregateHistoryRecord(
      state,
      baseDepartedTrip(),
      new Set()
    );

    aggregateHistoryRecord(
      state,
      ACTIVE_TRIP,
      new Set()
    );

    aggregateHistoryRecord(
      state,
      baseDepartedTrip({ status: "Cancelled" }),
      new Set()
    );

    const report = finalizeHistory(state);

    assert.equal(report.statusCounts.Departed, 1);
    assert.equal(report.statusCounts.Boarding, 1);
    assert.equal(report.statusCounts.invalidOrMissing, 1);
  });
});

// --------------------------------------------------
// NO FABRICATION AND NO FIREBASE
// --------------------------------------------------

describe("no fabrication, no Firebase, no production access", () => {
  it("reports no measurements for an empty dataset instead of inventing them", () => {
    const report = finalizeHistory(
      createHistoryState({
        startDate: "2026-02-01",
        endDate: "2026-02-28",
      })
    );

    assert.deepEqual(report.activity.dailyCounts, {});
    assert.deepEqual(report.activity.weeklyCounts, {});
    assert.deepEqual(report.routes.counts, {});
    assert.deepEqual(report.vehicles.tripCounts, {});
    assert.equal(report.occupancy.seatsSum, 0);
    assert.equal(report.occupancy.capacitySum, 0);
    assert.equal(
      report.departedCoverage.earliestDepartedDate,
      null
    );
    assert.equal(
      report.departedCoverage.latestDepartedDate,
      null
    );
    assert.equal(report.metadata.noRevenueCalculations, true);
    assert.equal(report.metadata.noForecasting, true);
  });

  it("contains no Firebase imports or Firestore write APIs in the module source", () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "src",
        "utils",
        "analytics",
        "historyAgg.js"
      ),
      "utf8"
    );

    assert.ok(
      !/import\s*\(?[\s\S]*?['"]firebase/.test(source),
      "historyAgg.js must not import Firebase"
    );
    assert.ok(
      !/\b(setDoc|updateDoc|deleteDoc|addDoc|runTransaction|onSnapshot|getFirestore|initializeApp)\b/.test(
        source
      ),
      "historyAgg.js must not contain Firestore write or connection APIs"
    );
  });
});
