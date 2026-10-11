/**
 * 把 GeoNames 的城市表榨成一个这个 app 用得上的小文件。
 *
 *   node tools/cities/build-cities.mjs <geonames 目录> <输出的 .json>
 *
 * 输入是从 https://download.geonames.org/export/dump/ 下来的三份原始文件（CC BY 4.0）：
 * `cities15000.txt`（一万五千人以上的城市）、`admin1CodesASCII.txt`（一级行政区的名字）、
 * `countryInfo.txt`（国家的名字）。输出是一个按人口从多到少排好的数组，每行四项：
 *
 *   ["Oxford", "England", "United Kingdom", 171380]
 *
 * 为什么是数组不是对象：三万四千行，键名重复三万四千遍是白白一百多万字节。
 *
 * 为什么只留四项：这个 app 要的是「城市级」—— 认出 Oxford、挡住 Oxforrd、把它写成一个标准写法。
 * 坐标、时区、海拔都不在这件事里，而每留一项就是一兆的三十分之一。
 *
 * 重新生成：把那三份文件下到一个空目录里再跑这条命令。输出文件进 git（和字体子集一样的道理：
 * 构建不该依赖一次网络下载），所以它的大小是要盯着的 —— 现在两兆出头。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir, out] = process.argv.slice(2)
if (!dir || !out) {
  console.error('usage: node tools/cities/build-cities.mjs <geonames dir> <out.json>')
  process.exit(2)
}

const lines = (file) =>
  readFileSync(join(dir, file), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.startsWith('#'))

/** `GB.ENG` -> `England`。没有一级行政区的国家（新加坡、摩纳哥）不在这张表里。 */
const admin1 = new Map(
  lines('admin1CodesASCII.txt').map((l) => {
    const [code, name] = l.split('\t')
    return [code, name]
  }),
)

/** `GB` -> `United Kingdom`。 */
const countries = new Map(
  lines('countryInfo.txt').map((l) => {
    const cols = l.split('\t')
    return [cols[0], cols[4]]
  }),
)

const CITY = {
  name: 1,
  country: 8,
  admin1: 10,
  population: 14,
}

const rows = []
for (const line of lines('cities15000.txt')) {
  const cols = line.split('\t')
  const country = countries.get(cols[CITY.country])
  if (!country) continue
  const region = admin1.get(`${cols[CITY.country]}.${cols[CITY.admin1]}`) ?? ''
  const population = Number(cols[CITY.population]) || 0
  rows.push([cols[CITY.name], region, country, population])
}

// 人口从多到少：打三个字母时，先给的该是那个最可能被说起的城市。
rows.sort((a, b) => b[3] - a[3])
writeFileSync(out, JSON.stringify(rows))
console.log(`${rows.length} cities -> ${out}`)
