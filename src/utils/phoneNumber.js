
/**
 * VanSked telephone number utilities.
 *
 * Supports:
 * - Philippine mobile numbers: 09XXXXXXXXX
 * - Philippine mobile numbers: 9XXXXXXXXX
 * - Philippine landlines using domestic dialing format
 * - International numbers in E.164 format
 *
 * Returns a normalized international number or null.
 */

export const normalizePhoneNumber = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  let phone = value.trim();

  // Remove common telephone formatting characters.
  phone = phone.replace(/[\s().-]/g, "");

  // Reject letters, extensions, and unexpected characters.
  if (!/^\+?\d+$/.test(phone)) {
    return null;
  }

  // Convert international dialing prefix 00 to +.
  if (phone.startsWith("00")) {
    phone = `+${phone.slice(2)}`;
  }

  // Already in international format.
  if (phone.startsWith("+")) {
    const digits = phone.slice(1);

    if (!/^[1-9]\d{6,14}$/.test(digits)) {
      return null;
    }

    return `+${digits}`;
  }

  // Philippine domestic mobile or landline number.
  if (phone.startsWith("0")) {
    if (!/^0[2-9]\d{8,9}$/.test(phone)) {
      return null;
    }

    return `+63${phone.slice(1)}`;
  }

  // Philippine mobile number without its leading zero.
  if (/^9\d{9}$/.test(phone)) {
    return `+63${phone}`;
  }

  // Philippine number already containing country code.
  if (/^63[1-9]\d{6,11}$/.test(phone)) {
    return `+${phone}`;
  }

  return null;
};

/**
 * Returns a safe telephone link or null.
 */
export const getTelephoneHref = (value) => {
  const normalized = normalizePhoneNumber(value);

  return normalized ? `tel:${normalized}` : null;
};

/**
 * Checks whether a telephone number can be used.
 */
export const isValidPhoneNumber = (value) => {
  return normalizePhoneNumber(value) !== null;
};
