// Read-only historical Firestore scan for the
// Historical Operational Analytics dashboard (Phase 2B).
//
// The scanner retrieves private trip documents inside a
// selected date range and feeds them to the Phase 2A
// aggregation engine, which reuses the audit engine's
// occupancy eligibility rules.
//
// Firestore module functions are injected: the caller
// passes the firebase/firestore module namespace object,
// so this module performs no static Firebase imports and
// unit tests can supply a fully mocked Firestore without
// touching production. If no Firestore module is injected,
// the real SDK is loaded via dynamic import at call time.
//
// SECURITY: read-only. No writes, no listeners, no
// service accounts. Reads run under the currently
// authenticated staff session and the existing Firestore
// rules. Raw documents, document IDs, driver names, and
// phone numbers are never logged, stored, or returned.

import {
  createHistoryState,
  aggregateHistoryRecord,
  finalizeHistory,
} from "./historyAgg.js";

import {
  isValidCalendarDate,
  normalizePlateNumber,
} from "../audit/auditRules.js";

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

export const PAGE_SIZE = 500;

export const TRIPS_COLLECTION = "trips";

export const FLEET_COLLECTION = "fleet";

// Scope of the range query: Firestore `date` range
// queries exclude documents that are missing the `date`
// field and only return documents whose `date` string
// falls in the selection. Documents with missing or
// invalid dates remain the responsibility of the full
// Data Quality Audit (documentId()-ordered sweep).
const SCOPE_NOTE =
  "Historical reads cover trip documents with a date " +
  "field inside the selected range only. Documents " +
  "missing the date field are outside this range " +
  "query's scope and are covered by the Data Quality " +
  "Audit.";

// A multi-page scan is a sequence of independent reads,
// not one transaction or snapshot. Concurrent creates,
// edits, or deletions may shift results between pages.
const SNAPSHOT_CONSISTENCY_NOTE =
  "The scan is not a single consistent database " +
  "snapshot: it is a sequence of paginated reads. " +
  "Concurrent changes during the scan may affect " +
  "which documents are read and the aggregate results.";

const FLEET_FAILED_NOTE =
  "Fleet records could not be loaded, so vehicle " +
  "matched/unmatched counts in this report are NOT " +
  "complete fleet matching and must not be presented " +
  "as such.";

const REQUIRED_FIRESTORE_FUNCTIONS = [
  "collection",
  "where",
  "orderBy",
  "documentId",
  "limit",
  "startAfter",
  "query",
  "getDocs",
];

// --------------------------------------------------
// DATE RANGE VALIDATION (fails before any read)
// --------------------------------------------------

export const validateHistoryDateRange = (
  startDate,
  endDate
) => {
  if (!isValidCalendarDate(startDate)) {
    return {
      valid: false,
      code: "invalidStartDate",
      message:
        "Start date must be a real calendar date in strict " +
        "YYYY-MM-DD format (Asia/Manila operational date).",
    };
  }

  if (!isValidCalendarDate(endDate)) {
    return {
      valid: false,
      code: "invalidEndDate",
      message:
        "End date must be a real calendar date in strict " +
        "YYYY-MM-DD format (Asia/Manila operational date).",
    };
  }

  if (startDate > endDate) {
    return {
      valid: false,
      code: "reversedRange",
      message:
        "Start date must not be later than end date.",
    };
  }

  return { valid: true, code: null, message: null };
};

// --------------------------------------------------
// INTERNAL HELPERS
// --------------------------------------------------

const describeFirestoreError = (error) => {
  const code =
    error && error.code === "permission-denied"
      ? "permissionDenied"
      : error &&
          (error.code === "unavailable" ||
            error.code === "network-request-failed")
        ? "network"
        : "readFailed";

  const message =
    code === "permissionDenied"
      ? "Firestore denied the historical read. The " +
        "session must be an authenticated active staff " +
        "member."
      : code === "network"
        ? "Historical scan could not reach Firestore. " +
          "Check the network connection and retry."
        : "Historical scan failed while reading from " +
          "Firestore.";

  return { code, message };
};

const buildTripsPageQuery = (
  firestore,
  db,
  startDate,
  endDate,
  lastVisible
) => {
  const base = [
    firestore.collection(db, TRIPS_COLLECTION),
    firestore.where("date", ">=", startDate),
    firestore.where("date", "<=", endDate),
    firestore.orderBy("date"),
    firestore.orderBy(firestore.documentId()),
  ];

  if (lastVisible) {
    base.push(firestore.startAfter(lastVisible));
  }

  base.push(firestore.limit(PAGE_SIZE));

  return firestore.query(...base);
};

// Loads the fleet collection ONCE per scan for the
// existing vehicle aggregation's matched/unmatched tags.
// Current fleet data is NEVER used as historical
// capacity; trip-recorded capacity values are preserved
// by the aggregation engine.
const loadFleetPlates = async (firestore, db) => {
  const plates = new Set();

  try {
    const snapshot = await firestore.getDocs(
      firestore.collection(db, FLEET_COLLECTION)
    );

    snapshot.forEach((document) => {
      const data = document.data();

      const plateKey =
        typeof data.plateNumberNormalized === "string" &&
        data.plateNumberNormalized.trim()
          ? data.plateNumberNormalized.trim().toUpperCase()
          : normalizePlateNumber(data.plateNumber);

      if (plateKey) {
        plates.add(plateKey);
      }
    });

    return {
      plates,
      status: "loaded",
      note: null,
    };
  } catch {
    return {
      plates,
      status: "failed",
      note: FLEET_FAILED_NOTE,
    };
  }
};

// --------------------------------------------------
// SCAN
// --------------------------------------------------

const resolveFirestore = async (firestore) => {
  if (firestore) {
    return firestore;
  }

  return import("firebase/firestore");
};

export const runHistoricalAggregation = async ({
  startDate,
  endDate,
  db,
  firestore: injectedFirestore,
  fleet: providedFleet,
  onProgress,
}) => {
  // Validation happens before ANY Firestore read.

  const validation = validateHistoryDateRange(
    startDate,
    endDate
  );

  if (!validation.valid) {
    return {
      ok: false,
      error: {
        code: validation.code,
        message: validation.message,
      },
      scanMeta: emptyScanMeta(startDate, endDate),
    };
  }

  let firestoreModule;

  try {
    firestoreModule = await resolveFirestore(
      injectedFirestore
    );
  } catch {
    return {
      ok: false,
      error: {
        code: "firestoreUnavailable",
        message:
          "The Firebase Firestore module could not be " +
          "loaded in this environment.",
      },
      scanMeta: emptyScanMeta(startDate, endDate),
    };
  }

  const missingFunction = REQUIRED_FIRESTORE_FUNCTIONS.find(
    (name) => typeof firestoreModule[name] !== "function"
  );

  if (!db || missingFunction) {
    return {
      ok: false,
      error: {
        code: "firestoreContract",
        message: !db
          ? "No Firestore database instance was provided."
          : "The provided Firestore module is missing the " +
            "required function: " +
            missingFunction +
            ".",
      },
      scanMeta: emptyScanMeta(startDate, endDate),
    };
  }

  const startedAtMs = Date.now();

  // Fleet is read once per scan. A failure is reported as
  // an explicit limitation instead of silently claiming
  // complete vehicle matching.

  let plates;
  let fleetStatus;
  let fleetNote;

  if (providedFleet instanceof Set) {
    plates = providedFleet;
    fleetStatus = "provided";
    fleetNote = null;
  } else {
    const loaded = await loadFleetPlates(
      firestoreModule,
      db
    );

    plates = loaded.plates;
    fleetStatus = loaded.status;
    fleetNote = loaded.note;
  }

  const state = createHistoryState({ startDate, endDate });

  let lastVisible = null;
  let reachedEnd = false;
  let pagesProcessed = 0;
  let documentsRead = 0;

  try {
    while (!reachedEnd) {
      const pageQuery = buildTripsPageQuery(
        firestoreModule,
        db,
        startDate,
        endDate,
        lastVisible
      );

      const snapshot =
        await firestoreModule.getDocs(pageQuery);

      if (snapshot.empty) {
        break;
      }

      pagesProcessed += 1;

      const pageDocs = snapshot.docs;

      pageDocs.forEach((document) => {
        documentsRead += 1;

        // Raw document data is passed to the aggregation
        // engine and immediately reduced to a
        // privacy-stripped audit record. Document IDs are
        // never read or stored.

        aggregateHistoryRecord(
          state,
          document.data(),
          plates
        );
      });

      lastVisible = pageDocs[pageDocs.length - 1];

      if (typeof onProgress === "function") {
        onProgress({
          documentsRead,
          pagesProcessed,
        });
      }

      if (pageDocs.length < PAGE_SIZE) {
        reachedEnd = true;
      }
    }
  } catch (error) {
    // Partial page data is DISCARDED on failure so that
    // an interrupted scan is never mistaken for a
    // complete historical dataset.

    const described = describeFirestoreError(error);

    return {
      ok: false,
      error: described,
      scanMeta: buildScanMeta({
        startDate,
        endDate,
        startedAtMs,
        documentsRead,
        pagesProcessed,
        fleetStatus,
        fleetNote,
      }),
    };
  }

  return {
    ok: true,
    report: finalizeHistory(state),
    scanMeta: buildScanMeta({
      startDate,
      endDate,
      startedAtMs,
      documentsRead,
      pagesProcessed,
      fleetStatus,
      fleetNote,
    }),
  };
};

// --------------------------------------------------
// SCAN METADATA
// --------------------------------------------------

const buildScanMeta = ({
  startDate,
  endDate,
  startedAtMs,
  documentsRead,
  pagesProcessed,
  fleetStatus,
  fleetNote,
}) => ({
  startDate,
  endDate,
  startedAtMs,
  completedAtMs: Date.now(),
  durationMs: Date.now() - startedAtMs,
  documentsRead,
  pagesProcessed,
  fleetStatus,
  notes: {
    scope: SCOPE_NOTE,
    snapshotConsistency: SNAPSHOT_CONSISTENCY_NOTE,
    ...(fleetNote ? { fleet: fleetNote } : {}),
  },
});

const emptyScanMeta = (startDate, endDate) => ({
  startDate: typeof startDate === "string" ? startDate : null,
  endDate: typeof endDate === "string" ? endDate : null,
  startedAtMs: null,
  completedAtMs: null,
  durationMs: 0,
  documentsRead: 0,
  pagesProcessed: 0,
  fleetStatus: "notLoaded",
  notes: {
    scope: SCOPE_NOTE,
    snapshotConsistency: SNAPSHOT_CONSISTENCY_NOTE,
  },
});
