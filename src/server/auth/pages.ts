import type { Translator } from '../../platform/i18n/catalog.js'

/** Minimal HTML-escape for values rendered inside server templates. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface PageFrame {
  t: Translator
  title: string
  body: string
}

/** Complete, server-rendered HTML document (locale-aware `lang` attribute). */
export function renderPage({ t, title, body }: PageFrame): string {
  return `<!doctype html>
<html lang="${escapeHtml(t.locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body>
${body}
</body>
</html>
`
}

export interface AuthFormPageInput {
  t: Translator
  csrfToken: string
  next?: string
  error?: string
  /** Current form field values to keep on a re-render. */
  values?: { email?: string; displayName?: string }
}

function form(
  action: string,
  csrfToken: string,
  next: string | undefined,
  fieldsHtml: string,
  submitLabel: string,
): string {
  return `<form method="post" action="${escapeHtml(action)}">
  <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
  <input type="hidden" name="next" value="${escapeHtml(next ?? '')}">
${fieldsHtml}
  <button type="submit">${escapeHtml(submitLabel)}</button>
</form>`
}

export function renderSignInPage(input: AuthFormPageInput): string {
  const { t, csrfToken, next, error, values } = input
  const errorHtml = error ? `<p role="alert">${escapeHtml(error)}</p>` : ''
  const body = `
<h1>${escapeHtml(t.translate('auth.sign_in_title'))}</h1>
${errorHtml}
${form(
  `/${t.locale}/auth/sign-in`,
  csrfToken,
  next,
  `  <label>${escapeHtml(t.translate('auth.email'))}
    <input type="email" name="email" autocomplete="email" required value="${escapeHtml(values?.email ?? '')}">
  </label>
  <label>${escapeHtml(t.translate('auth.password'))}
    <input type="password" name="password" autocomplete="current-password" required>
  </label>`,
  t.translate('auth.sign_in'),
)}
<p>${escapeHtml(t.translate('auth.no_account'))} <a href="/${t.locale}/auth/register${next ? `?next=${encodeURIComponent(next)}` : ''}">${escapeHtml(t.translate('auth.register'))}</a></p>
`
  return renderPage({ t, title: t.translate('auth.sign_in_title'), body })
}

export function renderRegisterPage(input: AuthFormPageInput): string {
  const { t, csrfToken, next, error, values } = input
  const errorHtml = error ? `<p role="alert">${escapeHtml(error)}</p>` : ''
  const body = `
<h1>${escapeHtml(t.translate('auth.register_title'))}</h1>
${errorHtml}
${form(
  `/${t.locale}/auth/register`,
  csrfToken,
  next,
  `  <label>${escapeHtml(t.translate('auth.email'))}
    <input type="email" name="email" autocomplete="email" required value="${escapeHtml(values?.email ?? '')}">
  </label>
  <label>${escapeHtml(t.translate('auth.display_name'))}
    <input type="text" name="displayName" autocomplete="name" required value="${escapeHtml(values?.displayName ?? '')}">
  </label>
  <label>${escapeHtml(t.translate('auth.password'))}
    <input type="password" name="password" autocomplete="new-password" minlength="8" required>
  </label>`,
  t.translate('auth.register'),
)}
<p>${escapeHtml(t.translate('auth.have_account'))} <a href="/${t.locale}/auth/sign-in${next ? `?next=${encodeURIComponent(next)}` : ''}">${escapeHtml(t.translate('auth.sign_in'))}</a></p>
`
  return renderPage({ t, title: t.translate('auth.register_title'), body })
}
