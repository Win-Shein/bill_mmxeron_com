'use strict';

/**
 * German VAT (UStG) exemption rules for cross-border / small-business cases.
 *
 * These are deliberately simplified for a single-user freelance/agency
 * context billing B2B clients outside Germany (primarily Myanmar). They are
 * NOT a substitute for advice from a Steuerberater, but encode the two most
 * common exemption clauses so they are applied consistently and printed on
 * every issued invoice.
 */

const EU_COUNTRIES = new Set([
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Czechia',
  'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland',
  'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland',
  'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
]);

const DRITTLAND_CLAUSE =
  'Steuerfreier Auslandsumsatz (Drittland) / Service not subject to German VAT according to § 3a Abs. 2 UStG.';
const KLEINUNTERNEHMER_CLAUSE = 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.';

function isEuCountry(country) {
  if (!country) return false;
  return EU_COUNTRIES.has(String(country).trim());
}

/**
 * Decide the VAT rate + legal clause for an invoice being issued.
 * Returns { vat_rate, vat_exemption_reason } where vat_rate is a number
 * (0 when exempt) or `null` when normal EU VAT rules apply (no override —
 * the invoice's own line-item tax rates are used as-is).
 */
function computeVatExemption({ clientCountry, isKleinunternehmer }) {
  if (isKleinunternehmer) {
    return { vat_rate: 0, vat_exemption_reason: KLEINUNTERNEHMER_CLAUSE };
  }
  if (!isEuCountry(clientCountry)) {
    return { vat_rate: 0, vat_exemption_reason: DRITTLAND_CLAUSE };
  }
  return { vat_rate: null, vat_exemption_reason: null };
}

module.exports = { EU_COUNTRIES, isEuCountry, computeVatExemption, DRITTLAND_CLAUSE, KLEINUNTERNEHMER_CLAUSE };
