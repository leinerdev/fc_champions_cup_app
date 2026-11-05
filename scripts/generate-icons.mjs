// Genera los iconos PNG de la PWA a partir de public/icon.svg
import sharp from 'sharp'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pub = path.join(root, 'public')
const svg = await readFile(path.join(pub, 'icon.svg'))
await mkdir(path.join(pub, 'icons'), { recursive: true })

const targets = [
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['icons/maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-48.png', 48],
]

for (const [file, size] of targets) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(path.join(pub, file))
  console.log('✔', file)
}
