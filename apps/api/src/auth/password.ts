import { hash, verify } from '@node-rs/argon2'

// @node-rs/argon2 而非 argon2：后者需要 node-gyp 本地编译，
// 在 Windows 开发机上是反复出现的摩擦源；前者提供预编译二进制。
// 默认算法即 argon2id。
export function hashPassword(plain: string): Promise<string> {
  return hash(plain)
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain)
  } catch {
    // 哈希格式损坏不该让调用方崩溃 —— 它和密码错误的结果是一样的。
    return false
  }
}
