import type { FeatureModule } from '../types.js'
import { registerPlaceholderScreen } from '../shared/placeholder.js'

/** Documents & AIS module (placeholder until the retrieval capability lands). */
export const documentsModule: FeatureModule = {
  id: 'documents',
  labelKey: 'nav.documents',
  icon: 'book',
  order: 6,
  register: (app, opts) => {
    registerPlaceholderScreen(
      app,
      { id: 'documents', labelKey: 'nav.documents', icon: 'book' },
      opts,
    )
  },
}
