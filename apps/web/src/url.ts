/**
 * 一条地址写成一行字：`github.com/lance1416/ctws`。
 *
 * host 一个人认得，但认不出是哪一个 repo、哪一条推 —— 一行写着 `x.com` 等于没有信息。查询串不
 * 要：utm 之类是噪音，而这一行本来就要在行宽里截断。
 *
 * 住在模块之外：reading 的一行链接和一个人的一条链接是同一件事，而两个模块不该互相 import。
 */
export function linkLabel(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, '')
  } catch {
    return url
  }
}
