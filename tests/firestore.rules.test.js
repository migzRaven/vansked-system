
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";

import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";

// =============================================
// CONFIGURATION
// =============================================

const PROJECT_ID = "vansked-system";
const FIRESTORE_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;

const ADMIN_UID = "rules-test-admin";
const DISPATCHER_UID = "rules-test-dispatcher";
const INACTIVE_UID = "rules-test-inactive";

const TEST_TIMESTAMP = Timestamp.fromDate(
  new Date("2026-11-22T00:00:00Z")
);

let testEnv;

// =============================================
// TEST DOCUMENT PATHS
// =============================================

const TEST_PATHS = [
  `staff/${ADMIN_UID}`,
  `staff/${DISPATCHER_UID}`,
  `staff/${INACTIVE_UID}`,

  "trips/rules-test-private-read",
  "trips/rules-test-dispatcher-update",
  "trips/rules-test-private-only-update",
  "trips/rules-test-departed",
  "trips/rules-test-delete",
  "trips/rules-test-private-only-delete",
  "trips/rules-test-invalid-create",
  "trips/rules-test-paired-create",
  "trips/rules-test-unpaired-create",

  "fleet/rules-test-vehicle",
  "fares/rules-test-fare",

  "schedule_groups/rules-test-group",

  "schedule_groups/rules-test-group/trips/rules-test-template",

  "trip_events/rules-test-created-event",
  "trip_events/rules-test-wrong-actor",
  "trip_events/rules-test-existing-event",

  "public_trips/rules-test-private-read",
  "public_trips/rules-test-dispatcher-update",
  "public_trips/rules-test-private-only-update",
  "public_trips/rules-test-departed",
  "public_trips/rules-test-delete",
  "public_trips/rules-test-private-only-delete",
  "public_trips/rules-test-public",
  "public_trips/rules-test-paired-create",
  "public_trips/rules-test-unpaired-create",
  "public_trips/unauthorized-test"
];

// =============================================
// SAMPLE PRIVATE TRIP
// =============================================

function createTrip(overrides = {}) {
  return {
    capacity: 14,
    date: "2026-11-24",
    departureAt: Timestamp.fromDate(
      new Date("2026-11-24T00:00:00Z")
    ),
    departureTime: "8:00 AM",
    driver: "Juan",
    fare: "120",
    phone: "",
    plateNumber: "123",
    route: "St. Bernard to Tacloban",
    seatsTaken: 0,
    status: "Waiting",
    vacantSeats: 14,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides
  };
}

// =============================================
// PUBLIC TRIP PROJECTION
// =============================================

function createPublicTrip(trip) {
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
    updatedAt: trip.updatedAt
  };
}

// =============================================
// SAMPLE FLEET DOCUMENT
// =============================================

const fleetFixture = {
  driver: "Juan",
  plateNumber: "123",
  vanType: ""
};

// =============================================
// SAMPLE SCHEDULE TEMPLATE
// =============================================

const scheduleTripFixture = {
  departureTime: "8:00 AM",
  destination: "Tacloban",
  driver: "Juan",
  fare: "750",
  phone: "",
  plateNumber: "123",
  route: "St. Bernard to Tacloban",
  time24: "08:00"
};

// =============================================
// READ DOCUMENT HELPER
// =============================================

function readDocument(db, path) {
  return getDoc(doc(db, path));
}

// =============================================
// SEED A MATCHING PRIVATE/PUBLIC PAIR
// =============================================

async function seedTripPair(db, tripId, tripData) {
  await setDoc(
    doc(db, "trips", tripId),
    tripData
  );

  await setDoc(
    doc(db, "public_trips", tripId),
    createPublicTrip(tripData)
  );
}

// =============================================
// TEST SETUP
// =============================================

async function setupTestData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // Remove only documents reserved for this test suite.
    await Promise.all(
      TEST_PATHS.map((path) => deleteDoc(doc(db, path)))
    );

    // STAFF ACCOUNTS

    await setDoc(doc(db, `staff/${ADMIN_UID}`), {
      active: true,
      role: "admin"
    });

    await setDoc(doc(db, `staff/${DISPATCHER_UID}`), {
      active: true,
      role: "dispatcher"
    });

    await setDoc(doc(db, `staff/${INACTIVE_UID}`), {
      active: false,
      role: "dispatcher"
    });

    // PRIVATE AND PUBLIC TRIP PAIRS

    await seedTripPair(
      db,
      "rules-test-private-read",
      createTrip()
    );

    await seedTripPair(
      db,
      "rules-test-dispatcher-update",
      createTrip()
    );

    await seedTripPair(
      db,
      "rules-test-private-only-update",
      createTrip()
    );

    await seedTripPair(
      db,
      "rules-test-departed",
      createTrip({
        status: "Departed"
      })
    );

    await seedTripPair(
      db,
      "rules-test-delete",
      createTrip()
    );

    await seedTripPair(
      db,
      "rules-test-private-only-delete",
      createTrip()
    );

    // FLEET

    await setDoc(
      doc(db, "fleet/rules-test-vehicle"),
      fleetFixture
    );

    // FARES

    await setDoc(
      doc(db, "fares/rules-test-fare"),
      {
        amount: "250"
      }
    );

    // SCHEDULE GROUP

    await setDoc(
      doc(db, "schedule_groups/rules-test-group"),
      {
        name: "Security Test Group",
        days: {
          Mon: true,
          Tue: true,
          Wed: true,
          Thu: true,
          Fri: true,
          Sat: true,
          Sun: false
        }
      }
    );

    // EXISTING AUDIT EVENT

    await setDoc(
      doc(db, "trip_events/rules-test-existing-event"),
      {
        action: "Status changed to Boarding",
        driver: "Juan",
        route: "St. Bernard to Tacloban",
        timestamp: TEST_TIMESTAMP,
        tripId: "rules-test-private-read"
      }
    );
  });
}

// =============================================
// TEST CLEANUP
// =============================================

async function cleanupTestData() {
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await Promise.all(
      TEST_PATHS.map((path) => deleteDoc(doc(db, path)))
    );
  });
}

// =============================================
// SECURITY TEST SUITE
// =============================================

test("VanSked Firestore Security Rules", async (t) => {
  const rules = readFileSync(
    new URL("../firestore.rules", import.meta.url),
    "utf8"
  );

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules
    }
  });

  try {
    await setupTestData();

    const adminDb = testEnv
      .authenticatedContext(ADMIN_UID)
      .firestore();

    const dispatcherDb = testEnv
      .authenticatedContext(DISPATCHER_UID)
      .firestore();

    const inactiveDb = testEnv
      .authenticatedContext(INACTIVE_UID)
      .firestore();

    const unauthenticatedDb = testEnv
      .unauthenticatedContext()
      .firestore();

    // -----------------------------------------
    // 1. PUBLIC PASSENGER ACCESS
    // -----------------------------------------

    await t.test(
      "Unauthenticated passengers can read public trips",
      async () => {
        const snapshot = await assertSucceeds(
          readDocument(
            unauthenticatedDb,
            "public_trips/rules-test-private-read"
          )
        );

        assert.equal(snapshot.exists(), true);
      }
    );

    await t.test(
      "Unauthenticated passengers cannot read private trips",
      async () => {
        await assertFails(
          readDocument(
            unauthenticatedDb,
            "trips/rules-test-private-read"
          )
        );
      }
    );

    await t.test(
      "Unauthenticated passengers cannot create public trips",
      async () => {
        await assertFails(
          setDoc(
            doc(
              unauthenticatedDb,
              "public_trips/unauthorized-test"
            ),
            {
              route: "Unauthorized route",
              status: "Waiting"
            }
          )
        );
      }
    );

    // -----------------------------------------
    // 2. ADMINISTRATOR ACCESS
    // -----------------------------------------

    await t.test(
      "Administrator can read private trips",
      async () => {
        await assertSucceeds(
          readDocument(
            adminDb,
            "trips/rules-test-private-read"
          )
        );
      }
    );

    await t.test(
      "Administrator can update fleet records",
      async () => {
        await assertSucceeds(
          updateDoc(
            doc(adminDb, "fleet/rules-test-vehicle"),
            {
              driver: "Updated Driver"
            }
          )
        );
      }
    );

    await t.test(
      "Administrator can update fare records",
      async () => {
        await assertSucceeds(
          updateDoc(
            doc(adminDb, "fares/rules-test-fare"),
            {
              amount: "300"
            }
          )
        );
      }
    );

    // -----------------------------------------
    // 3. DISPATCHER ACCESS
    // -----------------------------------------

    await t.test(
      "Dispatcher can read private trips",
      async () => {
        await assertSucceeds(
          readDocument(
            dispatcherDb,
            "trips/rules-test-private-read"
          )
        );
      }
    );

    await t.test(
      "Dispatcher can update private and public trips together",
      async () => {
        const batch = writeBatch(dispatcherDb);

        const tripRef = doc(
          dispatcherDb,
          "trips/rules-test-dispatcher-update"
        );

        const publicTripRef = doc(
          dispatcherDb,
          "public_trips/rules-test-dispatcher-update"
        );

        // Reuse the same server timestamp transform
        // so the two records receive the same updatedAt.
        const updatedAt = serverTimestamp();

        batch.update(tripRef, {
          status: "Boarding",
          vacantSeats: 0,
          statusUpdatedAt: updatedAt,
          updatedAt
        });

        batch.update(publicTripRef, {
          status: "Boarding",
          vacantSeats: 0,
          updatedAt
        });

        await assertSucceeds(batch.commit());
      }
    );

    await t.test(
      "Dispatcher cannot update a private trip without updating its public record",
      async () => {
        await assertFails(
          updateDoc(
            doc(
              dispatcherDb,
              "trips/rules-test-private-only-update"
            ),
            {
              status: "Boarding",
              vacantSeats: 0,
              updatedAt: serverTimestamp()
            }
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot publish mismatched passenger information",
      async () => {
        await assertFails(
          updateDoc(
            doc(
              dispatcherDb,
              "public_trips/rules-test-private-only-update"
            ),
            {
              status: "Boarding"
            }
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot create a public record without a private trip",
      async () => {
        const publicData = createPublicTrip(
          createTrip()
        );

        await assertFails(
          setDoc(
            doc(
              dispatcherDb,
              "public_trips/rules-test-unpaired-create"
            ),
            publicData
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot update fleet records",
      async () => {
        await assertFails(
          updateDoc(
            doc(dispatcherDb, "fleet/rules-test-vehicle"),
            {
              driver: "Unauthorized Driver"
            }
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot update fare records",
      async () => {
        await assertFails(
          updateDoc(
            doc(dispatcherDb, "fares/rules-test-fare"),
            {
              amount: "999"
            }
          )
        );
      }
    );

    // -----------------------------------------
    // 4. INACTIVE STAFF
    // -----------------------------------------

    await t.test(
      "Inactive staff cannot read private trips",
      async () => {
        await assertFails(
          readDocument(
            inactiveDb,
            "trips/rules-test-private-read"
          )
        );
      }
    );

    // -----------------------------------------
    // 5. STAFF ACCOUNT PROTECTION
    // -----------------------------------------

    await t.test(
      "Dispatcher cannot promote their own account to admin",
      async () => {
        await assertFails(
          updateDoc(
            doc(
              dispatcherDb,
              `staff/${DISPATCHER_UID}`
            ),
            {
              role: "admin"
            }
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot create another staff account",
      async () => {
        await assertFails(
          setDoc(
            doc(dispatcherDb, "staff/unauthorized-staff"),
            {
              active: true,
              role: "admin"
            }
          )
        );
      }
    );

    // -----------------------------------------
    // 6. SCHEDULE TEMPLATE SECURITY
    // -----------------------------------------

    await t.test(
      "Dispatcher can create nested schedule templates",
      async () => {
        await assertSucceeds(
          setDoc(
            doc(
              dispatcherDb,
              "schedule_groups/rules-test-group/trips/rules-test-template"
            ),
            scheduleTripFixture
          )
        );
      }
    );

    // -----------------------------------------
    // 7. TRIP VALIDATION
    // -----------------------------------------

    await t.test(
      "Invalid trip capacity type is rejected",
      async () => {
        await assertFails(
          setDoc(
            doc(
              dispatcherDb,
              "trips/rules-test-invalid-create"
            ),
            createTrip({
              capacity: "14"
            })
          )
        );
      }
    );

    await t.test(
      "Departed trips cannot be changed back to Waiting",
      async () => {
        const batch = writeBatch(dispatcherDb);

        const tripRef = doc(
          dispatcherDb,
          "trips/rules-test-departed"
        );

        const publicTripRef = doc(
          dispatcherDb,
          "public_trips/rules-test-departed"
        );

        const updatedAt = serverTimestamp();

        // Attempt to change both records together.
        // The status-transition rule must reject this.
        batch.update(tripRef, {
          status: "Waiting",
          updatedAt
        });

        batch.update(publicTripRef, {
          status: "Waiting",
          updatedAt
        });

        await assertFails(batch.commit());
      }
    );

    // -----------------------------------------
    // 8. ATOMIC CREATE AND DELETE
    // -----------------------------------------

    await t.test(
      "Dispatcher can create private and public trips together",
      async () => {
        const batch = writeBatch(dispatcherDb);

        const tripRef = doc(
          dispatcherDb,
          "trips/rules-test-paired-create"
        );

        const publicTripRef = doc(
          dispatcherDb,
          "public_trips/rules-test-paired-create"
        );

        const updatedAt = serverTimestamp();

        const tripData = createTrip({
          updatedAt,
          createdAt: updatedAt
        });

        batch.set(tripRef, tripData);

        batch.set(
          publicTripRef,
          createPublicTrip(tripData)
        );

        await assertSucceeds(batch.commit());
      }
    );

    await t.test(
      "Dispatcher cannot create a private trip without its public record",
      async () => {
        await assertFails(
          setDoc(
            doc(
              dispatcherDb,
              "trips/rules-test-unpaired-create"
            ),
            createTrip({
              updatedAt: serverTimestamp()
            })
          )
        );
      }
    );

    await t.test(
      "Dispatcher can delete private and public trips together",
      async () => {
        const batch = writeBatch(dispatcherDb);

        batch.delete(
          doc(
            dispatcherDb,
            "trips/rules-test-delete"
          )
        );

        batch.delete(
          doc(
            dispatcherDb,
            "public_trips/rules-test-delete"
          )
        );

        await assertSucceeds(batch.commit());
      }
    );

    await t.test(
      "Dispatcher cannot delete a private trip without deleting its public record",
      async () => {
        await assertFails(
          deleteDoc(
            doc(
              dispatcherDb,
              "trips/rules-test-private-only-delete"
            )
          )
        );
      }
    );

    // -----------------------------------------
    // 9. AUDIT LOG SECURITY
    // -----------------------------------------

    await t.test(
      "Dispatcher can create their own audit event",
      async () => {
        await assertSucceeds(
          setDoc(
            doc(
              dispatcherDb,
              "trip_events/rules-test-created-event"
            ),
            {
              tripId: "rules-test-private-read",
              route: "St. Bernard to Tacloban",
              driver: "Juan",
              action: "Status changed to Boarding",
              previousStatus: "Waiting",
              newStatus: "Boarding",
              actorUid: DISPATCHER_UID,
              actorEmail: "dispatcher@example.com",
              timestamp: serverTimestamp()
            }
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot create an audit event for another actor",
      async () => {
        await assertFails(
          setDoc(
            doc(
              dispatcherDb,
              "trip_events/rules-test-wrong-actor"
            ),
            {
              tripId: "rules-test-private-read",
              route: "St. Bernard to Tacloban",
              driver: "Juan",
              action: "Unauthorized action",
              previousStatus: "Waiting",
              newStatus: "Departed",
              actorUid: ADMIN_UID,
              actorEmail: "admin@example.com",
              timestamp: serverTimestamp()
            }
          )
        );
      }
    );

    await t.test(
      "Existing audit records cannot be edited",
      async () => {
        await assertFails(
          updateDoc(
            doc(
              dispatcherDb,
              "trip_events/rules-test-existing-event"
            ),
            {
              action: "Modified audit record"
            }
          )
        );
      }
    );

    await t.test(
      "Existing audit records cannot be deleted",
      async () => {
        await assertFails(
          deleteDoc(
            doc(
              adminDb,
              "trip_events/rules-test-existing-event"
            )
          )
        );
      }
    );

  } finally {
    await cleanupTestData();
    await testEnv.cleanup();
    testEnv = undefined;
  }
});
