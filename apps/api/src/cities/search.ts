import rows from './cities.json'

/**
 * 城市的那张表，和在上面找东西。
 *
 * 表是 GeoNames 的 `cities15000`（一万五千人以上的三万四千个城市，CC BY 4.0），`tools/cities/`
 * 里那个脚本榨出来的，打进镜像 —— 不是一个外部服务。理由写在 `tests/cities.test.ts` 的开头：
 * 「你在输入框里打的每一个字母发给第三方」是另一种东西，而城市级的校验这张表就够了。
 *
 * 一兆半的 JSON 在构建时被 tsup 内联进 dist，进程起来就在内存里，所以这里没有数据库、没有索引，
 * 也没有一次网络往返。三万四千行线性扫一遍是微秒级的事，而这个 app 的并发是一个人。
 */

type Row = [name: string, region: string, country: string, population: number]
const CITIES = rows as Row[]

export type City = {
  /** 一个标准写法：`Oxford, England, United Kingdom`。存下来的就是它。 */
  label: string
  name: string
  region: string | null
  country: string
}

/** 打字时不分大小写，也不该被变音符号挡住：`zurich` 要找得到 `Zürich`。 */
const plain = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * 一个标准写法。
 *
 * 重复的那一节不写两遍：北京的一级行政区就叫北京（`Beijing, Beijing, China`），写一遍就够。
 */
function labelOf([name, region, country]: Row): string {
  const parts = [name, region, country].filter((p) => p !== '')
  return [...new Set(parts)].join(', ')
}

/** 至少三个字母才查：一两个字母不是在找城市，是刚开始打字。 */
const MIN_QUERY = 3
/** 一次最多八个：再多，下拉框就成了一本名录。 */
const MAX_HITS = 8

/**
 * 找城市。
 *
 * 以查询开头的排在前面，其次是名字里含有它的；同一档里人口多的在前 —— 打 `oxf` 的人九成在说
 * 英格兰那个 Oxford，而不是密西西比那个。表本身已按人口排好，所以这里只要保持相对次序。
 */
export function findCities(query: string): City[] {
  const q = plain(query.trim())
  if (q.length < MIN_QUERY) return []

  const starts: City[] = []
  const contains: City[] = []
  for (const row of CITIES) {
    const name = plain(row[0])
    if (name.startsWith(q)) starts.push(cityOf(row))
    else if (name.includes(q)) contains.push(cityOf(row))
    if (starts.length >= MAX_HITS) break
  }
  return [...starts, ...contains].slice(0, MAX_HITS)
}

function cityOf(row: Row): City {
  return { label: labelOf(row), name: row[0], region: row[1] || null, country: row[2] }
}
