'use strict';

/**
 * Stable device fingerprint for signup-bonus abuse prevention.
 *
 * App HWID (SHA256 of machine GUID + board UUID) is an identity *input*.
 * Claims store only a server-side HMAC-SHA256 fingerprint so clients cannot
 * forge or choose fingerprint document IDs.
 */

const crypto = require('crypto');

const FINGERPRINT_NAMESPACE = 'midiai:signup_bonus:v1:';
const MIN_HWID_LEN = 16;

/** @type {string} */
let configuredSecret = String(process.env.SIGNUP_BONUS_HMAC_SECRET || '').trim();

function configureDeviceFingerprint({ secret } = {}) {
  if (secret != null) {
    configuredSecret = String(secret || '').trim();
  }
  return configuredSecret;
}

function getFingerprintSecret() {
  return String(configuredSecret || process.env.SIGNUP_BONUS_HMAC_SECRET || '').trim();
}

function normalizeHwid(value) {
  return String(value || '').trim().toUpperCase();
}

function isUsableHwid(value) {
  const n = normalizeHwid(value);
  return n.length >= MIN_HWID_LEN && /^[A-F0-9]+$/.test(n);
}

/**
 * @param {string} hwid App/device HWID (never stored on claims).
 * @param {string} [secretOverride]
 * @returns {string} Hex HMAC-SHA256 fingerprint, or '' if unusable / secret missing.
 */
function deviceFingerprintFromHwid(hwid, secretOverride) {
  const n = normalizeHwid(hwid);
  if (!isUsableHwid(n)) return '';
  const secret = String(secretOverride != null ? secretOverride : getFingerprintSecret()).trim();
  if (!secret) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(FINGERPRINT_NAMESPACE + n, 'utf8')
    .digest('hex');
}

module.exports = {
  FINGERPRINT_NAMESPACE,
  MIN_HWID_LEN,
  configureDeviceFingerprint,
  getFingerprintSecret,
  normalizeHwid,
  isUsableHwid,
  deviceFingerprintFromHwid
};
