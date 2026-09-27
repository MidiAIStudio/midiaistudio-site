'use strict';

/**
 * Stable device fingerprint for signup-bonus abuse prevention.
 *
 * App HWID (SHA256 of machine GUID + board UUID) is treated as a device
 * identity input. We never persist that value in signupBonusClaims — only
 * a server-side hash (fingerprint) is stored.
 */

const crypto = require('crypto');

const FINGERPRINT_NAMESPACE = 'midiai:signup_bonus:v1:';
const MIN_HWID_LEN = 16;

function normalizeHwid(value) {
  return String(value || '').trim().toUpperCase();
}

function isUsableHwid(value) {
  const n = normalizeHwid(value);
  return n.length >= MIN_HWID_LEN && /^[A-F0-9]+$/.test(n);
}

/**
 * @param {string} hwid Raw or app-computed HWID (never stored on claims).
 * @returns {string} Hex SHA-256 fingerprint, or '' if unusable.
 */
function deviceFingerprintFromHwid(hwid) {
  const n = normalizeHwid(hwid);
  if (!isUsableHwid(n)) return '';
  return crypto
    .createHash('sha256')
    .update(FINGERPRINT_NAMESPACE + n, 'utf8')
    .digest('hex');
}

module.exports = {
  FINGERPRINT_NAMESPACE,
  MIN_HWID_LEN,
  normalizeHwid,
  isUsableHwid,
  deviceFingerprintFromHwid
};
