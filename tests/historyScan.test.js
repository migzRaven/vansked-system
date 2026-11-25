// Tests for the Phase 2B historical Firestore scanner.
//
// All Firestore behavior is dependency-injected mock
// code. No production Firestore is contacted, the real
// Firebase SDK is never imported, and no credentials are
// required. The module source is also statically scanned
// to prove it stays read-only.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAGE_SIZE,
  TRIPS_COLLECTION,
  FLEET_COLLECTION,
  runHistoricalAggregation,
  validateHistoryDateRange,
} from "../src/utils/analytics/historyScan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --------------------------------------------------
// MOCK FIRESTORE
// --------------------------------------------------

const ts = (iso) => ({ toMillis: () => Date.parse(iso) });

const departedDoc = (overrides = {}) => ({
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
  departureConfirmedAt: ts("2026-02-11T09:45:00+08:00"),
  ...overrides,
});

const snapshotFor = (fixtures) => {
  const docs = fixtures.map((data) => ({ data: () => data }));

  return {
    empty: docs.length === 0,
    docs,
    forEach: (callback) => docs.forEach(callback),
  };
};

let docSeq = 0;

const docSnapshot = (data) => {
  docSeq += 1;
  return { data: () => data, seq: docSeq };
};

// Wraps already-built document snapshots (when cursor
// identity matters) into a mock QuerySnapshot.
const snapPage = (docs) => ({
  empty: docs.length === 0,
  docs,
  forEach: (callback) => docs.forEach(callback),
});

const makeFirestore = ({
  tripPages = [],
  fleet = [],
  failFleet = null,
  failTripsOnPage = null,
} = {}) => {
  const calls = {
    reads: 0,
    collections: [],
    wheres: [],
    orders: [],
    limits: [],
    cursors: [],
  };

  let pageIndex = 0;

  const failTripsError = { code: "permission-denied" };

  const fsModule = {
    collection: (db, name) => {
      calls.collections.push(name);
      return { kind: "collection", name };
    },
    where: (field, op, value) => {
      calls.wheres.push({ field, op, value });
      return { kind: "where", field, op, value };
    },
    orderBy: (field) => {
      calls.orders.push(field);
      return { kind: "orderBy", field };
    },
    documentId: () => ({ kind: "documentId" }),
    limit: (n) => {
      calls.limits.push(n);
      return { kind: "limit", n };
    },
    startAfter: (cursor) => {
      calls.cursors.push(cursor);
      return { kind: "startAfter", cursor };
    },
    query: (base, ...constraints) => ({
      kind: "query",
      base,
      constraints,
    }),
    getDocs: async (q) => {
      calls.reads += 1;

      const target = q.kind === "query" ? q.base : q;

      if (target.name === FLEET_COLLECTION) {
        if (failFleet) {
          throw failFleet;
        }
        return snapshotFor(fleet);
      }

      if (
        failTripsOnPage !== null &&
        pageIndex === failTripsOnPage
      ) {
        throw failTripsError;
      }

      const page = tripPages[pageIndex];
      pageIndex += 1;

      return page ?? snapshotFor([]);
    },
  };

  return { fsModule, calls, pageTurned: () => pageIndex };
};

const FAKE_DB = { kind: "fake-db" };

const scan = (options) =>
  runHistoricalAggregation({
    db: FAKE_DB,
    ...options,
  });

// --------------------------------------------------
// DATE RANGE VALIDATION
// --------------------------------------------------

describe("date range validation", () => {
  it("accepts valid strict YYYY-MM-DD ranges, including equal bounds", () => {
    assert.deepEqual(
      validateHistoryDateRange("2026-01-01", "2026-12-31"),
      { valid: true, code: null, message: null }
    );
    assert.equal(
      validateHistoryDateRange("2026-02-11", "2026-02-11")
        .valid,
      true
    );
  });

  it("rejects malformed formats before any database read", async () => {
    const { fsModule, calls } = makeFirestore();

    const result = await scan({
      startDate: "2026/02/11",
      endDate: "2026-02-28",
      firestore: fsModule,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalidStartDate");
    assert.equal(result.scanMeta.documentsRead, 0);
    assert.equal(calls.reads, 0);
  });

  it("rejects impossible calendar dates before any read", async () => {
    const { fsModule, calls } = makeFirestore();

    const early = await scan({
      startDate: "2026-02-30",
      endDate: "2026-02-28",
      firestore: fsModule,
    });

    assert.equal(early.error.code, "invalidStartDate");
    assert.equal(calls.reads, 0);

    const late = await scan({
      startDate: "2026-01-01",
      endDate: "2026-13-01",
      firestore: fsModule,
    });

    assert.equal(late.error.code, "invalidEndDate");
    assert.equal(calls.reads, 0);
  });

  it("rejects reversed ranges before any read", async () => {
    const { fsModule, calls } = makeFirestore();

    const result = await scan({
      startDate: "2026-03-01",
      endDate: "2026-02-01",
      firestore: fsModule,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "reversedRange");
    assert.equal(calls.reads, 0);
  });

  it("rejects a missing database instance without reading", async () => {
    const { fsModule, calls } = makeFirestore();

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      firestore: fsModule,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "firestoreContract");
    assert.equal(calls.reads, 0);
  });
});

// --------------------------------------------------
// QUERY CONSTRUCTION
// --------------------------------------------------

describe("query construction", () => {
  it("builds the mandated range query on the trips collection", async () => {
    const { fsModule, calls } = makeFirestore();

    await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.ok(calls.collections.includes(TRIPS_COLLECTION));
    assert.deepEqual(calls.wheres, [
      { field: "date", op: ">=", value: "2026-02-01" },
      { field: "date", op: "<=", value: "2026-02-28" },
    ]);
    assert.equal(calls.limits[0], PAGE_SIZE);
  });

  it("orders by date then documentId", async () => {
    const { fsModule, calls } = makeFirestore();

    await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(calls.orders[0], "date");
    assert.equal(
      calls.orders.length,
      2,
      "documentId ordering goes through a second orderBy"
    );
    assert.equal(calls.orders[1].kind, "documentId");
  });

  it("omits the cursor on the first page and applies startAfter afterwards", async () => {
    const pageOne = Array.from({ length: 500 }, () =>
      docSnapshot(departedDoc())
    );
    const pageTwo = [
      docSnapshot(departedDoc({ date: "2026-02-12" })),
    ];

    const { fsModule, calls } = makeFirestore({
      tripPages: [snapPage(pageOne), snapPage(pageTwo)],
    });

    await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(calls.cursors.length, 1);
    assert.equal(calls.cursors[0], pageOne[499]);
  });
});

// --------------------------------------------------
// PAGINATION
// --------------------------------------------------

describe("pagination", () => {
  it("handles empty results without pages", async () => {
    const { fsModule, calls } = makeFirestore({ tripPages: [] });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(result.ok, true);
    assert.equal(result.scanMeta.documentsRead, 0);
    assert.equal(result.scanMeta.pagesProcessed, 0);
    assert.equal(result.report.occupancy.eligibleRecords, 0);
    assert.equal(
      result.report.occupancy.avgRecordedPassengersPerTrip,
      null
    );

    // One fleet read + one empty trips page.
    assert.equal(calls.reads, 2);
  });

  it("processes a single partial page", async () => {
    const { fsModule } = makeFirestore({
      tripPages: [
        snapshotFor([
          departedDoc(),
          departedDoc({ date: "2026-02-12" }),
          departedDoc({ date: "2026-02-13" }),
        ]),
      ],
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(result.ok, true);
    assert.equal(result.scanMeta.pagesProcessed, 1);
    assert.equal(result.scanMeta.documentsRead, 3);
  });

  it("continues after exactly full 500-document pages and stops at the partial page", async () => {
    const fullPage = () =>
      snapshotFor(
        Array.from({ length: 500 }, () => departedDoc())
      );

    const tailPage = snapshotFor([
      departedDoc({ date: "2026-02-15" }),
    ]);

    const { fsModule } = makeFirestore({
      tripPages: [fullPage(), fullPage(), tailPage],
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(result.ok, true);
    assert.equal(result.scanMeta.pagesProcessed, 3);
    assert.equal(result.scanMeta.documentsRead, 1001);
    assert.equal(result.report.candidates.processed, 1001);
    assert.equal(
      result.report.candidates.validDateIncluded,
      1001
    );
  });

  it("advances the cursor without duplication or skipped records", async () => {
    const pageOne = Array.from({ length: 500 }, (_, i) =>
      docSnapshot(
        departedDoc({ date: i < 250 ? "2026-02-11" : "2026-02-12" })
      )
    );
    const pageTwo = [
      docSnapshot(departedDoc({ date: "2026-02-13" })),
    ];

    const { fsModule } = makeFirestore({
      tripPages: [snapPage(pageOne), snapPage(pageTwo)],
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(result.scanMeta.documentsRead, 501);
    assert.deepEqual(result.report.activity.dailyCounts, {
      "2026-02-11": 250,
      "2026-02-12": 250,
      "2026-02-13": 1,
    });
  });

  it("emits progress after each page with cumulative counts", async () => {
    const progress = [];

    const { fsModule } = makeFirestore({
      tripPages: [
        snapshotFor(
          Array.from({ length: 500 }, () => departedDoc())
        ),
        snapPage([
          docSnapshot(departedDoc({ date: "2026-02-12" })),
        ]),
      ],
    });

    await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
      onProgress: (p) => progress.push({ ...p }),
    });

    assert.deepEqual(progress, [
      { documentsRead: 500, pagesProcessed: 1 },
      { documentsRead: 501, pagesProcessed: 2 },
    ]);
  });
});

// --------------------------------------------------
// AGGREGATION INTEGRATION AND SCOPE
// --------------------------------------------------

describe("aggregation integration", () => {
  it("feeds candidates to the Phase 2A engine with identical occupancy semantics", async () => {
    const { fsModule } = makeFirestore({
      tripPages: [
        snapshotFor([
          departedDoc({ seatsTaken: 12, vacantSeats: 2 }),
          departedDoc({
            date: "2026-02-12",
            seatsTaken: 8,
            vacantSeats: 6,
          }),
        ]),
      ],
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(result.report.occupancy.eligibleRecords, 2);
    assert.equal(
      result.report.occupancy.avgRecordedPassengersPerTrip,
      10
    );
    assert.equal(
      result.report.occupancy.avgRecordedCapacityPerTrip,
      14
    );
    assert.equal(
      Math.round(
        result.report.occupancy.weightedLoadFactorPercent * 100
      ) / 100,
      71.43
    );
  });

  it("excludes malformed date candidates through the aggregation engine", async () => {
    const { fsModule } = makeFirestore({
      tripPages: [
        snapshotFor([
          departedDoc(),
          departedDoc({ date: "2026-13-40" }),
        ]),
      ],
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(result.ok, true);
    assert.equal(result.scanMeta.documentsRead, 2);
    assert.equal(result.report.candidates.processed, 2);
    assert.equal(result.report.candidates.validDateIncluded, 1);
    assert.equal(
      result.report.candidates.invalidDateExcluded,
      1
    );
    assert.ok(result.scanMeta.notes.scope.length > 0);
  });

  it("records scan start and completion times", async () => {
    const { fsModule } = makeFirestore({
      tripPages: [snapshotFor([docSnapshot(departedDoc())])],
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(
      typeof result.scanMeta.startedAtMs,
      "number"
    );
    assert.equal(
      typeof result.scanMeta.completedAtMs,
      "number"
    );
    assert.ok(
      result.scanMeta.completedAtMs >=
        result.scanMeta.startedAtMs
    );
    assert.ok(result.scanMeta.durationMs >= 0);
    assert.ok(
      result.scanMeta.notes.snapshotConsistency.length > 0
    );
  });
});

// --------------------------------------------------
// FLEET CROSS-REFERENCE
// --------------------------------------------------

describe("fleet cross-reference", () => {
  it("loads the fleet once and tags matched and unmatched vehicles", async () => {
    const { fsModule, calls } = makeFirestore({
      tripPages: [
        snapshotFor([
          departedDoc({ plateNumber: "abc 123" }),
          departedDoc({ plateNumber: "xyz 999" }),
        ]),
      ],
      fleet: [
        { plateNumberNormalized: "ABC123", capacity: 15 },
        { plateNumber: "def 456", capacity: 15 },
      ],
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(result.scanMeta.fleetStatus, "loaded");
    assert.equal(
      calls.collections.filter((n) => n === FLEET_COLLECTION)
        .length,
      1
    );
    assert.equal(
      result.report.vehicles.vehiclesMatchedInCurrentFleet,
      1
    );
    assert.equal(
      result.report.vehicles.vehiclesUnmatchedInCurrentFleet,
      1
    );
    assert.equal(
      result.report.occupancy.capacitySum,
      28
    );
  });

  it("accepts a preloaded fleet set without reading the fleet collection", async () => {
    const { fsModule, calls } = makeFirestore({
      tripPages: [snapshotFor([departedDoc()])],
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
      fleet: new Set(["ABC123"]),
    });

    assert.equal(result.scanMeta.fleetStatus, "provided");
    assert.ok(!calls.collections.includes(FLEET_COLLECTION));
    assert.equal(
      result.report.vehicles.vehiclesMatchedInCurrentFleet,
      1
    );
  });

  it("reports fleet load failure as an explicit limitation", async () => {
    const { fsModule } = makeFirestore({
      tripPages: [snapshotFor([departedDoc()])],
      failFleet: { code: "permission-denied" },
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(result.ok, true);
    assert.equal(result.scanMeta.fleetStatus, "failed");
    assert.match(result.scanMeta.notes.fleet, /NOT/);
    assert.equal(
      result.report.vehicles.vehiclesMatchedInCurrentFleet,
      0
    );
  });
});

// --------------------------------------------------
// ERROR HANDLING
// --------------------------------------------------

describe("Firestore errors", () => {
  it("reports permission-denied reads without a report", async () => {
    const { fsModule, calls } = makeFirestore({
      failTripsOnPage: 0,
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "permissionDenied");
    assert.equal(result.report, undefined);
    assert.equal(calls.reads, 2);
  });

  it("discards partial data when a later page fails", async () => {
    const { fsModule, calls } = makeFirestore({
      tripPages: [
        snapshotFor(
          Array.from({ length: 500 }, () => departedDoc())
        ),
      ],
      failTripsOnPage: 1,
    });

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: fsModule,
    });

    assert.equal(result.ok, false);
    assert.equal(result.report, undefined);
    assert.equal(result.scanMeta.documentsRead, 500);
    assert.equal(result.scanMeta.pagesProcessed, 1);
    assert.equal(calls.reads, 3);
  });

  it("translates network errors into a clear message", async () => {
    const networkFailure = makeFirestore();

    networkFailure.fsModule.getDocs = async () => {
      throw { code: "unavailable" };
    };

    const result = await runHistoricalAggregation({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      db: FAKE_DB,
      firestore: networkFailure.fsModule,
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "network");
    assert.match(result.error.message, /reach Firestore/);
  });
});

// --------------------------------------------------
// READ-ONLY GUARANTEES
// --------------------------------------------------

describe("read-only guarantees", () => {
  it("contains no Firestore write APIs, listeners, or count queries in the module source", () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "src",
        "utils",
        "analytics",
        "historyScan.js"
      ),
      "utf8"
    );

    assert.ok(
      !/\b(setDoc|updateDoc|deleteDoc|addDoc|runTransaction|onSnapshot|serverTimestamp|getCountFromServer)\b/.test(
        source
      ),
      "historyScan.js must not contain write, listener, or count APIs"
    );
  });

  it("uses no static Firebase imports; the Firestore module is injected or dynamically loaded", () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "src",
        "utils",
        "analytics",
        "historyScan.js"
      ),
      "utf8"
    );

    assert.ok(
      !/from\s+["']firebase/.test(source),
      "historyScan.js must not statically import Firebase"
    );
  });
});
