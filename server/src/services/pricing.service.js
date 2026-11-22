/**
 * Estimation du coût d'une location selon la durée et l'option chauffeur.
 *
 * Grille : mois (30 jours) → semaines (7 jours) → jours. Un reliquat n'est jamais
 * facturé plus cher que la période supérieure (ex. 6 jours ≤ prix d'une semaine).
 * Les tarifs absents sont déduits des autres (jour = semaine / 7 = mois / 30…).
 */
const { AppError } = require('../utils/helpers');
const { DRIVER_MODES } = require('../utils/constants');

const MAX_DAYS = 365;
const round2 = (n) => Math.round(n * 100) / 100;
const val = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Coût d'une durée pour une grille { daily, weekly, monthly } ; null si aucun tarif. */
function periodCost(days, grid) {
  const d = val(grid.daily);
  const w = val(grid.weekly);
  const m = val(grid.monthly);
  const daily = d ?? (w != null ? w / 7 : m != null ? m / 30 : null);
  if (daily == null) return null;
  const weekly = w ?? daily * 7;
  const monthly = m ?? weekly * (30 / 7);

  const months = Math.floor(days / 30);
  const rest = days % 30;
  const weeks = Math.floor(rest / 7);
  const extra = rest % 7;
  const tail = Math.min(weeks * weekly + Math.min(extra * daily, weekly), monthly);
  return round2(months * monthly + tail);
}

/**
 * @param vehicle  véhicule (modèle ou objet sérialisé)
 * @param days     durée en jours (1 à 365)
 * @param withDriver  choix du client (ignoré si le mode impose la réponse)
 */
function quote(vehicle, { days = 1, withDriver = false } = {}) {
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) throw AppError.badRequest(`Durée invalide (1 à ${MAX_DAYS} jours)`);
  const mode = vehicle.driverMode || DRIVER_MODES.NONE;
  if (withDriver && mode === DRIVER_MODES.NONE) throw AppError.badRequest('Ce véhicule est proposé sans chauffeur uniquement');
  const driver = mode === DRIVER_MODES.INCLUDED || (mode === DRIVER_MODES.OPTIONAL && Boolean(withDriver));

  const vehicleCost = periodCost(n, { daily: vehicle.priceDaily, weekly: vehicle.priceWeekly, monthly: vehicle.priceMonthly });
  if (vehicleCost == null) throw AppError.badRequest('Tarif non renseigné pour ce véhicule');
  let driverCost = 0;
  if (driver && mode === DRIVER_MODES.OPTIONAL) {
    driverCost = periodCost(n, { daily: vehicle.driverPriceDaily, weekly: vehicle.driverPriceWeekly, monthly: vehicle.driverPriceMonthly }) ?? 0;
  }
  return {
    days: n,
    driverMode: mode,
    withDriver: driver,
    driverIncluded: mode === DRIVER_MODES.INCLUDED,
    vehicleCost,
    driverCost,
    total: round2(vehicleCost + driverCost),
    perDay: round2((vehicleCost + driverCost) / n),
    currency: vehicle.currency || 'USD',
  };
}

module.exports = { quote, periodCost, MAX_DAYS };
