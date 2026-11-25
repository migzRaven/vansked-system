import {
  collection,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";

import {
  aggregateRecord,
  createAuditRecord,
  createAuditState,
  finalizeReport,
  normalizePlateNumber,
} from "./auditRules.js";

// --------------------------------------------------
// READ-ONLY_AUDIT SWEEP
// --------------------------------------------------

const PAGE_SIZE = 500;

// documentId() ordering is used deliberately: unlike a
// field orderBy, document-ID ordering covers EVERY
// document in the collection, including documents
// missing fields such as `date`. Detecting missing
// dates is a primary audit requirement, so a field
// orderBy would silently exclude exactly the records
// the audit must find.

const safeCountTrips = async (db) => {
  try {
    const snapshot = await getCountFromServer(
      query(collection(db, "trips"))
    );

    return snapshot.data().count;
  } catch (error) {
    // Count aggregation may be unavailable on some
    // plans; reconciliation is optional in this audit.
    console.warn(
      "VanSked audit: count aggregation unavailable.",
      error
    );

    return null;
  }
};

const loadFleetCapacityMap = async (db) => {
  const fleetMap = new Map();

  try {
    const snapshot = await getDocs(collection(db, "fleet"));

    snapshot.forEach((document) => {
      const data = document.data();

      const plateKey =
        typeof data.plateNumberNormalized === "string" &&
        data.plateNumberNormalized.trim()
          ? data.plateNumberNormalized.trim().toUpperCase()
          : normalizePlateNumber(data.plateNumber);

      if (!plateKey) {
        return;
      }

      const capacity = Number(data.capacity);

      fleetMap.set(
        plateKey,
        Number.isInteger(capacity) && capacity > 0
          ? capacity
          : null
      );
    });
  } catch (error) {
    console.warn(
      "VanSked audit: fleet cross-check unavailable.",
      error
    );
  }

  return fleetMap;
};

// Runs the full read-only audit. Requires an active
// staff session; Firestore rules authorize active
// staff reads (admin and dispatcher). The admin-only
// gate on the /audit page is a frontend restriction.
export const runDataQualityAudit = async ({
  db,
  onProgress,
}) => {
  const auditStartedAt = new Date();

  const state = createAuditState();

  const countBefore = await safeCountTrips(db);

  const fleet = await loadFleetCapacityMap(db);

  const fleetSize = fleet.size;

  let lastVisible = null;
  let pages = 0;
  let reachedEnd = false;

  while (!reachedEnd) {
    const pageQuery = lastVisible
      ? query(
          collection(db, "trips"),
          orderBy(documentId()),
          startAfter(lastVisible),
          limit(PAGE_SIZE)
        )
      : query(
          collection(db, "trips"),
          orderBy(documentId()),
          limit(PAGE_SIZE)
        );

    const snapshot = await getDocs(pageQuery);

    if (snapshot.empty) {
      break;
    }

    pages += 1;

    lastVisible = snapshot.docs[snapshot.docs.length - 1];

    snapshot.docs.forEach((document) => {
      const record = createAuditRecord(document.data());

      aggregateRecord(state, record, fleet);
    });

    if (typeof onProgress === "function") {
      onProgress({
        documentsRead: state.documentsRead,
        pages,
      });
    }

    if (snapshot.docs.length < PAGE_SIZE) {
      reachedEnd = true;
    }
  }

  const countAfter = await safeCountTrips(db);

  const auditCompletedAt = new Date();

  return finalizeReport(state, {
    auditStartedAt,
    auditCompletedAt,
    countBefore,
    countAfter,
    fleetSize,
  });
};
