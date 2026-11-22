/**
 * Logo ZwaCar — source unique (grille 64 × 64).
 * Un « Z » dont la barre supérieure est la silhouette d'un véhicule posé sur ses roues.
 * Couleurs unies (aucun dégradé), arrondi léger.
 */
const COLORS = { gold: '#947A26', white: '#FFFFFF', ink: '#16140F' };

// Carrosserie + vitres (découpées en « even-odd »)
const CAR =
  'M10 25 L11.2 20.4 Q12 18.4 14.6 18.1 L22.4 17.2 L28.4 12.4 Q29.8 11.3 31.9 11.3 L40.6 11.3 Q42.8 11.3 44.4 12.8 L49.2 17.4 L51.6 18 Q54 18.7 54 21.2 L54 25 Z ' +
  'M30.4 14 L35.6 14 L35.6 17.4 L26.3 17.4 L29.2 14.6 Q29.7 14 30.4 14 Z ' +
  'M37.6 14 L41 14 Q42.1 14 42.9 14.8 L45.6 17.4 L37.6 17.4 Z';
// Diagonale + barre inférieure du Z
const Z = 'M43 25 L54 25 L25 45.2 L54 45.2 L54 53 L10 53 L10 45.2 L39 25 Z';
const WHEELS = [
  [18.5, 25.6],
  [45.5, 25.6],
];

/**
 * @param {object} o
 * @param {number} [o.radius=6]      arrondi du fond (0 = carré plein, pour les icônes d'application)
 * @param {boolean} [o.background=true]
 */
function svg({ radius = 6, background = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="ZwaCar">
  ${background ? `<rect width="64" height="64" rx="${radius}" fill="${COLORS.gold}"/>` : ''}
  <path fill="${COLORS.white}" fill-rule="evenodd" d="${CAR}"/>
  <path fill="${COLORS.white}" d="${Z}"/>
  ${WHEELS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.7" fill="${COLORS.ink}"/><circle cx="${x}" cy="${y}" r="1.7" fill="${COLORS.white}"/>`).join('\n  ')}
</svg>
`;
}

module.exports = { COLORS, CAR, Z, WHEELS, svg };
