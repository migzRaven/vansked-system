// Pure audit check and aggregation functions.
//
// This module has ZERO Firebase dependencies so every
// rule is unit-testable without an emulator.
//
// Field classification mirrors validTrip() in
// firestore.rules. Missing OPTIONAL fields are never
// reported as errors; they are flagged only when
// present with an invalid value.

// --------------------------------------------------
// SCHEMA CLASSIFICATION (from firestore.rules)
// --------------------------------------------------

export const REQUIRED_FIELDS = [
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

export const OPTIONAL_FIELDS = [
  "time24",
  "createdAt",
  "updatedAt",
  "statusUpdatedAt",
  "departureConfirmedAt",
  "sourceTemplateId",
];

export const TRIP_STATUSES = [
  "Waiting",
  "Boarding",
  "Full",
  "Overdue",
  "Departed",
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const TIME24_REGEX = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;

// Mirrors validFareString() in firestore.rules.
const FARE_REGEX = /^\d+(\.\d{1,2})?$/;

// Mirrors normalizePlateNumber in FleetManager.jsx
// (trim, uppercase, remove whitespace) so duplicate
// keys follow the same convention as the rest of
// the application.
export const normalizePlateNumber = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase().replace(/\s+/g, "");
};

// --------------------------------------------------
// BASIC VALIDATORS
// --------------------------------------------------

export const isTimestampLike = (value) =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof value.toMillis === "function"
  );

export const getDepartureMillis = (value) => {
  if (!isTimestampLike(value)) {
    return null;
  }

  const millis = value.toMillis();

  return Number.isFinite(millis) ? millis : null;
};

export const isValidCalendarDate = (value) => {
  if (typeof value !== "string" || !DATE_REGEX.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const utc = new Date(Date.UTC(year, month - 1, day));

  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
};

// --------------------------------------------------
// MANILA (Asia/Manila) TIME HELPERS
// --------------------------------------------------

const manilaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const manilaTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Manila",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const manilaWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  weekday: "short",
});

export const getManilaParts = (millis) => ({
  date: manilaDateFormatter.format(new Date(millis)),
  time24: manilaTimeFormatter.format(new Date(millis)),
});

export const getManilaWeekday = (dateString) => {
  if (!isValidCalendarDate(dateString)) {
    return null;
  }

  return manilaWeekdayFormatter.format(
    new Date(`${dateString}T12:00:00+08:00`)
  );
};

// Mirrors the destination logic used by the Analytics
// destination chart (AnalyticsView.jsx).
export const getDestination = (route) => {
  if (typeof route !== "string" || !route.trim()) {
    return null;
  }

  const parts = route.trim().split(/\s+to\s+/i);

  if (parts.length < 2) {
    return null;
  }

  return parts[parts.length - 1].trim() || null;
};

// --------------------------------------------------
// PER-DOCUMENT AUDIT RECORD
// --------------------------------------------------

const isInt = (value) => Number.isInteger(value);

// Reduces a raw trip document to a privacy-stripped
// audit record. Phone values, driver names, and raw
// route text are validated and immediately dropped;
// plate numbers survive ONLY in normalized form and
// are used internally for duplicate grouping and
// fleet cross-checks, never in reports.
export const createAuditRecord = (data) => {
  const missingRequired = [];
  const invalidRequired = [];
  const optionalInvalid = [];
  const unknownKeys = [];

  REQUIRED_FIELDS.forEach((field) => {
    if (!(field in data)) {
      missingRequired.push(field);
    }
  });

  Object.keys(data).forEach((key) => {
    if (
      REQUIRED_FIELDS.includes(key) ||
      OPTIONAL_FIELDS.includes(key)
    ) {
      return;
    }

    unknownKeys.push(key);
  });

  const present = (field) => !missingRequired.includes(field);

  const dateValid = isValidCalendarDate(data.date);

  if (!dateValid && present("date")) {
    invalidRequired.push("date");
  }

  const departureMs = getDepartureMillis(data.departureAt);

  if (departureMs === null && present("departureAt")) {
    invalidRequired.push("departureAt");
  }

  if (
    present("departureTime") &&
    typeof data.departureTime !== "string"
  ) {
    invalidRequired.push("departureTime");
  }

  if (present("driver") && typeof data.driver !== "string") {
    invalidRequired.push("driver");
  }

  if (present("phone") && typeof data.phone !== "string") {
    invalidRequired.push("phone");
  }

  if (
    present("plateNumber") &&
    typeof data.plateNumber !== "string"
  ) {
    invalidRequired.push("plateNumber");
  }

  if (present("route") && typeof data.route !== "string") {
    invalidRequired.push("route");
  }

  const fareValid =
    present("fare") &&
    typeof data.fare === "string" &&
    FARE_REGEX.test(data.fare);

  if (!fareValid && present("fare")) {
    invalidRequired.push("fare");
  }

  const capacity = Number(data.capacity);

  const capacityValid =
    present("capacity") &&
    isInt(capacity) &&
    capacity >= 1 &&
    capacity <= 100;

  if (!capacityValid && present("capacity")) {
    invalidRequired.push("capacity");
  }

  const seatsTaken = Number(data.seatsTaken);

  const seatsTakenValid =
    present("seatsTaken") &&
    isInt(seatsTaken) &&
    seatsTaken >= 0 &&
    capacityValid &&
    seatsTaken <= capacity;

  if (!seatsTakenValid && present("seatsTaken")) {
    invalidRequired.push("seatsTaken");
  }

  // Passenger-count validity is deliberately weaker
  // than seatsTakenValid: it accepts a non-negative
  // integer seatsTaken (bounded by the system's
  // enforced 100-seat capacity ceiling) even when the
  // capacity field is missing or invalid. This powers
  // passenger-volume analytics, which must not depend
  // on valid vehicle capacity. Occupancy eligibility
  // continues to use seatsTakenValid and the full
  // seat invariant.

  const passengerCountValid =
    present("seatsTaken") &&
    isInt(seatsTaken) &&
    seatsTaken >= 0 &&
    seatsTaken <= 100;

  const vacantSeats = Number(data.vacantSeats);

  const vacantSeatsValid =
    present("vacantSeats") &&
    isInt(vacantSeats) &&
    vacantSeats >= 0 &&
    capacityValid &&
    vacantSeats <= capacity;

  if (!vacantSeatsValid && present("vacantSeats")) {
    invalidRequired.push("vacantSeats");
  }

  const statusValid =
    present("status") &&
    typeof data.status === "string" &&
    TRIP_STATUSES.includes(data.status);

  if (!statusValid && present("status")) {
    invalidRequired.push("status");
  }

  // Optional fields: validated only when present.

  if ("time24" in data) {
    const timeOk =
      typeof data.time24 === "string" &&
      (data.time24 === "" || TIME24_REGEX.test(data.time24));

    if (!timeOk) {
      optionalInvalid.push("time24");
    }
  }

  ["createdAt", "updatedAt", "statusUpdatedAt", "departureConfirmedAt"]
    .forEach((field) => {
      if (field in data && !isTimestampLike(data[field])) {
        optionalInvalid.push(field);
      }
    });

  if (
    "sourceTemplateId" in data &&
    typeof data.sourceTemplateId !== "string"
  ) {
    optionalInvalid.push("sourceTemplateId");
  }

  // Seat arithmetic. The invariant seatsTaken +
  // vacantSeats = capacity is checked only for
  // Departed documents; intermediate statuses
  // legitimately reset vacantSeats to 0.

  const seatsCoreValid =
    capacityValid && seatsTakenValid && vacantSeatsValid;

  const isDeparted = statusValid && data.status === "Departed";

  const invariantDelta =
    isDeparted && seatsCoreValid
      ? seatsTaken + vacantSeats - capacity
      : null;

  const invariantHolds = invariantDelta === 0;

  const time24Value =
    typeof data.time24 === "string" &&
    TIME24_REGEX.test(data.time24)
      ? data.time24
      : null;

  const plateNormalized = normalizePlateNumber(data.plateNumber);

  const destination = getDestination(data.route);

  const departureConfirmedAtPresent =
    "departureConfirmedAt" in data;

  const departureConfirmedAtMs =
    getDepartureMillis(data.departureConfirmedAt);

  const manilaParts =
    departureMs !== null ? getManilaParts(departureMs) : null;

  const dateConsistent =
    manilaParts !== null &&
    dateValid &&
    manilaParts.date === data.date;

  const time24Consistent =
    manilaParts !== null &&
    (time24Value === null || manilaParts.time24 === time24Value);

  // Eligibility layers. These are independent and
  // intentionally overlapping: each answers a
  // different downstream analysis question.

  const schemaConforming =
    isDeparted &&
    missingRequired.length === 0 &&
    invalidRequired.length === 0 &&
    optionalInvalid.length === 0 &&
    unknownKeys.length === 0;

  const occupancyEligible =
    isDeparted && dateValid && seatsCoreValid && invariantHolds;

  const timeSlotEligible =
    occupancyEligible && dateConsistent && time24Consistent;

  const routeEligible =
    occupancyEligible && destination !== null;

  return {
    status: statusValid ? data.status : null,
    isDeparted,

    date: dateValid ? data.date : null,
    dateValid,

    departureMs,

    departureConfirmedAtPresent,
    departureConfirmedAtMs,

    manilaDateFromDeparture: manilaParts
      ? manilaParts.date
      : null,
    manilaTimeFromDeparture: manilaParts
      ? manilaParts.time24
      : null,
    dateConsistent,
    time24Consistent,

    time24: time24Value,

    capacity: capacityValid ? capacity : null,
    seatsTaken: seatsTakenValid ? seatsTaken : null,
    passengerCount: passengerCountValid ? seatsTaken : null,
    passengerCountValid,
    vacantSeats: vacantSeatsValid ? vacantSeats : null,
    seatsCoreValid,
    invariantDelta,

    plateNormalized,
    hasPlate: plateNormalized.length > 0,

    destination,

    missingRequired: missingRequired.length
      ? missingRequired
      : null,
    invalidRequired: invalidRequired.length
      ? invalidRequired
      : null,
    optionalInvalid: optionalInvalid.length
      ? optionalInvalid
      : null,
    unknownKeys: unknownKeys.length ? unknownKeys : null,

    schemaConforming,
    occupancyEligible,
    timeSlotEligible,
    routeEligible,
  };
};

// --------------------------------------------------
// AGGREGATION STATE
// --------------------------------------------------

export const createAuditState = () => ({
  documentsRead: 0,

  statusCounts: { invalidOrMissing: 0 },

  missingRequiredCounts: {},
  invalidRequiredCounts: {},
  optionalInvalidCounts: {},
  unknownKeyDocs: 0,

  rawDeparted: 0,
  schemaConforming: 0,
  occupancyEligible: 0,
  timeSlotEligible: 0,
  routeEligible: 0,

  nonDepartedWithSeatsTaken: 0,
  departedVacantSeatsEqualsOne: 0,
  departedVacantSeatsZero: 0,
  departedEmptyVan: 0,

  departedInvariantViolationsTotal: 0,
  departedInvariantDeltaDistribution: {},

  dateRange: { earliest: null, latest: null },
  departedDateRange: { earliest: null, latest: null },
  distinctDates: new Set(),

  datesWithOccupancyEligible: new Set(),
  occupancyEligibleByWeekday: {},
  occupancyEligibleByWeekdayDates: {},
  byRoute: {},
  byRouteAndSlot: new Map(),

  dateCheckedCount: 0,
  dateConsistentCount: 0,
  dateMismatchCount: 0,
  dateInvalidExcludedFromConsistency: 0,
  dateNoValidDepartureAtExcluded: 0,
  time24ComparableCount: 0,
  time24ConsistentCount: 0,
  time24MismatchCount: 0,
  time24AbsentExcluded: 0,

  duplicatesStrong: new Map(),
  duplicatesStrongExcluded: {
    invalidDate: 0,
    time24MissingOrEmpty: 0,
    plateMissing: 0,
  },
  duplicatesPossible: new Map(),
  duplicatesPossibleExcluded: {
    invalidDate: 0,
    time24MissingOrEmpty: 0,
    routeUnavailable: 0,
  },

  departureProvenance: {
    presentAndValid: {
      documents: 0,
      occupancyEligible: 0,
      invariantViolations: 0,
    },
    missing: {
      documents: 0,
      occupancyEligible: 0,
      invariantViolations: 0,
    },
    presentButInvalid: {
      documents: 0,
      occupancyEligible: 0,
      invariantViolations: 0,
    },
  },

  fleetMatchedPlates: new Set(),
  fleetUnmatchedPlates: new Set(),
  fleetCapacityMismatchTotal: 0,
  fleetCapacityPairs: {},
});

// --------------------------------------------------
// AGGREGATION
// --------------------------------------------------

const incrementBucket = (bucket, key) => {
  if (!key) {
    return;
  }

  bucket[key] = (bucket[key] || 0) + 1;
};

const recordDateCoverage = (state, record) => {
  const date = record.date;

  state.distinctDates.add(date);

  if (
    state.dateRange.earliest === null ||
    date < state.dateRange.earliest
  ) {
    state.dateRange.earliest = date;
  }

  if (
    state.dateRange.latest === null ||
    date > state.dateRange.latest
  ) {
    state.dateRange.latest = date;
  }

  // Departed-only span is tracked separately so total
  // trip history is never reported as departed history.
  if (record.isDeparted) {
    if (
      state.departedDateRange.earliest === null ||
      date < state.departedDateRange.earliest
    ) {
      state.departedDateRange.earliest = date;
    }

    if (
      state.departedDateRange.latest === null ||
      date > state.departedDateRange.latest
    ) {
      state.departedDateRange.latest = date;
    }
  }

  if (record.occupancyEligible) {
    state.datesWithOccupancyEligible.add(date);

    const weekday = getManilaWeekday(date);

    if (weekday && WEEKDAYS.includes(weekday)) {
      state.occupancyEligibleByWeekday[weekday] =
        (state.occupancyEligibleByWeekday[weekday] || 0) + 1;

      state.occupancyEligibleByWeekdayDates[weekday] =
        state.occupancyEligibleByWeekdayDates[weekday] ||
        new Set();

      state.occupancyEligibleByWeekdayDates[weekday].add(date);
    }
  }
};

const duplicateKeyForStrong = (record) => {
  if (!record.dateValid) {
    return { error: "invalidDate" };
  }

  if (record.time24 === null) {
    return { error: "time24MissingOrEmpty" };
  }

  if (!record.hasPlate) {
    return { error: "plateMissing" };
  }

  return {
    key: `${record.date}|${record.time24}|${record.plateNormalized}`,
  };
};

const duplicateKeyForPossible = (record) => {
  if (record.hasPlate) {
    // Already covered by the strong tier; no double
    // grouping.
    return null;
  }

  if (!record.dateValid) {
    return { error: "invalidDate" };
  }

  if (record.time24 === null) {
    return { error: "time24MissingOrEmpty" };
  }

  if (record.destination === null) {
    return { error: "routeUnavailable" };
  }

  return {
    key: `${record.date}|${record.time24}|${record.destination}`,
  };
};

export const aggregateRecord = (state, record, fleet) => {
  state.documentsRead += 1;

  if (record.status === null) {
    state.statusCounts.invalidOrMissing += 1;
  } else {
    state.statusCounts[record.status] =
      (state.statusCounts[record.status] || 0) + 1;
  }

  (record.missingRequired || []).forEach((field) =>
    incrementBucket(state.missingRequiredCounts, field)
  );

  (record.invalidRequired || []).forEach((field) =>
    incrementBucket(state.invalidRequiredCounts, field)
  );

  (record.optionalInvalid || []).forEach((field) =>
    incrementBucket(state.optionalInvalidCounts, field)
  );

  if (record.unknownKeys) {
    state.unknownKeyDocs += 1;
  }

  if (record.isDeparted) {
    state.rawDeparted += 1;

    if (record.schemaConforming) {
      state.schemaConforming += 1;
    }

    if (record.occupancyEligible) {
      state.occupancyEligible += 1;
    }

    if (record.timeSlotEligible) {
      state.timeSlotEligible += 1;
    }

    if (record.routeEligible) {
      state.routeEligible += 1;
    }
  }

  if (
    !record.isDeparted &&
    record.seatsTaken !== null &&
    record.seatsTaken > 0
  ) {
    state.nonDepartedWithSeatsTaken += 1;
  }

  if (record.isDeparted && record.seatsCoreValid) {
    if (record.vacantSeats === 1) {
      state.departedVacantSeatsEqualsOne += 1;
    }

    if (record.vacantSeats === 0) {
      state.departedVacantSeatsZero += 1;
    }

    if (
      record.seatsTaken === 0 &&
      record.vacantSeats === record.capacity
    ) {
      state.departedEmptyVan += 1;
    }

    if (record.invariantDelta !== 0) {
      state.departedInvariantViolationsTotal += 1;

      const deltaKey = String(record.invariantDelta);

      state.departedInvariantDeltaDistribution[deltaKey] =
        (state.departedInvariantDeltaDistribution[deltaKey] ||
          0) + 1;
    }
  }

  if (record.dateValid) {
    recordDateCoverage(state, record);
  }

  if (record.departureMs !== null) {
    if (record.dateValid) {
      state.dateCheckedCount += 1;

      if (record.dateConsistent) {
        state.dateConsistentCount += 1;
      } else {
        state.dateMismatchCount += 1;
      }

      if (record.time24 !== null) {
        state.time24ComparableCount += 1;

        if (record.time24Consistent) {
          state.time24ConsistentCount += 1;
        } else {
          state.time24MismatchCount += 1;
        }
      } else {
        state.time24AbsentExcluded += 1;
      }
    } else {
      state.dateInvalidExcludedFromConsistency += 1;
    }
  } else {
    state.dateNoValidDepartureAtExcluded += 1;
  }

  if (record.isDeparted) {
    let provenanceGroup;

    if (record.departureConfirmedAtMs !== null) {
      provenanceGroup =
        state.departureProvenance.presentAndValid;
    } else if (record.departureConfirmedAtPresent) {
      provenanceGroup =
        state.departureProvenance.presentButInvalid;
    } else {
      provenanceGroup = state.departureProvenance.missing;
    }

    provenanceGroup.documents += 1;

    if (record.occupancyEligible) {
      provenanceGroup.occupancyEligible += 1;
    }

    if (record.seatsCoreValid && record.invariantDelta !== 0) {
      provenanceGroup.invariantViolations += 1;
    }
  }

  const strong = duplicateKeyForStrong(record);

  if (strong.key) {
    state.duplicatesStrong.set(
      strong.key,
      (state.duplicatesStrong.get(strong.key) || 0) + 1
    );
  } else {
    state.duplicatesStrongExcluded[strong.error] += 1;
  }

  const possible = duplicateKeyForPossible(record);

  if (possible && possible.key) {
    state.duplicatesPossible.set(
      possible.key,
      (state.duplicatesPossible.get(possible.key) || 0) + 1
    );
  } else if (possible && possible.error) {
    state.duplicatesPossibleExcluded[possible.error] += 1;
  }

  if (record.hasPlate) {
    const fleetCapacity = fleet.get(record.plateNormalized);

    if (fleetCapacity === undefined) {
      state.fleetUnmatchedPlates.add(record.plateNormalized);
    } else {
      state.fleetMatchedPlates.add(record.plateNormalized);

      if (
        record.capacity !== null &&
        fleetCapacity !== null &&
        record.capacity !== fleetCapacity
      ) {
        state.fleetCapacityMismatchTotal += 1;

        const pairKey = `trip ${record.capacity} | fleet ${fleetCapacity}`;

        state.fleetCapacityPairs[pairKey] =
          (state.fleetCapacityPairs[pairKey] || 0) + 1;
      }
    }
  }

  if (record.routeEligible) {
    state.byRoute[record.destination] =
      (state.byRoute[record.destination] || 0) + 1;
  }

  if (record.timeSlotEligible) {
    const slotHour = record.manilaTimeFromDeparture.slice(0, 2);

    const routeSlot =
      state.byRouteAndSlot.get(record.destination) || {};

    routeSlot[slotHour] = (routeSlot[slotHour] || 0) + 1;

    state.byRouteAndSlot.set(record.destination, routeSlot);
  }
};

// --------------------------------------------------
// FINAL REPORT
// --------------------------------------------------

const WEEKDAYS_ORDER = WEEKDAYS;

// Only keys shared by two or more documents are
// duplicate candidates. Single-document keys are
// unique combinations, not duplicates.
const summarizeGroups = (map) => {
  const sizes = {};

  let groups = 0;

  let docs = 0;

  map.forEach((count) => {
    if (count < 2) {
      return;
    }

    groups += 1;
    docs += count;
    sizes[count] = (sizes[count] || 0) + 1;
  });

  return { groups, sizes, docs };
};

const rate = (part, whole) => {
  if (!whole) {
    return "n/a";
  }

  return `${((part / whole) * 100).toFixed(2)}%`;
};

const spanInDays = (earliest, latest) => {
  if (!earliest || !latest) {
    return null;
  }

  const start = Date.parse(`${earliest}T00:00:00Z`);
  const end = Date.parse(`${latest}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  return Math.round((end - start) / (24 * 60 * 60 * 1000));
};

// The audit never issues an automatic forecast-readiness
// verdict and never applies a fixed coverage threshold.
// It reports measurable evidence only; the forecasting
// decision is made by the application owner after
// reviewing these results.

export const FORECAST_DECISION_NOTE =
  "No automatic forecast verdict is issued and no fixed " +
  "coverage threshold is applied. Review the measured " +
  "evidence and data-quality rates above before deciding " +
  "whether passenger-demand forecasting is justified.";

export const finalizeReport = (
  state,
  { auditStartedAt, auditCompletedAt, countBefore, countAfter, fleetSize }
) => {
  const occupancyEligibleByWeekday = {};

  WEEKDAYS_ORDER.forEach((weekday) => {
    occupancyEligibleByWeekday[weekday] = {
      records: state.occupancyEligibleByWeekday[weekday] || 0,
      distinctDates: state.occupancyEligibleByWeekdayDates[weekday]
        ? state.occupancyEligibleByWeekdayDates[weekday].size
        : 0,
    };
  });

  const byRouteAndSlot = {};

  state.byRouteAndSlot.forEach((slots, destination) => {
    byRouteAndSlot[destination] = slots;
  });

  const totalTripDateSpanDays = spanInDays(
    state.dateRange.earliest,
    state.dateRange.latest
  );

  const departedTripDateSpanDays = spanInDays(
    state.departedDateRange.earliest,
    state.departedDateRange.latest
  );

  const churnDetected =
    countBefore !== null &&
    countAfter !== null &&
    countBefore !== countAfter;

  const sumMatchesCount =
    countAfter === null ? null : state.documentsRead === countAfter;

  const strongGroups = summarizeGroups(state.duplicatesStrong);

  const possibleGroups = summarizeGroups(state.duplicatesPossible);

  return {
    auditVersion: "1.0",

    scanWindow: {
      auditStartedAt: auditStartedAt.toISOString(),
      auditCompletedAt: auditCompletedAt.toISOString(),
      countBefore,
      countAfter,
      churnDetected,
      documentsRead: state.documentsRead,
      sumMatchesCount,
      limitation:
        "The scan is a sequence of paginated reads, not a single " +
        "consistent snapshot. Documents created, edited, or deleted " +
        "during the window may be included or missed. Aggregate " +
        "totals reflect the pages read, not one instant of the " +
        "database. Pre/post counts are reconciliation indicators, " +
        "not proof of a consistent snapshot.",
    },

    coverage: {
      documentsRead: state.documentsRead,
      earliest: state.dateRange.earliest,
      latest: state.dateRange.latest,
      distinctDates: state.distinctDates.size,
    },

    statusCounts: state.statusCounts,

    departedEligibility: {
      rawDeparted: state.rawDeparted,
      schemaConforming: state.schemaConforming,
      occupancyEligible: state.occupancyEligible,
      timeSlotEligible: state.timeSlotEligible,
      routeEligible: state.routeEligible,
      note:
        "Eligibility layers are independent and overlap. A record " +
        "invalid only in phone or fare can still be " +
        "occupancy-eligible; a record without a valid departureAt " +
        "can still count toward daily occupancy totals but not " +
        "time-slot analysis.",
      schemaConformingRate: rate(
        state.schemaConforming,
        state.rawDeparted
      ),
      occupancyEligibleRate: rate(
        state.occupancyEligible,
        state.rawDeparted
      ),
    },

    fieldIssues: {
      requiredMissing: state.missingRequiredCounts,
      requiredInvalid: state.invalidRequiredCounts,
      optionalInvalidWhenPresent: state.optionalInvalidCounts,
      optionalFieldsNotReportedWhenMissing: OPTIONAL_FIELDS,
      documentsWithUnknownExtraKeys: state.unknownKeyDocs,
      note:
        "Missing optional fields are never errors. Optional fields " +
        "are flagged only when present with an invalid value, " +
        "matching the current schema validators.",
    },

    seatValidity: {
      departedInvariantViolations:
        state.departedInvariantViolationsTotal,
      departedInvariantDeltaDistribution:
        state.departedInvariantDeltaDistribution,
      nonDepartedWithSeatsTaken: state.nonDepartedWithSeatsTaken,
      note:
        "The invariant seatsTaken + vacantSeats = capacity is " +
        "checked only for Departed documents; intermediate " +
        "statuses legitimately reset vacantSeats to 0.",
    },

    duplicates: {
      strongCandidates: {
        groups: strongGroups.groups,
        groupsBySize: strongGroups.sizes,
        documentsInvolved: strongGroups.docs,
        excludedIncompleteKeys: state.duplicatesStrongExcluded,
      },
      possibleCandidates: {
        groups: possibleGroups.groups,
        groupsBySize: possibleGroups.sizes,
        documentsInvolved: possibleGroups.docs,
        excludedIncompleteKeys: state.duplicatesPossibleExcluded,
      },
      note:
        "Candidate groups overlap legitimately (for example, the " +
        "same van genuinely scheduled twice at one time) and " +
        "require manual review in the dispatch UI. The audit never " +
        "auto-confirms duplicates and never excludes candidates " +
        "from trip totals. Incomplete identifying keys are " +
        "excluded from grouping and reported separately.",
    },

    timeConsistency: {
      dateVsDepartureAt: {
        checked: state.dateCheckedCount,
        consistent: state.dateConsistentCount,
        mismatched: state.dateMismatchCount,
        excludedInvalidDate:
          state.dateInvalidExcludedFromConsistency,
        excludedNoValidDepartureAt:
          state.dateNoValidDepartureAtExcluded,
      },
      time24VsDepartureAt: {
        comparable: state.time24ComparableCount,
        consistent: state.time24ConsistentCount,
        mismatched: state.time24MismatchCount,
        excludedTime24AbsentOrEmpty:
          state.time24AbsentExcluded,
      },
      note:
        "Denominators: the date check runs for documents with a " +
        "valid departureAt and valid date; the time24 check runs "
        + "only for documents where time24 is present and valid. " +
        "Missing optional time24 is not an error and is excluded " +
        "from the time24 comparison only.",
      derivedWith: "Intl-based Asia/Manila local date and HH:mm",
    },

    occupancyReviewIndicators: {
      departedVacantSeatsEqualsOne: state.departedVacantSeatsEqualsOne,
      departedVacantSeatsZero: state.departedVacantSeatsZero,
      departedEmptyVan: state.departedEmptyVan,
      note:
        "departedVacantSeatsEqualsOne counts Departed trips whose " +
        "vacant seat value equals the departure dialog default. " +
        "An equal count is a review indicator only: a genuine " +
        "single-vacant departure is indistinguishable from an " +
        "unchanged default, and these records are NOT classified " +
        "as incorrect.",
    },

    fleetCrossCheck: {
      fleetDocuments: fleetSize,
      matchedPlateVehicles: state.fleetMatchedPlates.size,
      unmatchedPlateVehicles: state.fleetUnmatchedPlates.size,
      capacityMismatchDocuments: state.fleetCapacityMismatchTotal,
      capacityMismatchPairs: state.fleetCapacityPairs,
      note:
        "Current fleet capacity is a review reference only; it does " +
        "not represent historical vehicle configurations. Capacity " +
        "mismatches are review candidates, not confirmed errors.",
    },

    historicalCoverage: {
      earliestAllTrips: state.dateRange.earliest,
      latestAllTrips: state.dateRange.latest,
      earliestDepartedTrips: state.departedDateRange.earliest,
      latestDepartedTrips: state.departedDateRange.latest,
      totalTripDateSpanDays,
      departedTripDateSpanDays,
      distinctDates: state.distinctDates.size,
      distinctDatesWithOccupancyEligibleDepartures:
        state.datesWithOccupancyEligible.size,
      occupancyEligibleByWeekday,
      occupancyEligibleByRoute: state.byRoute,
      occupancyEligibleByRouteAndHourSlot: byRouteAndSlot,
    },

    departureProvenance: {
      presentAndValid: {
        label:
          "Present departureConfirmedAt — timestamp recorded by " +
          "the newer departure workflow.",
        ...state.departureProvenance.presentAndValid,
      },
      missing: {
        label:
          "Missing departureConfirmedAt — possible legacy " +
          "departure implementation.",
        ...state.departureProvenance.missing,
      },
      presentButInvalid: {
        label:
          "Present but invalid departureConfirmedAt — not a " +
          "usable timestamp (review candidates).",
        ...state.departureProvenance.presentButInvalid,
      },
      note:
        "Historical indicators only, not absolute proof of how " +
        "an individual trip was processed. A missing optional " +
        "timestamp is not an error and does not by itself exclude "
        + "a record from any eligibility layer.",
    },

    forecastReadiness: {
      decision:
        "deferred — the owner decides after reviewing the audit results",
      decisionNote: FORECAST_DECISION_NOTE,
      measuredEvidence: {
        totalTripDateSpanDays,
        departedTripDateSpanDays,
        distinctDates: state.distinctDates.size,
        distinctDatesWithOccupancyEligibleDepartures:
          state.datesWithOccupancyEligible.size,
        occupancyEligibleDepartedRecords: state.occupancyEligible,
        recordsPerWeekday:
          Object.fromEntries(
            WEEKDAYS_ORDER.map((weekday) => [
              weekday,
              state.occupancyEligibleByWeekday[weekday] || 0,
            ])
          ),
        recordsPerRouteAndDepartureHour: byRouteAndSlot,
        schemaConformingRate: rate(
          state.schemaConforming,
          state.rawDeparted
        ),
        occupancyEligibleRate: rate(
          state.occupancyEligible,
          state.rawDeparted
        ),
        departedInvariantViolations:
          state.departedInvariantViolationsTotal,
        strongDuplicateCandidateGroups: strongGroups.groups,
        possibleDuplicateCandidateGroups: possibleGroups.groups,
        strongDuplicateCandidateRate: rate(
          strongGroups.docs,
          state.rawDeparted
        ),
        possibleDuplicateCandidateRate: rate(
          possibleGroups.docs,
          state.rawDeparted
        ),
      },
    },

    privacy: {
      aggregateOnly: true,
      documentIdsExported: false,
      plateNumbersExported: false,
      driverNamesExported: false,
      phoneNumbersExported: false,
      rawDocumentsExported: false,
      note:
        "Only aggregate statistics are displayed or exported. " +
        "Plate keys are used internally for duplicate grouping " +
        "and fleet cross-checks but never included in this report.",
    },
  };
};
