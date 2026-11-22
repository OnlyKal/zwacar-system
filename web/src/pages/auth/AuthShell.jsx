import { motion } from 'framer-motion'
import { FiCreditCard, FiRefreshCw, FiShield } from 'react-icons/fi'
import Logo from '../../components/Logo'

const GOLD = '#d2b65c'
const ease = [0.22, 1, 0.36, 1]

/** Grille de fond animée (traits unis, aucun dégradé). */
const Grid = () => (
  <svg className="auth-grid" aria-hidden="true">
    <defs>
      <pattern id="auth-cell" width="48" height="48" patternUnits="userSpaceOnUse">
        <path d="M48 0H0V48" fill="none" stroke="#1d1b15" strokeWidth="1" />
        <circle cx="0" cy="0" r="1.3" fill="#2c281e" />
      </pattern>
    </defs>
    <rect className="auth-grid-move" x="0" y="0" width="200%" height="200%" fill="url(#auth-cell)" />
  </svg>
)

/** Véhicule en tracé filaire, dessiné progressivement, avec balayage « scanner ». */
const HudCar = () => (
  <svg viewBox="0 0 760 300" fill="none" aria-hidden="true">
    {/* cotes */}
    <path className="hud-draw" pathLength="1" d="M40 34 H724 M40 26 V42 M724 26 V42" stroke="#3a352a" strokeWidth="1.5" />
    <text x="382" y="22" fill="#6f6a5c" fontSize="10" letterSpacing="3" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace">ZWACAR · FLEET SCAN</text>
    {/* carrosserie */}
    <path
      className="hud-draw"
      pathLength="1"
      d="M40 210 L52 170 Q60 150 100 146 L240 138 L320 82 Q340 68 380 66 L500 66 Q540 66 570 92 L640 140 L700 150 Q722 156 724 186 L724 210 L650 210 A50 50 0 0 0 550 210 L230 210 A50 50 0 0 0 130 210 Z"
      stroke={GOLD}
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    {/* vitres */}
    <path className="hud-draw d2" pathLength="1" d="M335 92 Q348 82 380 82 L440 82 L440 136 L270 136 Z" stroke={GOLD} strokeOpacity=".55" strokeWidth="1.6" />
    <path className="hud-draw d2" pathLength="1" d="M456 82 L500 82 Q530 82 552 102 L586 136 L456 136 Z" stroke={GOLD} strokeOpacity=".55" strokeWidth="1.6" />
    <path className="hud-draw d3" pathLength="1" d="M60 182 H716 M690 166 H712" stroke={GOLD} strokeOpacity=".3" strokeWidth="1.4" />
    {/* roues */}
    {[180, 600].map((cx) => (
      <g key={cx}>
        <circle className="hud-draw d2" pathLength="1" cx={cx} cy="212" r="40" stroke={GOLD} strokeWidth="2" />
        <circle className="hud-spin" cx={cx} cy="212" r="27" stroke={GOLD} strokeOpacity=".7" strokeWidth="2" strokeDasharray="6 8" />
        <circle cx={cx} cy="212" r="6" fill={GOLD} />
        <circle className="hud-spin slow" cx={cx} cy="212" r="52" stroke="#3a352a" strokeWidth="1" strokeDasharray="2 10" />
      </g>
    ))}
    {/* sol */}
    <path d="M0 262 H760" stroke="#2c281e" strokeWidth="1.5" strokeDasharray="4 10" />
    {/* points d'analyse */}
    {[
      [320, 82],
      [640, 140],
      [100, 146],
    ].map(([x, y], i) => (
      <g key={i}>
        <circle cx={x} cy={y} r="4" fill="#0b0a08" stroke={GOLD} strokeWidth="2" />
        <circle cx={x} cy={y} r="10" stroke={GOLD} strokeOpacity=".35" className="hud-spin slow" strokeDasharray="3 4" />
      </g>
    ))}
    {/* balayage */}
    <g className="hud-scan">
      <path d="M0 48 V262" stroke={GOLD} strokeOpacity=".75" strokeWidth="1.5" />
      <rect x="-3" y="48" width="6" height="6" fill={GOLD} />
    </g>
  </svg>
)

const chip = (delay) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease } })

export default function AuthShell({ children }) {
  return (
    <div className="auth">
      <Grid />
      <div className="auth-visual">
        <div className="brand">
          <Logo size={44} />
          <div>
            <div className="brand-name">ZwaCar</div>
            <div className="brand-sub">Plateforme de location de véhicules</div>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }}>
          <span className="auth-tag"><i /> Espace professionnel</span>
          <h2>
            Pilotez votre flotte. <em>Publiez. Louez.</em> En temps réel.
          </h2>
          <p>Véhicules, équipe, wallet de crédits, statistiques et documents réunis dans un seul poste de pilotage.</p>
        </motion.div>

        <div className="auth-hud">
          <HudCar />
          <motion.div className="hud-chip" style={{ left: '2%', top: '30%' }} {...chip(1.2)}>
            RENOUVELLEMENT<strong><span>Automatique</span></strong>
          </motion.div>
          <motion.div className="hud-chip" style={{ left: '41%', bottom: '-2%' }} {...chip(1.45)}>
            STATUT<strong>En ligne</strong>
          </motion.div>
          <motion.div className="hud-chip" style={{ right: '0%', top: '24%' }} {...chip(1.7)}>
            PAIEMENT<strong>Mobile <span>Money</span></strong>
          </motion.div>
        </div>

        <div className="auth-feats">
          <div><FiShield /> Données isolées et chiffrées</div>
          <div><FiRefreshCw /> Renouvellement automatique</div>
          <div><FiCreditCard /> Factures et reçus PDF</div>
        </div>
      </div>

      <div className="auth-form">
        <motion.div className="auth-card" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease }}>
          <div className="brand auth-mini" style={{ padding: 0 }}>
            <Logo size={44} />
            <div className="brand-name">ZwaCar</div>
          </div>
          {children}
          <div className="auth-foot"><i /> Connexion sécurisée · session chiffrée</div>
        </motion.div>
      </div>
    </div>
  )
}
