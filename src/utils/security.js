/**
 * Kiddorin Security & Input Sanitization Utility
 * ------------------------------------------------
 * This module provides industry-standard sanitization and validation functions
 * to harden the application against Cross-Site Scripting (XSS), SQL Injection
 * payloads, DOM tampering, and bad data formatting.
 *
 * Note on SQL Injection:
 * Supabase client (@supabase/supabase-js) transmits queries via PostgREST using
 * parameterized prepared statements ($1, $2). This architecture natively blocks
 * all SQL injection attempts. The utilities below provide Defense-in-Depth.
 */

/**
 * Sanitizes string input by stripping dangerous HTML tags and script payloads.
 * Prevents Stored and Reflected XSS.
 *
 * @param {string} input - Raw string input from user
 * @returns {string} Sanitized string safe for display and database storage
 */
export function sanitizeString(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

/**
 * Strictly validates and normalizes barcode input.
 * Allows only alphanumeric characters and hyphens.
 *
 * @param {string} barcode - Raw barcode string
 * @returns {string|null} Clean uppercase barcode or null if invalid
 */
export function sanitizeBarcode(barcode) {
  if (!barcode || typeof barcode !== 'string') return null;
  const cleaned = barcode.replace(/[^A-Z0-9\-]/gi, '').toUpperCase().trim();
  if (cleaned.length === 0 || cleaned.length > 100) return null;
  return cleaned;
}

/**
 * Validates phone number input (Indian 10-digit format or international).
 * Prevents SQL wildcard injections or arbitrary string injection in phone search.
 *
 * @param {string} phone - Raw phone number
 * @returns {boolean} True if safe and valid phone format
 */
export function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleanPhone = phone.replace(/[\s\-\+\(\)]/g, '');
  return /^[0-9]{10,15}$/.test(cleanPhone);
}

/**
 * Validates numeric monetary or quantity amounts.
 * Prevents NaN exploits, overflow attacks, or negative number injections.
 *
 * @param {number|string} val - Input number
 * @param {boolean} allowNegative - Whether negative numbers are permitted
 * @returns {boolean} True if valid finite number
 */
export function isValidAmount(val, allowNegative = false) {
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) return false;
  if (!allowNegative && num < 0) return false;
  return true;
}

/**
 * Detects classic SQL injection keyword signatures in text inputs.
 * Useful for logging or early rejection of suspicious inputs.
 *
 * @param {string} text - User input string
 * @returns {boolean} True if potential SQL injection payload detected
 */
export function containsSqlInjectionPayload(text) {
  if (typeof text !== 'string') return false;
  const sqlKeywords = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|EXEC|EXECUTE|WHERE|FROM)\b|(--|\#|\/\*|\*\/|';|";))/i;
  return sqlKeywords.test(text);
}
