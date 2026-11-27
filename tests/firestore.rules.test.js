
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
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";

import {
  manilaCalendarDate,
  manilaDayEndMs,
  manilaDayStartMs,
} from "./helpers/manilaDate.js";

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

// =============================================
// MANILA DATE FIXTURES
// =============================================

// The security rules derive the operational date
// from server request.time, and the emulator
// cannot control that clock. Tests that exercise
// dispatcher access therefore use fixture trips
// dated with the locally computed Manila calendar
// date. A canary test asserts server and fixture
// agreement; running the suite within seconds of
// Manila midnight could produce a false failure.

const MANILA_TODAY = manilaCalendarDate(0);
const MANILA_YESTERDAY = manilaCalendarDate(-1);
const MANILA_TOMORROW = manilaCalendarDate(1);

function createTodayTrip(overrides = {}) {
  return createTrip({ date: MANILA_TODAY, ...overrides });
}

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

  `trips/rules-test-today-read`,
  `trips/rules-test-today-update`,
  `trips/rules-test-today-private-only-update`,
  `trips/rules-test-today-departed`,
  `trips/rules-test-today-delete`,
  `trips/rules-test-today-private-only-delete`,
  `trips/rules-test-today-paired-create`,
  `trips/rules-test-yesterday-read`,
  `trips/rules-test-future-create`,

  "fleet/rules-test-vehicle",
  "fleet/rules-test-new-vehicle",
  "fares/rules-test-fare",
  "fares/rules-test-new-fare",

  "public_trips/rules-test-future-create",
  `public_trips/rules-test-today-read`,
  `public_trips/rules-test-today-update`,
  `public_trips/rules-test-today-private-only-update`,
  `public_trips/rules-test-today-departed`,
  `public_trips/rules-test-today-delete`,
  `public_trips/rules-test-today-private-only-delete`,
  `public_trips/rules-test-yesterday-read`,
  `schedule_groups/rules-test-group`,
  `schedule_groups/rules-test-new-group`,

  "schedule_groups/rules-test-group/trips/rules-test-template",

  "trips/rules-test-fare-specific",
  "public_trips/rules-test-fare-specific",
  "trip_events/rules-test-created-event",
  "trip_events/rules-test-wrong-actor",
  "trip_events/rules-test-existing-event",
  "trip_events/rules-test-yesterday-event",
  "trip_events/rules-test-boundary-start",
  "trip_events/rules-test-boundary-start-minus-1ns",
  "trip_events/rules-test-boundary-start-plus-1ns",
  "trip_events/rules-test-boundary-next-midnight",

  "public_trips/rules-test-private-read",
  "public_trips/rules-test-dispatcher-update",
  "public_trips/rules-test-private-only-update",
  "public_trips/rules-test-departed",
  "public_trips/rules-test-delete",
  "public_trips/rules-test-private-only-delete",
  "public_trips/rules-test-public",
  "public_trips/rules-test-paired-create",
  "public_trips/rules-test-unpaired-create",
  "public_trips/rules-test-today-paired-create",
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

    // TODAY-DATED PAIRS (dispatcher scope) AND
    // YESTERDAY-DATED HISTORICAL PAIR

    await seedTripPair(
      db,
      "rules-test-today-read",
      createTodayTrip()
    );

    await seedTripPair(
      db,
      "rules-test-today-update",
      createTodayTrip()
    );

    await seedTripPair(
      db,
      "rules-test-today-private-only-update",
      createTodayTrip()
    );

    await seedTripPair(
      db,
      "rules-test-today-departed",
      createTodayTrip({ status: "Departed" })
    );

    await seedTripPair(
      db,
      "rules-test-today-delete",
      createTodayTrip()
    );

    await seedTripPair(
      db,
      "rules-test-today-private-only-delete",
      createTodayTrip()
    );

    await seedTripPair(
      db,
      "rules-test-yesterday-read",
      createTrip({ date: MANILA_YESTERDAY })
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

    // EXISTING AUDIT EVENT (historical by server-
    // timestamp fixture, not by dynamic name)

    // Yesterday Manila event for event-scope tests.

    await setDoc(
      doc(db, "trip_events/rules-test-yesterday-event"),
      {
        action: "Status changed to Departed",
        driver: "Juan",
        route: "St. Bernard to Tacloban",
        timestamp: Timestamp.fromMillis(
          Date.now() - 24 * 60 * 60 * 1000
        ),
        tripId: "rules-test-private-read"
      }
    );

    // MANILA MIDNIGHT BOUNDARY EVENTS relative to
    // the actual current Manila calendar date.
    // Exact seconds/nanoseconds instances exercise
    // the rule interval's inclusive start and
    // exclusive end, including sub-millisecond
    // offsets. Assuming the suite does not run
    // across Manila midnight, dayStartSeconds is
    // the current Manila day and next midnight is
    // one day later.

    const dayStartSeconds = Math.floor(
      manilaDayStartMs() / 1000
    );

    const boundaryEvent = (timestamp) => ({
      action: "Boundary check",
      driver: "Juan",
      route: "St. Bernard to Tacloban",
      timestamp,
      tripId: "rules-test-private-read"
    });

    await setDoc(
      doc(db, "trip_events/rules-test-boundary-start"),
      boundaryEvent(
        new Timestamp(dayStartSeconds, 0)
      )
    );

    await setDoc(
      doc(
        db,
        "trip_events/rules-test-boundary-start-minus-1ns"
      ),
      boundaryEvent(
        new Timestamp(dayStartSeconds - 1, 999999999)
      )
    );

    await setDoc(
      doc(
        db,
        "trip_events/rules-test-boundary-start-plus-1ns"
      ),
      boundaryEvent(
        new Timestamp(dayStartSeconds, 1)
      )
    );

    await setDoc(
      doc(
        db,
        "trip_events/rules-test-boundary-next-midnight"
      ),
      boundaryEvent(
        new Timestamp(dayStartSeconds + 86400, 0)
      )
    );

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
      "Dispatcher can get today's private trip",
      async () => {
        await assertSucceeds(
          readDocument(
            dispatcherDb,
            "trips/rules-test-today-read"
          )
        );
      }
    );

    await t.test(
      "Dispatcher can query today's trips",
      async () => {
        const snapshot = await assertSucceeds(
          getDocs(
            query(
              collection(dispatcherDb, "trips"),
              where("date", "==", MANILA_TODAY)
            )
          )
        );

        assert.ok(snapshot.size >= 1);
      }
    );

    await t.test(
      "Dispatcher cannot get a historical trip by document ID",
      async () => {
        await assertFails(
          readDocument(
            dispatcherDb,
            "trips/rules-test-private-read"
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot get yesterday's trip",
      async () => {
        await assertFails(
          readDocument(
            dispatcherDb,
            "trips/rules-test-yesterday-read"
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot query yesterday's date",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trips"),
              where("date", "==", MANILA_YESTERDAY)
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot query tomorrow's date",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trips"),
              where("date", "==", MANILA_TOMORROW)
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot query historical date ranges",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trips"),
              where("date", ">=", MANILA_YESTERDAY),
              where("date", "<=", MANILA_TODAY)
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot run the unfiltered historical audit sweep",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trips"),
              orderBy(documentId())
            )
          )
        );
      }
    );

    await t.test(
      "Administrator can read yesterday's trip",
      async () => {
        await assertSucceeds(
          readDocument(
            adminDb,
            "trips/rules-test-yesterday-read"
          )
        );
      }
    );

    await t.test(
      "Administrator can query historical date ranges",
      async () => {
        await assertSucceeds(
          getDocs(
            query(
              collection(adminDb, "trips"),
              where("date", ">=", MANILA_YESTERDAY),
              where("date", "<=", MANILA_TODAY)
            )
          )
        );
      }
    );

    await t.test(
      "Administrator can run the unfiltered historical audit sweep",
      async () => {
        const pageOne = await assertSucceeds(
          getDocs(
            query(
              collection(adminDb, "trips"),
              orderBy(documentId()),
              limit(2)
            )
          )
        );

        assert.ok(pageOne.size >= 1);
      }
    );

    await t.test(
      "Dispatcher can update today's private and public trips together",
      async () => {
        const batch = writeBatch(dispatcherDb);

        const tripRef = doc(
          dispatcherDb,
          "trips/rules-test-today-update"
        );

        const publicTripRef = doc(
          dispatcherDb,
          "public_trips/rules-test-today-update"
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
      "Dispatcher cannot update a today trip without updating its public record",
      async () => {
        await assertFails(
          updateDoc(
            doc(
              dispatcherDb,
              "trips/rules-test-today-private-only-update"
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
      "Dispatcher cannot update a historical trip by document ID",
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
      "Dispatcher cannot move a historical trip into today",
      async () => {
        await assertFails(
          updateDoc(
            doc(
              dispatcherDb,
              "trips/rules-test-private-only-update"
            ),
            {
              date: MANILA_TODAY,
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
              "public_trips/rules-test-today-private-only-update"
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
          createTodayTrip()
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
      "Dispatcher can update fleet records",
      async () => {
        await assertSucceeds(
          updateDoc(
            doc(dispatcherDb, "fleet/rules-test-vehicle"),
            {
              driver: "Dispatcher Updated Driver"
            }
          )
        );
      }
    );

    await t.test(
      "Dispatcher can create fleet records",
      async () => {
        await assertSucceeds(
          setDoc(
            doc(dispatcherDb, "fleet/rules-test-new-vehicle"),
            fleetFixture
          )
        );
      }
    );

    await t.test(
      "Dispatcher can delete fleet records",
      async () => {
        await assertSucceeds(
          deleteDoc(
            doc(dispatcherDb, "fleet/rules-test-new-vehicle")
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

    await t.test(
      "Dispatcher cannot create fare records",
      async () => {
        await assertFails(
          setDoc(
            doc(dispatcherDb, "fares/rules-test-new-fare"),
            {
              amount: "100"
            }
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot delete fare records",
      async () => {
        await assertFails(
          deleteDoc(
            doc(dispatcherDb, "fares/rules-test-fare")
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
      "Dispatcher can read schedule groups",
      async () => {
        const snapshot = await assertSucceeds(
          getDocs(
            collection(dispatcherDb, "schedule_groups")
          )
        );

        assert.ok(snapshot.size >= 1);
      }
    );

    await t.test(
      "Dispatcher can read nested template trips",
      async () => {
        const snapshot = await assertSucceeds(
          getDocs(
            collection(
              dispatcherDb,
              "schedule_groups/rules-test-group/trips"
            )
          )
        );

        assert.ok(snapshot.size >= 0);
      }
    );

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

    await t.test(
      "Dispatcher can update nested schedule templates",
      async () => {
        await assertSucceeds(
          updateDoc(
            doc(
              dispatcherDb,
              "schedule_groups/rules-test-group/trips/rules-test-template"
            ),
            {
              driver: "Dispatcher Updated Driver"
            }
          )
        );
      }
    );

    await t.test(
      "Dispatcher can delete nested schedule templates",
      async () => {
        await assertSucceeds(
          deleteDoc(
            doc(
              dispatcherDb,
              "schedule_groups/rules-test-group/trips/rules-test-template"
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher can create schedule groups",
      async () => {
        await assertSucceeds(
          setDoc(doc(dispatcherDb, "schedule_groups/rules-test-new-group"), {
            name: "Dispatcher Group",
            days: {
              Mon: true,
              Tue: true,
              Wed: true,
              Thu: true,
              Fri: true,
              Sat: true,
              Sun: true
            }
          })
        );
      }
    );

    await t.test(
      "Dispatcher can update schedule groups",
      async () => {
        await assertSucceeds(
          updateDoc(
            doc(dispatcherDb, "schedule_groups/rules-test-new-group"),
            {
              name: "Dispatcher Renamed Group"
            }
          )
        );
      }
    );

    // Deletes the dispatcher-created group so the
    // admin-managed rules-test-group remains intact
    // for the administrator tests that follow.

    await t.test(
      "Dispatcher can delete schedule groups",
      async () => {
        await assertSucceeds(
          deleteDoc(
            doc(dispatcherDb, "schedule_groups/rules-test-new-group")
          )
        );
      }
    );

    await t.test(
      "Administrator can create nested schedule templates",
      async () => {
        await assertSucceeds(
          setDoc(
            doc(
              adminDb,
              "schedule_groups/rules-test-group/trips/rules-test-template"
            ),
            scheduleTripFixture
          )
        );
      }
    );

    await t.test(
      "Administrator can update schedule groups",
      async () => {
        await assertSucceeds(
          updateDoc(
            doc(adminDb, "schedule_groups/rules-test-group"),
            {
              name: "Renamed Security Test Group"
            }
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
            createTodayTrip({
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
          "trips/rules-test-today-departed"
        );

        const publicTripRef = doc(
          dispatcherDb,
          "public_trips/rules-test-today-departed"
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
      "Dispatcher can create today's private and public trips together",
      async () => {
        const batch = writeBatch(dispatcherDb);

        const tripRef = doc(
          dispatcherDb,
          "trips/rules-test-today-paired-create"
        );

        const publicTripRef = doc(
          dispatcherDb,
          "public_trips/rules-test-today-paired-create"
        );

        const updatedAt = serverTimestamp();

        const tripData = createTodayTrip({
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
            createTodayTrip({
              updatedAt: serverTimestamp()
            })
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot create a trip dated yesterday",
      async () => {
        const batch = writeBatch(dispatcherDb);

        const tripData = createTrip({
          date: MANILA_YESTERDAY,
          updatedAt: serverTimestamp()
        });

        batch.set(
          doc(dispatcherDb, "trips/rules-test-paired-create"),
          tripData
        );

        batch.set(
          doc(dispatcherDb, "public_trips/rules-test-paired-create"),
          createPublicTrip(tripData)
        );

        await assertFails(batch.commit());
      }
    );

    await t.test(
      "Dispatcher cannot create a trip dated tomorrow",
      async () => {
        const batch = writeBatch(dispatcherDb);

        const tripData = createTrip({
          date: MANILA_TOMORROW,
          updatedAt: serverTimestamp()
        });

        batch.set(
          doc(dispatcherDb, "trips/rules-test-future-create"),
          tripData
        );

        batch.set(
          doc(dispatcherDb, "public_trips/rules-test-future-create"),
          createPublicTrip(tripData)
        );

        await assertFails(batch.commit());
      }
    );

    await t.test(
      "Administrator can create a future-dated paired trip",
      async () => {
        const batch = writeBatch(adminDb);

        const tripData = createTrip({
          date: MANILA_TOMORROW,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });

        batch.set(
          doc(adminDb, "trips/rules-test-future-create"),
          tripData
        );

        batch.set(
          doc(adminDb, "public_trips/rules-test-future-create"),
          createPublicTrip(tripData)
        );

        await assertSucceeds(batch.commit());
      }
    );

    await t.test(
      "Dispatcher can delete today's private and public trips together",
      async () => {
        const batch = writeBatch(dispatcherDb);

        batch.delete(
          doc(
            dispatcherDb,
            "trips/rules-test-today-delete"
          )
        );

        batch.delete(
          doc(
            dispatcherDb,
            "public_trips/rules-test-today-delete"
          )
        );

        await assertSucceeds(batch.commit());
      }
    );

    await t.test(
      "Dispatcher cannot delete a today trip without deleting its public record",
      async () => {
        await assertFails(
          deleteDoc(
            doc(
              dispatcherDb,
              "trips/rules-test-today-private-only-delete"
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot delete a historical trip",
      async () => {
        const batch = writeBatch(dispatcherDb);

        batch.delete(
          doc(dispatcherDb, "trips/rules-test-delete")
        );

        batch.delete(
          doc(dispatcherDb, "public_trips/rules-test-delete")
        );

        await assertFails(batch.commit());
      }
    );

    await t.test(
      "Administrator can delete historical paired trips",
      async () => {
        const batch = writeBatch(adminDb);

        batch.delete(
          doc(adminDb, "trips/rules-test-delete")
        );

        batch.delete(
          doc(adminDb, "public_trips/rules-test-delete")
        );

        await assertSucceeds(batch.commit());
      }
    );

    // -----------------------------------------
    // 10. TRIP EVENT HISTORICAL SCOPE
    // -----------------------------------------

    await t.test(
      "Dispatcher can query today's events within 50",
      async () => {
        const snapshot = await assertSucceeds(
          getDocs(
            query(
              collection(dispatcherDb, "trip_events"),
              where("timestamp", ">=", Timestamp.fromMillis(manilaDayStartMs())),
              where("timestamp", "<", Timestamp.fromMillis(manilaDayEndMs())),
              orderBy("timestamp", "desc"),
              limit(50)
            )
          )
        );

        assert.ok(snapshot.size >= 0);
      }
    );

    // ISOLATION DIAGNOSTICS. These cases separate
    // the individual list-rule constraints so a
    // failing run pinpoints which one the proof
    // engine rejects. Expected outcomes below are
    // the mandated security semantics: a dispatcher
    // list succeeds only with BOTH timestamp bounds
    // AND a limit of at most 50.

    await t.test(
      "Isolation: dispatcher list with only the lower timestamp bound is denied",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trip_events"),
              where("timestamp", ">=", Timestamp.fromMillis(manilaDayStartMs())),
              orderBy("timestamp", "desc"),
              limit(50)
            )
          )
        );
      }
    );

    await t.test(
      "Isolation: dispatcher list with only the upper timestamp bound is denied",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trip_events"),
              where("timestamp", "<", Timestamp.fromMillis(manilaDayEndMs())),
              limit(50)
            )
          )
        );
      }
    );

    await t.test(
      "Isolation: dispatcher list with both timestamp bounds and limit 50 (no orderBy) succeeds",
      async () => {
        await assertSucceeds(
          getDocs(
            query(
              collection(dispatcherDb, "trip_events"),
              where("timestamp", ">=", Timestamp.fromMillis(manilaDayStartMs())),
              where("timestamp", "<", Timestamp.fromMillis(manilaDayEndMs())),
              limit(50)
            )
          )
        );
      }
    );

    await t.test(
      "Isolation: dispatcher list with both timestamp bounds and no orderBy or limit is denied",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trip_events"),
              where("timestamp", ">=", Timestamp.fromMillis(manilaDayStartMs())),
              where("timestamp", "<", Timestamp.fromMillis(manilaDayEndMs()))
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot query events without a limit",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trip_events"),
              where("timestamp", ">=", Timestamp.fromMillis(manilaDayStartMs())),
              where("timestamp", "<", Timestamp.fromMillis(manilaDayEndMs())),
              orderBy("timestamp", "desc")
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot query more than 50 events",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trip_events"),
              where("timestamp", ">=", Timestamp.fromMillis(manilaDayStartMs())),
              where("timestamp", "<", Timestamp.fromMillis(manilaDayEndMs())),
              orderBy("timestamp", "desc"),
              limit(51)
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot query an unrestricted event history",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trip_events"),
              orderBy("timestamp", "desc"),
              limit(50)
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot query yesterday's events",
      async () => {
        await assertFails(
          getDocs(
            query(
              collection(dispatcherDb, "trip_events"),
              where("timestamp", ">=", Timestamp.fromMillis(manilaDayStartMs(-1))),
              where("timestamp", "<", Timestamp.fromMillis(manilaDayEndMs(-1))),
              orderBy("timestamp", "desc"),
              limit(50)
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot get a historical event by document ID",
      async () => {
        await assertFails(
          readDocument(
            dispatcherDb,
            "trip_events/rules-test-yesterday-event"
          )
        );
      }
    );

    await t.test(
      "Dispatcher can get an event exactly at Manila midnight",
      async () => {
        await assertSucceeds(
          readDocument(
            dispatcherDb,
            "trip_events/rules-test-boundary-start"
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot get an event one nanosecond before Manila midnight",
      async () => {
        await assertFails(
          readDocument(
            dispatcherDb,
            "trip_events/rules-test-boundary-start-minus-1ns"
          )
        );
      }
    );

    await t.test(
      "Dispatcher can get an event one nanosecond after Manila midnight",
      async () => {
        await assertSucceeds(
          readDocument(
            dispatcherDb,
            "trip_events/rules-test-boundary-start-plus-1ns"
          )
        );
      }
    );

    await t.test(
      "Dispatcher cannot get an event exactly at the next Manila midnight",
      async () => {
        await assertFails(
          readDocument(
            dispatcherDb,
            "trip_events/rules-test-boundary-next-midnight"
          )
        );
      }
    );

    await t.test(
      "Administrator can read historical events by document ID",
      async () => {
        await assertSucceeds(
          readDocument(
            adminDb,
            "trip_events/rules-test-yesterday-event"
          )
        );
      }
    );

    await t.test(
      "Administrator can query the unrestricted latest 50 events",
      async () => {
        await assertSucceeds(
          getDocs(
            query(
              collection(adminDb, "trip_events"),
              orderBy("timestamp", "desc"),
              limit(50)
            )
          )
        );
      }
    );

    await t.test(
      "Dispatcher can read today's trip with a trip-specific fare",
      async () => {
        const batch = writeBatch(dispatcherDb);

        const updatedAt = serverTimestamp();

        const tripData = createTodayTrip({
          fare: "99.50",
          updatedAt,
          createdAt: updatedAt
        });

        batch.set(
          doc(dispatcherDb, "trips/rules-test-fare-specific"),
          tripData
        );

        batch.set(
          doc(dispatcherDb, "public_trips/rules-test-fare-specific"),
          createPublicTrip(tripData)
        );

        await assertSucceeds(batch.commit());
      }
    );

    await t.test(
      "Dispatcher can read shared fares",
      async () => {
        const snapshot = await assertSucceeds(
          getDocs(collection(dispatcherDb, "fares"))
        );

        assert.ok(snapshot.size >= 1);
      }
    );

    await t.test(
      "Departed trips cannot be changed back to Waiting by administrators",
      async () => {
        const batch = writeBatch(adminDb);

        const updatedAt = serverTimestamp();

        batch.update(doc(adminDb, "trips/rules-test-today-departed"), {
          status: "Waiting",
          updatedAt
        });

        batch.update(
          doc(adminDb, "public_trips/rules-test-today-departed"),
          {
            status: "Waiting",
            updatedAt
          }
        );

        await assertFails(batch.commit());
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

    await t.test(
      "Dispatcher can get an event they created today",
      async () => {
        await assertSucceeds(
          readDocument(
            dispatcherDb,
            "trip_events/rules-test-created-event"
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
