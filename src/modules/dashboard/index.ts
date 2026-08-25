import type { FeatureModule } from '../types.js'
import { registerPlaceholderScreen } from '../shared/placeholder.js'

/**
 * Dashboard module: the locale home screen. Its route namespace is the locale
 * root (`/es`), the target of the root redirect.
 */
export const dashboardModule: FeatureModule = {
  id: 'dashboard',
  labelKey: 'nav.home',
  icon: 'home',
  order: 1,
  register: (app, opts) => {
    registerPlaceholderScreen(app, { id: 'dashboard', labelKey: 'nav.home', icon: 'home' }, opts)
  },
}
