import { z } from 'zod'

/**
 * 城市，用来把「家乡」和「现居」写成一个标准写法。
 *
 * 只有城市级：一张打进镜像的表（GeoNames 的一万五千人以上城市，CC BY 4.0），不是一个外部服务。
 * 所以这里没有坐标、没有邮编、没有街道 —— 它们不在「城市级」这件事里。
 */
export const citySearchQuery = z.object({ q: z.string().trim().min(1).max(100) }).strict()
export type CitySearchQuery = z.infer<typeof citySearchQuery>

export const city = z
  .object({
    /** 一个标准写法：`Oxford, England, United Kingdom`。存进联系人的就是它。 */
    label: z.string(),
    name: z.string(),
    /** 一级行政区。新加坡、摩纳哥这样的国家没有。 */
    region: z.string().nullable(),
    country: z.string(),
  })
  .strict()
export type City = z.infer<typeof city>

export const citiesResponse = z.object({ cities: z.array(city) }).strict()
