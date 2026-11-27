// Pure historical-analytics aggregation.
//
// No Firebase imports. Documents are reduced through
// the existing audit engine (createAuditRecord in
// ../audit/auditRules.js) so occupancy eligibility
// rules are identical to the Data Quality Audit.
//
// SCOPE: this module measures documents supplied to it.
// The future Firestore range query retrieves candidates
// by the `date` field; documents missing `date` are
// outside that query's scope and remain the
// responsibility of the full Data Quality Audit.

import {
  createAuditRecord,
  getManilaWeekday,
  getDepartureMillis,
  isValidCalendarDate,
} from "../audit/auditRules.js";

// --------------------------------------------------
// DATE HELPERS (calendar-only, no UTC interpretation
// of date-only strings)
// --------------------------------------------------

const pad2 = (value) => String(value).padStart(2, "0");

const toYMD = (year, month, day) =>
  `${pad2(year)}-${pad2(month)}-${pad2(day)}`;

const parseYMD = (value) => {
  if (!isValidCalendarDate(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  return { year, month, day };
};

// Inclusive range check on already-validated
// YYYY-MM-DD strings. Lexicographic comparison is safe
// only for validated strings, so validation happens
// first.
const dateInInclusiveRange = (
  value,
  startDate,
  endDate
) => {
  if (startDate && value < startDate) {
    return false;
  }

  if (endDate && value > endDate) {
    return false;
  }

  return true;
};

// Monday-start week key derived with pure calendar
// arithmetic (Date.UTC on explicit components; never
// new Date("YYYY-MM-DD")).
export const getManilaMondayWeekKey = (dateString) => {
  const parts = parseYMD(dateString);

  if (!parts) {
    return null;
  }

  const { year, month, day } = parts;

  const dayOfWeek = new Date(
    Date.UTC(year, month - 1, day)
  ).getUTCDay();

  const mondayOffset = (dayOfWeek + 6) % 7;

  const monday = new Date(
    Date.UTC(year, month - 1, day - mondayOffset)
  );

  return toYMD(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate()
  );
};

// --------------------------------------------------
// NAMES
// --------------------------------------------------

export const UNPARSED_ROUTE = "Unparsed route";

export const UNMATCHED_VEHICLE = "Vehicle not in current fleet";

const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const OCCUPANCY_BASIS_NOTE =
  "Occupancy figures come from dispatcher-recorded " +
  "estimates (reported vacancies at departure) over " +
  "occupancy-eligible departed records. They are not " +
  "independently verified passenger counts.";

const PASSENGER_DEMAND_BASIS_NOTE =
  "Passenger-volume figures use the dispatcher-" +
  "recorded seatsTaken value over departed trips with " +
  "a valid non-negative passenger count, regardless of " +
  "vehicle capacity. Occupancy figures additionally " +
  "require valid capacity and the full seat invariant. " +
  "All values are estimates derived from reported " +
  "vacancies at departure, not independently verified " +
  "passenger totals.";

// --------------------------------------------------
// STATE
// --------------------------------------------------

export const createHistoryState = ({ startDate, endDate }) => ({
  range: { startDate, endDate },

  candidatesProcessed: 0,
  validDateIncluded: 0,
  invalidDateExcluded: 0,
  missingDateExcluded: 0,
  outOfRangeExcluded: 0,

  statusCounts: { invalidOrMissing: 0 },

  dailyCounts: {},
  weeklyCounts: {},
  weekdayCounts: WEEKDAY_ORDER.reduce((acc, weekday) => {
    acc[weekday] = 0;
    return acc;
  }, {}),
  hourCounts: {},
  hourExcludedNoValidDepartureAt: 0,

  routeCounts: {},
  routeByWeek: {},

  vehicleTripCounts: {},
  vehiclesMatchedInFleet: new Set(),
  vehiclesUnmatchedInFleet: new Set(),

  departedTotal: 0,
  departedOccupancyEligible: 0,

  occupancy: {
    eligibleRecords: 0,
    passengersSum: 0,
    capacitySum: 0,
  },
  dailyOccupancy: {},

  passengerDemand: {
    totalPassengers: 0,
    eligibleDepartedTrips: 0,
    daily: {},
    weekly: {},
    monthly: {},
    weekday: WEEKDAY_ORDER.reduce((acc, weekday) => {
      acc[weekday] = {
        passengers: 0,
        eligibleTrips: 0,
        capacitySum: 0,
      };
      return acc;
    }, {}),
    hourly: {},
    hourlyExcludedNoValidDepartureAt: 0,
    ineligibleDepartedExcluded: 0,
    fleet: {},
  },

  departedCoverage: {
    dateRange: { earliest: null, latest: null },
    possibleLegacyDepartures: 0,
    legacyWithEligibility: 0,
    legacyWithoutEligibility: 0,
    invariantViolationsTotal: 0,
    invariantDeltaDistribution: {},
    departuresWithVacantOne: 0,
    legacyDates: new Set(),
  },
});

// --------------------------------------------------
// AGGREGATION
// --------------------------------------------------

const countBucket = (bucket, key) => {
  bucket[key] = (bucket[key] || 0) + 1;
};

const addDemand = (bucket, key, passengerCount, capacity) => {
  const entry = bucket[key] || {
    passengers: 0,
    eligibleTrips: 0,
    capacitySum: 0,
    capacityKnownTrips: 0,
  };

  entry.passengers += passengerCount;
  entry.eligibleTrips += 1;

  if (capacity !== null) {
    entry.capacitySum += capacity;
    entry.capacityKnownTrips += 1;
  }

  bucket[key] = entry;
};

const extendRange = (range, date) => {
  if (range.earliest === null || date < range.earliest) {
    range.earliest = date;
  }

  if (range.latest === null || date > range.latest) {
    range.latest = date;
  }
};

export const aggregateHistoryRecord = (
  state,
  data,
  fleet
) => {
  state.candidatesProcessed += 1;

  const record = createAuditRecord(data);

  // Strict date gating. Only valid, in-range,
  // queryable dates join the analytics buckets.

  if (!record.dateValid) {
    if ("date" in data) {
      state.invalidDateExcluded += 1;
    } else {
      state.missingDateExcluded += 1;
    }

    return record;
  }

  if (
    !dateInInclusiveRange(
      record.date,
      state.range.startDate,
      state.range.endDate
    )
  ) {
    state.outOfRangeExcluded += 1;

    return record;
  }

  state.validDateIncluded += 1;

  const date = record.date;
  const weekKey = getManilaMondayWeekKey(date);
  const weekday = getManilaWeekday(date);

  // Status (current recorded status semantics).

  if (record.status === null) {
    state.statusCounts.invalidOrMissing += 1;
  } else {
    state.statusCounts[record.status] =
      (state.statusCounts[record.status] || 0) + 1;
  }

  // Daily / weekly / weekday activity.

  state.dailyCounts[date] = (state.dailyCounts[date] || 0) + 1;

  if (weekKey) {
    state.weeklyCounts[weekKey] =
      (state.weeklyCounts[weekKey] || 0) + 1;
  }

  if (weekday && WEEKDAY_ORDER.includes(weekday)) {
    state.weekdayCounts[weekday] += 1;
  }

  // Departure hour (scheduled; Manila local).

  if (record.departureMs !== null) {
    const hour = record.manilaTimeFromDeparture.slice(0, 2);

    countBucket(state.hourCounts, `${hour}:00`);
  } else {
    state.hourExcludedNoValidDepartureAt += 1;
  }

  // Routes, including the explicit unparsed bucket.

  const routeBucket =
    record.destination !== null
      ? record.destination
      : UNPARSED_ROUTE;

  state.routeCounts[routeBucket] =
    (state.routeCounts[routeBucket] || 0) + 1;

  if (weekKey) {
    const weekRoutes = state.routeByWeek[weekKey] || {};

    weekRoutes[routeBucket] =
      (weekRoutes[routeBucket] || 0) + 1;

    state.routeByWeek[weekKey] = weekRoutes;
  }

  // Vehicles. Current fleet data is used only to tag
  // matched/unmatched; trip-recorded capacity values
  // are preserved as-is and never replaced.

  if (record.hasPlate) {
    state.vehicleTripCounts[record.plateNormalized] =
      (state.vehicleTripCounts[record.plateNormalized] ||
        0) + 1;

    if (fleet.has(record.plateNormalized)) {
      state.vehiclesMatchedInFleet.add(
        record.plateNormalized
      );
    } else {
      state.vehiclesUnmatchedInFleet.add(
        record.plateNormalized
      );
    }
  }

  // Departure coverage and occupancy eligibility.

  if (record.isDeparted) {
    state.departedTotal += 1;

    extendRange(
      state.departedCoverage.dateRange,
      date
    );

    const isPossibleLegacy =
      record.departureConfirmedAtMs === null;

    if (isPossibleLegacy) {
      state.departedCoverage.possibleLegacyDepartures += 1;

      state.departedCoverage.legacyDates.add(date);

      if (record.occupancyEligible) {
        state.departedCoverage.legacyWithEligibility += 1;
      } else {
        state.departedCoverage.legacyWithoutEligibility += 1;
      }
    }

    if (record.seatsCoreValid && record.invariantDelta !== 0) {
      state.departedCoverage.invariantViolationsTotal += 1;

      const deltaKey = String(record.invariantDelta);

      state.departedCoverage.invariantDeltaDistribution[
        deltaKey
      ] =
        (state.departedCoverage
          .invariantDeltaDistribution[deltaKey] || 0) + 1;
    }

    if (
      record.seatsCoreValid &&
      record.vacantSeats === 1
    ) {
      state.departedCoverage.departuresWithVacantOne += 1;
    }

    // Occupancy eligibility (unchanged): departed, valid
    // date, valid seats core, and the seat invariant.

    if (record.occupancyEligible) {
      state.departedOccupancyEligible += 1;

      state.occupancy.eligibleRecords += 1;
      state.occupancy.passengersSum += record.seatsTaken;
      state.occupancy.capacitySum += record.capacity;

      const day = state.dailyOccupancy[date] || {
        eligibleRecords: 0,
        passengersSum: 0,
        capacitySum: 0,
      };

      day.eligibleRecords += 1;
      day.passengersSum += record.seatsTaken;
      day.capacitySum += record.capacity;

      state.dailyOccupancy[date] = day;
    }

    // Passenger-volume eligibility (class A): departed,
    // valid date, and a valid non-negative passenger
    // count. Deliberately independent of vehicle
    // capacity and fleet availability; capacity data is
    // accumulated per bucket only when present.

    if (record.passengerCountValid) {
      state.passengerDemand.totalPassengers +=
        record.passengerCount;

      state.passengerDemand.eligibleDepartedTrips += 1;

      addDemand(
        state.passengerDemand.daily,
        date,
        record.passengerCount,
        record.capacity
      );

      if (weekKey) {
        addDemand(
          state.passengerDemand.weekly,
          weekKey,
          record.passengerCount,
          record.capacity
        );
      }

      addDemand(
        state.passengerDemand.monthly,
        date.slice(0, 7),
        record.passengerCount,
        record.capacity
      );

      if (weekday && WEEKDAY_ORDER.includes(weekday)) {
        addDemand(
          state.passengerDemand.weekday,
          weekday,
          record.passengerCount,
          record.capacity
        );
      }

      if (record.manilaTimeFromDeparture) {
        addDemand(
          state.passengerDemand.hourly,
          `${record.manilaTimeFromDeparture.slice(0, 2)}:00`,
          record.passengerCount,
          record.capacity
        );
      } else {
        state.passengerDemand
          .hourlyExcludedNoValidDepartureAt += 1;
      }

      // Fleet attribution (class C): valid passenger
      // counts stay attributable to the recorded vehicle
      // even when capacity is missing. Occupancy is only
      // computed when capacity is known.

      if (record.hasPlate) {
        addDemand(
          state.passengerDemand.fleet,
          record.plateNormalized,
          record.passengerCount,
          record.capacity
        );
      }
    } else {
      state.passengerDemand.ineligibleDepartedExcluded += 1;
    }
  }

  return record;
};

// --------------------------------------------------
// FINALIZATION
// --------------------------------------------------

const average = (sum, count) =>
  count > 0 ? sum / count : null;

const sortedEntries = (record) =>
  Object.entries(record).sort(([a], [b]) => a.localeCompare(b));

export const finalizeHistory = (state) => {
  const { occupancy } = state;

  const n = occupancy.eligibleRecords;

  const avgRecordedPassengersPerTrip = average(
    occupancy.passengersSum,
    n
  );

  const avgRecordedCapacityPerTrip = average(
    occupancy.capacitySum,
    n
  );

  const weightedLoadFactorPercent =
    occupancy.capacitySum > 0
      ? (occupancy.passengersSum /
          occupancy.capacitySum) * 100
      : null;

  const dailyOccupancy = sortedEntries(
    state.dailyOccupancy
  ).map(([date, day]) => ({
    date,
    eligibleRecords: day.eligibleRecords,
    avgRecordedPassengersPerTrip: average(
      day.passengersSum,
      day.eligibleRecords
    ),
    weightedLoadFactorPercent:
      day.capacitySum > 0
        ? (day.passengersSum / day.capacitySum) * 100
        : null,
    seatsSum: day.passengersSum,
    capacitySum: day.capacitySum,
  }));

  const coverage = state.departedCoverage;

  // Passenger demand intelligence rows and summaries.

  const demand = state.passengerDemand;

  const demandRows = (record) =>
    sortedEntries(record).map(([key, value]) => ({
      key,
      ...value,
    }));

  const busiestTravelDay = demandRows(demand.daily).reduce(
    (busiest, row) =>
      busiest === null || row.passengers > busiest.passengers
        ? { date: row.key, passengers: row.passengers }
        : busiest,
    null
  );

  const busiestDepartureHour = demandRows(
    demand.hourly
  ).reduce(
    (busiest, row) =>
      busiest === null || row.passengers > busiest.passengers
        ? { hour: row.key, passengers: row.passengers }
        : busiest,
    null
  );

  const fleetDemandRows = demandRows(demand.fleet)
    .map((row) => ({
      vehicle: row.key,
      eligibleTrips: row.eligibleTrips,
      passengers: row.passengers,
      capacitySum: row.capacitySum,
      capacityKnownTrips: row.capacityKnownTrips,
      occupancyPercent:
        row.capacitySum > 0
          ? (row.passengers / row.capacitySum) * 100
          : null,
      matchedInCurrentFleet:
        state.vehiclesMatchedInFleet.has(row.key),
    }))
    .sort(
      (a, b) =>
        b.passengers - a.passengers ||
        a.vehicle.localeCompare(b.vehicle)
    );

  return {
    scope: {
      startDate: state.range.startDate,
      endDate: state.range.endDate,
      statement:
        "Counts reflect trip documents with valid, " +
        "in-range date fields only. Documents missing " +
        "the date field are outside the range query's " +
        "scope and are covered by the Data Quality Audit.",
    },

    candidates: {
      processed: state.candidatesProcessed,
      validDateIncluded: state.validDateIncluded,
      invalidDateExcluded: state.invalidDateExcluded,
      missingDateExcluded: state.missingDateExcluded,
      outOfRangeExcluded: state.outOfRangeExcluded,
    },

    statusCounts: state.statusCounts,

    activity: {
      dailyCounts: Object.fromEntries(
        sortedEntries(state.dailyCounts)
      ),
      weeklyCounts: Object.fromEntries(
        sortedEntries(state.weeklyCounts)
      ),
      weekdayCounts: { ...state.weekdayCounts },
      hourCounts: Object.fromEntries(
        sortedEntries(state.hourCounts)
      ),
      hourExcludedNoValidDepartureAt:
        state.hourExcludedNoValidDepartureAt,
      note:
        "Departure hours reflect the scheduled " +
        "departureAt time in Asia/Manila, not the " +
        "physically observed dispatch time.",
    },

    routes: {
      counts: Object.fromEntries(
        sortedEntries(state.routeCounts)
      ),
      byWeek: Object.fromEntries(
        sortedEntries(state.routeByWeek).map(
          ([week, counts]) => [
            week,
            Object.fromEntries(sortedEntries(counts)),
          ]
        )
      ),
      unparsedRouteBucket: UNPARSED_ROUTE,
    },

    vehicles: {
      tripCounts: Object.fromEntries(
        sortedEntries(state.vehicleTripCounts)
      ),
      vehiclesMatchedInCurrentFleet:
        state.vehiclesMatchedInFleet.size,
      vehiclesUnmatchedInCurrentFleet:
        state.vehiclesUnmatchedInFleet.size,
      unmatchedVehicleBucket: UNMATCHED_VEHICLE,
      note:
        "Vehicle groupings use trip-recorded plate " +
        "numbers against the CURRENT fleet registry. " +
        "Historical vehicle configuration and capacity " +
        "may differ from current fleet records.",
    },

    occupancy: {
      basis: OCCUPANCY_BASIS_NOTE,

      departedTotal: state.departedTotal,
      eligibleRecords: n,

      avgRecordedPassengersPerTrip,
      avgRecordedCapacityPerTrip,
      weightedLoadFactorPercent,

      seatsSum: occupancy.passengersSum,
      capacitySum: occupancy.capacitySum,

      zeroDenominatorNote:
        n === 0
          ? "No occupancy-eligible records in range; " +
            "averages are unavailable rather than zero."
          : null,

      daily: dailyOccupancy,
    },

    passengerDemand: {
      basis: PASSENGER_DEMAND_BASIS_NOTE,

      summary: {
        totalPassengers: demand.totalPassengers,
        eligibleDepartedTrips: demand.eligibleDepartedTrips,
        ineligibleDepartedExcluded:
          demand.ineligibleDepartedExcluded,
        occupancyEligibleDepartedTrips: n,
        avgPassengersPerTrip:
          demand.eligibleDepartedTrips > 0
            ? demand.totalPassengers /
              demand.eligibleDepartedTrips
            : null,
        weightedOccupancyPercent: weightedLoadFactorPercent,
        busiestTravelDay,
        busiestDepartureHour,
        zeroDenominatorNote:
          demand.eligibleDepartedTrips === 0
            ? "No departed records with a valid passenger " +
              "count in range; passenger demand metrics " +
              "are unavailable rather than zero."
            : null,
        eligibilityNote:
          "Passenger totals and averages include every " +
          "departed record with a valid non-negative " +
          "seatsTaken value, even when capacity is " +
          "missing. The weighted occupancy figure still " +
          "uses occupancy-eligible records with valid " +
          "capacity and the full seat invariant, so it " +
          "may cover fewer trips.",
      },

      daily: demandRows(demand.daily).map(
        ({ key, ...value }) => ({ date: key, ...value })
      ),

      weekly: demandRows(demand.weekly).map(
        ({ key, ...value }) => ({
          weekStart: key,
          ...value,
        })
      ),

      monthly: demandRows(demand.monthly).map(
        ({ key, ...value }) => ({ month: key, ...value })
      ),

      weekday: WEEKDAY_ORDER.map((weekday) => ({
        weekday,
        ...demand.weekday[weekday],
      })),

      hourly: demandRows(demand.hourly).map(
        ({ key, ...value }) => ({ hour: key, ...value })
      ),
      hourlyExcludedNoValidDepartureAt:
        demand.hourlyExcludedNoValidDepartureAt,
      hourlyNote:
        "Departure hours reflect the scheduled " +
        "departureAt time in Asia/Manila, not the " +
        "physically observed dispatch time.",

      fleet: fleetDemandRows,
      fleetNote:
        "Vehicle groupings use trip-recorded plate " +
        "numbers against the CURRENT fleet registry. " +
        "Historical vehicle configuration and capacity " +
        "may differ from current fleet records.",
    },

    departedCoverage: {
      earliestDepartedDate: coverage.dateRange.earliest,
      latestDepartedDate: coverage.dateRange.latest,
      possibleLegacyDepartures:
        coverage.possibleLegacyDepartures,
      legacyWithEligibility:
        coverage.legacyWithEligibility,
      legacyWithoutEligibility:
        coverage.legacyWithoutEligibility,
      legacyDates: [...coverage.legacyDates],
      invariantViolationsTotal:
        coverage.invariantViolationsTotal,
      invariantDeltaDistribution:
        coverage.invariantDeltaDistribution,
      departuresWithVacantOne:
        coverage.departuresWithVacantOne,
      note:
        "Departed records missing departureConfirmedAt " +
        "may come from the legacy departure workflow " +
        "(pre-Nov-24). Their stale seatsTaken values " +
        "carry no occupancy meaning and are kept out " +
        "of averages by the eligibility engine.",
    },

    metadata: {
      occupancyBasis: OCCUPANCY_BASIS_NOTE,
      noRevenueCalculations: true,
      noForecasting: true,
      historicalStatusSemantics:
        "Statuses are the current recorded values on " +
        "trip documents, not historical transitions.",
    },
  };
};

// Exposed for the Firestore scan layer (Phase 2B):
// getDepartureMillis re-exported so the scan module
// does not import firebase helpers for anything else.
export { getDepartureMillis };
