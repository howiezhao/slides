import { spawn } from 'node:child_process'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const slidevBin = fileURLToPath(new URL('../node_modules/@slidev/cli/bin/slidev.mjs', import.meta.url))

const siteBase = normalizeBase(readArg('--base') || process.env.BASE_PATH || '/')
const files = (await readdir(root))
  .filter(name => name.startsWith('slides-') && name.endsWith('.md'))
  .sort()

if (files.length === 0) {
  console.error('No slides-*.md files found.')
  process.exit(1)
}

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true })

const decks = []
for (const file of files) {
  const slug = file.slice('slides-'.length, -'.md'.length)
  const frontmatter = readFrontmatter(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'))
  const base = `${siteBase}${slug}/`
  console.log(`\nBuilding ${file} → dist/${slug}/  base ${base}`)
  await run(process.execPath, [
    slidevBin,
    'build',
    file,
    '--base',
    base,
    '--out',
    `dist/${slug}`,
    '--router-mode',
    'hash',
  ])
  decks.push({
    slug,
    title: frontmatter.title || slug,
    date: frontmatter.date || '',
  })
}

decks.sort((a, b) => {
  if (a.date && b.date)
    return b.date.localeCompare(a.date)
  if (a.date)
    return -1
  if (b.date)
    return 1
  return a.title.localeCompare(b.title)
})

await writeFile(new URL('../dist/index.html', import.meta.url), renderIndex(decks))
await writeFile(new URL('../dist/.nojekyll', import.meta.url), '')
console.log(`\nWrote dist/index.html with ${decks.length} deck${decks.length === 1 ? '' : 's'}.`)

function readArg(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function normalizeBase(value) {
  let base = value.trim() || '/'
  if (!base.startsWith('/'))
    base = `/${base}`
  if (!base.endsWith('/'))
    base = `${base}/`
  return base
}

function readFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match)
    return {}
  const data = {}
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!field)
      continue
    let value = field[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1)
    data[field[1]] = value
  }
  return data
}

function renderIndex(decks) {
  const items = decks.map(deck => `
        <li>
          <a href="./${escapeAttribute(deck.slug)}/">
            <span class="title">${escapeHtml(deck.title)}</span>
            ${deck.date ? `<span class="meta">${escapeHtml(deck.date)}</span>` : ''}
          </a>
        </li>`).join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Slides</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #121212;
      color: #f2f2f2;
      font: 18px/1.5 Georgia, "Iowan Old Style", Palatino, serif;
    }
    main {
      max-width: 40rem;
      margin: 0 auto;
      padding: 4.5rem 1.5rem 6rem;
    }
    h1 {
      margin: 0 0 2rem;
      font-size: 2.6rem;
      font-weight: 500;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li + li { border-top: 1px solid #2c2c2c; }
    a {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding: 1.15rem 0;
      color: inherit;
      text-decoration: none;
    }
    a:hover .title { color: #8eb4c4; }
    .title { font-size: 1.35rem; }
    .meta { color: #8d8d8d; font-size: 0.95rem; }
  </style>
</head>
<body>
  <main>
    <h1>Slides</h1>
    <ul>${items}
    </ul>
  </main>
</body>
</html>
`
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", '&#39;')
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0)
        resolve()
      else
        reject(new Error(`${command} exited with ${code}`))
    })
  })
}
