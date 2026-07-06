import type { FeedOptions, Item } from 'feed'
import { dirname } from 'node:path'
import fg from 'fast-glob'
import { Feed } from 'feed'
import fs from 'fs-extra'
import matter from 'gray-matter'
import MarkdownIt from 'markdown-it'

const DOMAIN = 'https://alexvolkihar.ovh'
const AUTHOR = {
  name: 'Alexvolkihar',
  email: 'hi@alexvolkihar.ovh',
  link: DOMAIN,
}
const markdown = MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
})

function normalizeDateInput(d: string | number | Date) {
  if (typeof d === 'number' && Number.isInteger(d) && d >= 1000 && d <= 9999)
    return `${d}-01-01`
  if (typeof d === 'string' && /^\d{4}$/.test(d.trim()))
    return `${d.trim()}-01-01`
  return d
}

async function run() {
  await buildBlogRSS()
}

async function buildBlogRSS() {
  const files = await fg('pages/posts/*.md')

  const options = {
    title: 'Alexvolkihar',
    description: 'Alexvolkihar\' Blog',
    id: 'https://alexvolkihar.ovh/',
    link: 'https://alexvolkihar.ovh/',
    copyright: 'CC BY-NC-SA 4.0 2021 © Alexvolkihar',
    feedLinks: {
      json: 'https://alexvolkihar.ovh/feed.json',
      atom: 'https://alexvolkihar.ovh/feed.atom',
      rss: 'https://alexvolkihar.ovh/feed.xml',
    },
  }
  const posts: any[] = (
    await Promise.all(
      files.filter(i => !i.includes('index'))
        .map(async (i) => {
          const raw = await fs.readFile(i, 'utf-8')
          const { data, content } = matter(raw)

          if (data.lang !== 'en')
            return

          const html = markdown.render(content)
            .replace('src="/', `src="${DOMAIN}/`)

          if (data.image?.startsWith('/'))
            data.image = DOMAIN + data.image

          return {
            ...data,
            date: new Date(normalizeDateInput(data.date)),
            content: html,
            author: [AUTHOR],
            link: DOMAIN + i.replace(/^pages(.+)\.md$/, '$1'),
          }
        }),
    ))
    .filter(Boolean)

  posts.sort((a, b) => +new Date(normalizeDateInput(b.date)) - +new Date(normalizeDateInput(a.date)))

  await writeFeed('feed', options, posts)
}

async function writeFeed(name: string, options: FeedOptions, items: Item[]) {
  options.author = AUTHOR
  options.image = 'https://alexvolkihar.ovh/avatar.png'
  options.favicon = 'https://alexvolkihar.ovh/logo.png'

  const feed = new Feed(options)

  items.forEach(item => feed.addItem(item))
  // items.forEach(i=> console.log(i.title, i.date))

  await fs.ensureDir(dirname(`./dist/${name}`))
  await fs.writeFile(`./dist/${name}.xml`, feed.rss2(), 'utf-8')
  await fs.writeFile(`./dist/${name}.atom`, feed.atom1(), 'utf-8')
  await fs.writeFile(`./dist/${name}.json`, feed.json1(), 'utf-8')
}

run()
