import type { FeatureModule } from '../types.js'
import { registerPlaceholderScreen } from '../shared/placeholder.js'

/** Checklists module (placeholder until the checklist capability lands). */
export const checklistsModule: FeatureModule = {
  id: 'checklists',
  labelKey: 'nav.checklists',
  icon: 'list',
  order: 3,
  register: (app, opts) => {
    registerPlaceholderScreen(
      app,
      { id: 'checklists', labelKey: 'nav.checklists', icon: 'list' },
      opts,
    )
  },
}
