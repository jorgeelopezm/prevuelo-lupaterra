// Lint fixture (task 7.8): a feature module importing another feature module's
// internals must be rejected by the `module-boundary/no-cross-module-import`
// rule. Excluded from the main lint run via eslint.config.js `ignores`; the
// boundary test lints it explicitly with the rule active.
import { documentsModule } from '../../documents/index.js'

// Reference the import so the fixture stays type-valid (and unused-import lint
// rules stay quiet for readers).
void documentsModule
