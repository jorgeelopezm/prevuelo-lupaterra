import path from 'node:path'

/**
 * Returns the feature module a file belongs to (`null` for platform code, the
 * registry, tests, and `src/modules/shared` — shared module plumbing that any
 * module may import).
 */
function moduleDirOf(filePath) {
  if (!filePath) return null
  const norm = filePath.split('\\').join('/')
  const match = /\/src\/modules\/([^/]+)\//.exec(norm)
  if (!match) return null
  const dir = match[1]
  return dir === 'shared' ? null : dir
}

function resolveRelative(fromFile, specifier) {
  const base = path.posix.dirname(fromFile.split('\\').join('/'))
  return path.posix.normalize(path.posix.join(base, specifier))
}

/**
 * Feature-module isolation: a file inside `src/modules/<name>/` may import from
 * shared platform services and from its own directory (and `src/modules/shared`),
 * but never from another feature module's directory.
 */
export const moduleBoundaryRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Feature modules must not import another feature module\'s internals',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename()
    const fileModule = moduleDirOf(filename)
    if (!fileModule) return {}

    return {
      ImportDeclaration(node) {
        const specifier = node.source.value
        if (typeof specifier !== 'string') return
        const resolved = specifier.startsWith('.')
          ? resolveRelative(filename, specifier)
          : specifier
        const targetModule = moduleDirOf(resolved)
        if (targetModule && targetModule !== fileModule) {
          context.report({
            node,
            message: `Module '${fileModule}' must not import from another feature module ('${targetModule}'). Use shared platform services or src/modules/shared instead.`,
          })
        }
      },
    }
  },
}
