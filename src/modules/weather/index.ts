import type { FeatureModule } from '../types.js'
import { registerPlaceholderScreen } from '../shared/placeholder.js'

/** Weather & NOTAMs module (placeholder until the weather capability lands). */
export const weatherModule: FeatureModule = {
  id: 'weather',
  labelKey: 'nav.weather',
  icon: 'cloud',
  order: 2,
  register: (app, opts) => {
    registerPlaceholderScreen(app, { id: 'weather', labelKey: 'nav.weather', icon: 'cloud' }, opts)
  },
}
