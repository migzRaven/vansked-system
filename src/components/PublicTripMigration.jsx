
import { useState } from "react";

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../context/useAuth";

import "./PublicTripMigration.css";

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const MIGRATION_BATCH_SIZE = 5;

const VALID_STATUSES = [
  "Waiting",
  "Boarding",
  "Full",
  "Overdue",
  "Departed",
];

const REQUIRED_PRIVATE_FIELDS = [
  "capacity",
  "date",
  "departureAt",
  "departureTime",
  "driver",
  "fare",
  "phone",
  "plateNumber",
  "route",
  "seatsTaken",
  "status",
  "vacantSeats",
];

const ALLOWED_PRIVATE_FIELDS = [
  ...REQUIRED_PRIVATE_FIELDS,
  "time24",
  "createdAt",
  "updatedAt",
  "statusUpdatedAt",
  "departureConfirmedAt",
  "sourceTemplateId",
];

const PUBLIC_FIELDS = [
  "date",
  "departureAt",
  "departureTime",
  "route",
  "driver",
  "plateNumber",
  "phone",
  "fare",
  "capacity",
  "seatsTaken",
  "vacantSeats",
  "status",
  "updatedAt",
];

// --------------------------------------------------
// DATA TYPE HELPERS
// --------------------------------------------------

const isTimestamp = (value) => {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.toMillis === "function"
  );
};

const isValidFare = (value) => {
  return (
    typeof value === "string" &&
    /^[0-9]+([.][0-9]{1,2})?$/.test(value)
  );
};

// --------------------------------------------------
// PRIVATE TRIP VALIDATION
// --------------------------------------------------

const validatePrivateTrip = (trip) => {
  const errors = [];

  const missingFields = REQUIRED_PRIVATE_FIELDS.filter(
    (field) => !(field in trip)
  );

  if (missingFields.length > 0) {
    errors.push(
      `Missing fields: ${missingFields.join(", ")}`
    );
  }

  if (
    typeof trip.date !== "string" ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(trip.date)
  ) {
    errors.push("Invalid Manila departure date.");
  }

  if (!isTimestamp(trip.departureAt)) {
    errors.push("Invalid departure timestamp.");
  }

  if (typeof trip.departureTime !== "string") {
    errors.push("Invalid departure time.");
  }

  if (typeof trip.route !== "string") {
    errors.push("Invalid route.");
  }

  if (typeof trip.driver !== "string") {
    errors.push("Invalid driver.");
  }

  if (typeof trip.plateNumber !== "string") {
    errors.push("Invalid plate number.");
  }

  if (typeof trip.phone !== "string") {
    errors.push("Invalid phone number.");
  }

  if (!isValidFare(trip.fare)) {
    errors.push("Invalid fare format.");
  }

  if (
    !Number.isInteger(trip.capacity) ||
    trip.capacity < 1 ||
    trip.capacity > 100
  ) {
    errors.push("Invalid vehicle capacity.");
  }

  if (
    !Number.isInteger(trip.seatsTaken) ||
    trip.seatsTaken < 0 ||
    trip.seatsTaken > trip.capacity
  ) {
    errors.push("Invalid seatsTaken value.");
  }

  if (
    !Number.isInteger(trip.vacantSeats) ||
    trip.vacantSeats < 0 ||
    trip.vacantSeats > trip.capacity
  ) {
    errors.push("Invalid vacantSeats value.");
  }

  if (!VALID_STATUSES.includes(trip.status)) {
    errors.push("Invalid trip status.");
  }

  if (
    "time24" in trip &&
    (
      typeof trip.time24 !== "string" ||
      (
        trip.time24 !== "" &&
        !/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(
          trip.time24
        )
      )
    )
  ) {
    errors.push("Invalid 24-hour departure time.");
  }

  for (const field of [
    "createdAt",
    "updatedAt",
    "statusUpdatedAt",
    "departureConfirmedAt",
  ]) {
    if (
      field in trip &&
      !isTimestamp(trip[field])
    ) {
      if (field !== "updatedAt") {
        errors.push(`Invalid ${field} timestamp.`);
      }
    }
  }

  if (
    "sourceTemplateId" in trip &&
    typeof trip.sourceTemplateId !== "string"
  ) {
    errors.push("Invalid source template ID.");
  }

  return errors;
};

// --------------------------------------------------
// PRIVATE DOCUMENT FIELD VALIDATION
// --------------------------------------------------

const hasUnsupportedPrivateFields = (trip) => {
  return Object.keys(trip).filter(
    (field) => !ALLOWED_PRIVATE_FIELDS.includes(field)
  );
};

// --------------------------------------------------
// PUBLIC PROJECTION BUILDER
// --------------------------------------------------

const createPublicProjection = (trip, updatedAt) => {
  return {
    date: trip.date,
    departureAt: trip.departureAt,
    departureTime: trip.departureTime,
    route: trip.route,
    driver: trip.driver,
    plateNumber: trip.plateNumber,
    phone: trip.phone,
    fare: trip.fare,
    capacity: trip.capacity,
    seatsTaken: trip.seatsTaken,
    vacantSeats: trip.vacantSeats,
    status: trip.status,
    updatedAt,
  };
};

// --------------------------------------------------
// PUBLIC DOCUMENT COMPARISON
// --------------------------------------------------

const matchesPublicProjection = (trip, publicTrip) => {
  if (!publicTrip) {
    return false;
  }

  const expectedKeys = [...PUBLIC_FIELDS].sort();
  const actualKeys = Object.keys(publicTrip).sort();

  if (
    JSON.stringify(expectedKeys) !==
    JSON.stringify(actualKeys)
  ) {
    return false;
  }

  if (!isTimestamp(publicTrip.updatedAt)) {
    return false;
  }

  if (!isTimestamp(trip.updatedAt)) {
    return false;
  }

  const expected = createPublicProjection(
    trip,
    trip.updatedAt
  );

  return PUBLIC_FIELDS.every((field) => {
    if (
      field === "departureAt" ||
      field === "updatedAt"
    ) {
      return (
        expected[field].toMillis() ===
        publicTrip[field].toMillis()
      );
    }

    return expected[field] === publicTrip[field];
  });
};

// --------------------------------------------------
// MAIN MIGRATION COMPONENT
// --------------------------------------------------

const PublicTripMigration = () => {
  const { isAdmin } = useAuth();

  const [isScanning, setIsScanning] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  const [scanReport, setScanReport] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);

  // ------------------------------------------------
  // CHECK NETWORK
  // ------------------------------------------------

  const ensureOnline = () => {
    if (!navigator.onLine) {
      window.alert(
        "You are offline. Reconnect before migrating trips."
      );

      return false;
    }

    return true;
  };

  // ------------------------------------------------
  // SCAN EXISTING FIRESTORE RECORDS
  // ------------------------------------------------

  const handleScan = async () => {
    if (!isAdmin) {
      return;
    }

    if (!ensureOnline()) {
      return;
    }

    setIsScanning(true);
    setScanReport(null);
    setMigrationResult(null);

    try {
      const [
        privateSnapshot,
        publicSnapshot,
      ] = await Promise.all([
        getDocs(collection(db, "trips")),
        getDocs(collection(db, "public_trips")),
      ]);

      const publicDocuments = new Map();

      publicSnapshot.docs.forEach((document) => {
        publicDocuments.set(
          document.id,
          document.data()
        );
      });

      const alreadySynced = [];
      const pending = [];
      const conflicts = [];
      const invalid = [];

      privateSnapshot.docs.forEach((document) => {
        const trip = document.data();

        const id = document.id;

        const errors = validatePrivateTrip(trip);

        if (errors.length > 0) {
          invalid.push({
            id,
            reason: errors.join(" "),
          });

          return;
        }

        const existingPublic = publicDocuments.get(id);

        const needsUpdatedAtRepair =
          !isTimestamp(trip.updatedAt);

        // A missing or invalid updatedAt requires
        // changing the private document.
        // Only the exact approved private schema
        // is eligible for that repair.
        if (needsUpdatedAtRepair) {
          const unsupportedFields =
            hasUnsupportedPrivateFields(trip);

          if (unsupportedFields.length > 0) {
            invalid.push({
              id,
              reason:
                `Cannot repair updatedAt because the private document contains unsupported fields: ${unsupportedFields.join(", ")}`,
            });

            return;
          }
        }

        if (existingPublic) {
          if (
            !needsUpdatedAtRepair &&
            matchesPublicProjection(
              trip,
              existingPublic
            )
          ) {
            alreadySynced.push(id);
          } else {
            conflicts.push({
              id,
              reason:
                "A public document already exists but does not exactly match the private trip.",
            });
          }

          return;
        }

        pending.push({
          id,
          trip,
          needsUpdatedAtRepair,
        });
      });

      setScanReport({
        total: privateSnapshot.size,
        alreadySynced,
        pending,
        conflicts,
        invalid,
        scannedAt: new Date(),
      });
    } catch (error) {
      console.error("Trip migration scan failed:", error);

      window.alert(
        error.message || "Unable to scan Firestore trips."
      );
    } finally {
      setIsScanning(false);
    }
  };

  // ------------------------------------------------
  // MIGRATE MISSING PUBLIC TRIPS
  // ------------------------------------------------

  const handleMigration = async () => {
    if (
      !isAdmin ||
      !scanReport ||
      scanReport.pending.length === 0
    ) {
      return;
    }

    if (!ensureOnline()) {
      return;
    }

    const confirmed = window.confirm(
      `You are about to create ${scanReport.pending.length} public passenger record(s). Existing private trip records will be preserved. Continue?`
    );

    if (!confirmed) {
      return;
    }

    setIsMigrating(true);
    setMigrationResult(null);

    let migratedCount = 0;
    const failedRecords = [];

    const candidates = scanReport.pending;

    try {
      // Small batches are deliberate.
      // Each private/public pair requires
      // cross-document Firestore rule checks.
      for (
        let index = 0;
        index < candidates.length;
        index += MIGRATION_BATCH_SIZE
      ) {
        const chunk = candidates.slice(
          index,
          index + MIGRATION_BATCH_SIZE
        );

        const batch = writeBatch(db);

        chunk.forEach((candidate) => {
          const privateTripRef = doc(
            db,
            "trips",
            candidate.id
          );

          const publicTripRef = doc(
            db,
            "public_trips",
            candidate.id
          );

          let updatedAt = candidate.trip.updatedAt;

          if (candidate.needsUpdatedAtRepair) {
            updatedAt = serverTimestamp();

            // Update only the missing/invalid
            // internal synchronization timestamp.
            batch.update(
              privateTripRef,
              {
                updatedAt,
              }
            );
          }

          // Create the sanitized passenger record.
          batch.set(
            publicTripRef,
            createPublicProjection(
              candidate.trip,
              updatedAt
            )
          );
        });

        try {
          await batch.commit();

          migratedCount += chunk.length;
        } catch (error) {
          console.error(
            "Migration batch failed:",
            error
          );

          chunk.forEach((candidate) => {
            failedRecords.push({
              id: candidate.id,
              reason:
                error.message ||
                "Firestore rejected this migration batch.",
            });
          });
        }
      }

      setMigrationResult({
        migrated: migratedCount,
        failed: failedRecords,
        completedAt: new Date(),
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // ------------------------------------------------
  // ACCESS CONTROL
  // ------------------------------------------------

  if (!isAdmin) {
    return (
      <div className="public-migration-page">
        <h2>Administrator access required</h2>

        <p>
          Only an active administrator can run
          the public trip migration.
        </p>
      </div>
    );
  }

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------

  return (
    <div className="public-migration-page">
      <header className="public-migration-header">
        <h1>Public Trip Migration</h1>

        <p>
          Synchronize existing private trip records
          with the passenger information collection.
        </p>
      </header>

      <section className="public-migration-notice">
        <h3>Migration safety</h3>

        <ul>
          <li>
            Existing private trip records are preserved.
          </li>

          <li>
            Only passenger-facing fields are published.
          </li>

          <li>
            Existing conflicting public records are not overwritten.
          </li>

          <li>
            Invalid records are skipped and reported.
          </li>

          <li>
            Every migration batch must satisfy Firestore security rules.
          </li>
        </ul>
      </section>

      <section className="public-migration-actions">
        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning || isMigrating}
          className="public-migration-button"
        >
          {isScanning
            ? "Scanning..."
            : "1. Scan Existing Trips"}
        </button>

        <button
          type="button"
          onClick={handleMigration}
          disabled={
            isScanning ||
            isMigrating ||
            !scanReport ||
            scanReport.pending.length === 0
          }
          className="public-migration-button primary"
        >
          {isMigrating
            ? "Migrating..."
            : `2. Migrate ${
                scanReport?.pending.length ?? 0
              } Missing Public Records`}
        </button>
      </section>

      {scanReport && (
        <section className="public-migration-results">
          <h2>Scan Results</h2>

          <p className="public-migration-date">
            Scanned: {scanReport.scannedAt.toLocaleString()}
          </p>

          <div className="public-migration-stats">
            <div>
              <strong>{scanReport.total}</strong>
              <span>Private trips</span>
            </div>

            <div>
              <strong>{scanReport.alreadySynced.length}</strong>
              <span>Already synchronized</span>
            </div>

            <div>
              <strong>{scanReport.pending.length}</strong>
              <span>Ready to migrate</span>
            </div>

            <div>
              <strong>{scanReport.conflicts.length}</strong>
              <span>Conflicts</span>
            </div>

            <div>
              <strong>{scanReport.invalid.length}</strong>
              <span>Invalid records</span>
            </div>
          </div>

          {scanReport.conflicts.length > 0 && (
            <div className="public-migration-warning">
              <h3>Conflicting records</h3>

              {scanReport.conflicts.map((item) => (
                <p key={item.id}>
                  <strong>{item.id}</strong>: {item.reason}
                </p>
              ))}
            </div>
          )}

          {scanReport.invalid.length > 0 && (
            <div className="public-migration-warning">
              <h3>Invalid records</h3>

              {scanReport.invalid.map((item) => (
                <p key={item.id}>
                  <strong>{item.id}</strong>: {item.reason}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {migrationResult && (
        <section className="public-migration-results">
          <h2>Migration Results</h2>

          <div className="public-migration-stats">
            <div>
              <strong>{migrationResult.migrated}</strong>
              <span>Successfully migrated</span>
            </div>

            <div>
              <strong>{migrationResult.failed.length}</strong>
              <span>Failed records</span>
            </div>
          </div>

          <p>
            Completed: {migrationResult.completedAt.toLocaleString()}
          </p>

          {migrationResult.failed.length > 0 && (
            <div className="public-migration-warning">
              <h3>Failed migration batches</h3>

              {migrationResult.failed.map((item) => (
                <p key={item.id}>
                  <strong>{item.id}</strong>: {item.reason}
                </p>
              ))}
            </div>
          )}

          <p>
            Run another scan to verify the final
            synchronization status.
          </p>
        </section>
      )}
    </div>
  );
};

export default PublicTripMigration;