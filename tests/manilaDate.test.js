import test from "node:test";
import assert from "node:assert/strict";

import {
  manilaCalendarDate,
  manilaDayStartMs,
} from "./helpers/manilaDate.js";

// =============================================
// NANOSECOND INTERVAL MIRROR
// =============================================

// Deterministic mirror of the documented rule
// formula in Firestore rules (manilaDayStart/
// manilaDayEnd), implemented with integer
// seconds and BigInt nanoseconds. These tests
// verify the intended boundary arithmetic;
// they do NOT validate the actual security
// rules, which require the Firestore Emulator.

const NS_PER_SEC = 1000000000n;
const NS_PER_DAY = 86400n * NS_PER_SEC;

function mirrorManilaDayInterval(nowSec, nowNanos) {
  const shifted = new Date(
    (nowSec + 8 * 3600) * 1000
  );

  const secondsIntoDay =
    shifted.getUTCHours() * 3600 +
    shifted.getUTCMinutes() * 60 +
    shifted.getUTCSeconds();

  // (nowSec, nowNanos) - duration.value(secondsIntoDay, 's')
  //                    - duration.value(nowNanos, 'ns')
  //
  // The whole-second duration removes elapsed whole
  // seconds; the nanosecond duration removes the
  // exact fractional residue of request.time. The
  // two nanosecond terms cancel arithmetically,
  // leaving the boundary aligned on the exact
  // second regardless of request.time nanos.

  const startNanos =
    BigInt(nowSec) * NS_PER_SEC + BigInt(nowNanos)
    - BigInt(secondsIntoDay) * NS_PER_SEC
    - BigInt(nowNanos);

  return {
    startNanos,
    endNanos: startNanos + NS_PER_DAY,
  };
}

const inInterval = (interval, eventNanos) =>
  eventNanos >= interval.startNanos &&
  eventNanos < interval.endNanos;

// =============================================
// DETERMINISTIC ASIA/MANILA BOUNDARY TESTS
// =============================================

// The security rule computes the Manila date by
// shifting request.time forward exactly 8 hours
// and taking UTC components. These tests verify
// the equivalent calendar arithmetic, including
// boundary instants where UTC and Manila fall on
// different calendar dates.

test("Manila calendar date equals UTC date before 16:00 UTC", () => {
  const instant = Date.parse("2026-11-26T15:59:59Z");

  assert.equal(manilaCalendarDate(0, instant), "2026-11-26");
});

test("Manila calendar date rolls to the next day from 16:00 UTC", () => {
  const instant = Date.parse("2026-11-26T16:00:00Z");

  assert.equal(manilaCalendarDate(0, instant), "2026-11-27");
});

test("UTC and Manila calendar dates differ across the boundary", () => {
  const instant = Date.parse("2026-11-26T18:30:00Z");

  assert.equal(manilaCalendarDate(0, instant), "2026-11-27");

  const utcDate = new Date(instant).toISOString().slice(0, 10);

  assert.equal(utcDate, "2026-11-26");
  assert.notEqual(manilaCalendarDate(0, instant), utcDate);
});

test("Manila date helper crosses month and year boundaries", () => {
  assert.equal(
    manilaCalendarDate(0, Date.parse("2026-12-31T16:30:00Z")),
    "2027-01-01"
  );

  assert.equal(
    manilaCalendarDate(0, Date.parse("2027-01-01T02:00:00Z")),
    "2027-01-01"
  );
});

test("Day offsets produce consistent yesterday and tomorrow fixtures", () => {
  const instant = Date.parse("2026-11-26T09:00:00Z");

  assert.equal(manilaCalendarDate(-1, instant), "2026-11-25");
  assert.equal(manilaCalendarDate(1, instant), "2026-11-27");
});

test("Boundary interval: exactly at Manila midnight is allowed", () => {
  const startSec = Math.floor(manilaDayStartMs() / 1000);
  const interval = mirrorManilaDayInterval(startSec + 5, 0);

  assert.equal(inInterval(interval, interval.startNanos), true);
});

test("Boundary interval: one nanosecond before Manila midnight is denied", () => {
  const startSec = Math.floor(manilaDayStartMs() / 1000);
  const interval = mirrorManilaDayInterval(startSec + 5, 0);

  // The final nanosecond of the previous day.
  assert.equal(
    inInterval(interval, interval.startNanos - 1n),
    false
  );
});

test("Boundary interval: one nanosecond after Manila midnight is allowed", () => {
  const startSec = Math.floor(manilaDayStartMs() / 1000);
  const interval = mirrorManilaDayInterval(startSec + 5, 0);

  assert.equal(
    inInterval(interval, interval.startNanos + 1n),
    true
  );
});

test("Boundary interval: exactly the next Manila midnight is denied", () => {
  const startSec = Math.floor(manilaDayStartMs() / 1000);
  const interval = mirrorManilaDayInterval(startSec + 5, 0);

  assert.equal(
    inInterval(interval, interval.startNanos + NS_PER_DAY),
    false
  );
});

test("Fractional request.time nanoseconds do not shift the boundary", () => {
  const startSec = Math.floor(manilaDayStartMs() / 1000);

  const withoutResidue =
    mirrorManilaDayInterval(startSec + 5, 0).startNanos;

  const withResidue =
    mirrorManilaDayInterval(startSec + 5, 123456789).startNanos;

  assert.equal(withoutResidue % NS_PER_SEC, 0n);
  assert.equal(withResidue, withoutResidue);
});

test("Interval is exactly one day and stays correct across rollovers", () => {
  const cases = [
    Math.floor(Date.parse("2026-12-31T16:30:00Z") / 1000),
    Math.floor(Date.parse("2027-01-01T02:00:00Z") / 1000),
    Math.floor(Date.parse("2024-02-29T17:00:00Z") / 1000),
    Math.floor(Date.parse("2026-06-15T07:45:00Z") / 1000),
  ];

  for (const nowSec of cases) {
    const interval =
      mirrorManilaDayInterval(nowSec, 999999999);

    assert.equal(interval.endNanos - interval.startNanos, NS_PER_DAY);
    assert.equal(interval.startNanos % NS_PER_SEC, 0n);

    const startSec =
      Number(interval.startNanos / NS_PER_SEC);

    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(nowSec * 1000));

    // Recovering the Manila calendar date from the
    // boundary: the boundary instant sits at Manila
    // midnight, so shifting it forward 8 hours and
    // formatting in UTC reproduces the same date
    // Intl reports for the original instant.

    assert.equal(
      manilaCalendarDate(0, startSec * 1000),
      expected
    );
  }
});

test("Helper agrees with Intl Asia/Manila formatting near boundaries", () => {
  const boundaryInstants = [
    Date.parse("2026-11-26T15:59:59Z"),
    Date.parse("2026-11-26T16:00:00Z"),
    Date.parse("2026-11-26T16:00:01Z"),
    Date.parse("2026-02-28T16:30:00Z"),
    Date.parse("2024-02-29T16:30:00Z"),
    Date.parse("2026-12-31T16:30:00Z"),
    Date.parse("2026-06-15T07:45:00Z"),
  ];

  for (const instant of boundaryInstants) {
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(instant));

    assert.equal(
      manilaCalendarDate(0, instant),
      expected,
      `UTC instant ${new Date(instant).toISOString()}`
    );
  }
});
