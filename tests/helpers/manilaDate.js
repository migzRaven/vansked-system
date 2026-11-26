// =============================================
// ASIA/MANILA CALENDAR DATE (TEST FIXTURES)
// =============================================

// Mirrors the application's getManilaDate()
// semantics using a fixed UTC+8 shift evaluated
// through UTC date components. Java time-based
// Firestore rules cannot be unit-tested directly,
// so this helper provides deterministic fixture
// dates for the security-rules suite and lets the
// timezone tests below document and verify the
// expected UTC+8 boundary behavior.

export function manilaCalendarDate(dayOffset = 0, instant = Date.now()) {
  const shiftedMs =
    instant + 8 * 60 * 60 * 1000 + dayOffset * 24 * 60 * 60 * 1000;

  return new Date(shiftedMs).toISOString().slice(0, 10);
}

// Start of the given Manila calendar day as a UTC
// millisecond value. Manila midnight of date D is
// 16:00 UTC on the previous date; the explicit
// +08:00 offset expresses this without any
// timezone parsing.

export function manilaDayStartMs(dayOffset = 0) {
  return Date.parse(
    `${manilaCalendarDate(dayOffset)}T00:00:00+08:00`
  );
}

// Exclusive end of the given Manila calendar day.

export function manilaDayEndMs(dayOffset = 0) {
  return manilaDayStartMs(dayOffset) + 24 * 60 * 60 * 1000;
}
