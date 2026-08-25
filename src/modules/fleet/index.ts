import type { FeatureModule } from '../types.js'
import { registerPlaceholderScreen } from '../shared/placeholder.js'

/** Aircraft & Logbook module (placeholder until the fleet capability lands). */
export const fleetModule: FeatureModule = {
  id: 'fleet',
  labelKey: 'nav.aircraft',
  icon: 'plane',
  order: 5,
  register: (app, opts) => {
    registerPlaceholderScreen(app, { id: 'fleet', labelKey: 'nav.aircraft', icon: 'plane' }, opts)
  },
}
