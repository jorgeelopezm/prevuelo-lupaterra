import type { FeatureModule } from '../types.js'
import { registerPlaceholderScreen } from '../shared/placeholder.js'

/** Risk assessment module (placeholder until the risk capability lands). */
export const riskModule: FeatureModule = {
  id: 'risk',
  labelKey: 'nav.risk',
  icon: 'shield',
  order: 4,
  register: (app, opts) => {
    registerPlaceholderScreen(app, { id: 'risk', labelKey: 'nav.risk', icon: 'shield' }, opts)
  },
}
