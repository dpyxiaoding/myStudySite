// 搜索切词：建索引（config.mts）和搜索（theme/NavSearch.vue）用同一个规则。
// 搜索库默认按空格和标点切词，中文句子中间没有空格，一整句会变成一个词，
// 搜句子中间的词（比如用「推导」搜「列表推导式」）就搜不到。
// 这里把连续的中文切成相邻两字一组：列表推导式 → 列表 表推 推导 导式；英文和数字仍按单词切。
// 正则写在函数里面：VitePress 会把配置里的函数按源码发到浏览器，函数得自成一体
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  for (const part of text.split(/[\n\r\p{Z}\p{P}]+/u)) {
    let last = 0
    for (const m of part.matchAll(/[㐀-鿿豈-﫿]+/g)) {
      if (m.index > last) tokens.push(part.slice(last, m.index))
      const run = m[0]
      if (run.length === 1) tokens.push(run)
      for (let i = 0; i + 1 < run.length; i++) tokens.push(run.slice(i, i + 2))
      last = m.index + run.length
    }
    if (last < part.length) tokens.push(part.slice(last))
  }
  return tokens
}
