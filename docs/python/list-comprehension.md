---
order: 4
summary: 第 4 课 · 条件过滤、嵌套、字典与集合推导式
---

# 列表推导式

列表推导式用一行代码从已有序列生成新列表。它比 for 循环加 append 更短，也更容易一眼看出「这段代码在生成什么」。

## 基本语法

列表推导式的结构是 `[表达式 for 变量 in 可迭代对象]`。读的时候从中间开始：对每个元素，算出表达式，再把结果收集成新列表。

```python
# 传统写法
squares = []
for x in range(1, 11):
    squares.append(x * x)

# 列表推导式
squares = [x * x for x in range(1, 11)]
print(squares)  # [1, 4, 9, ..., 100]
```

## 带条件过滤

在末尾加上 `if`，只保留满足条件的元素。

```python
scores = [52, 78, 91, 45, 66]
passed = [s for s in scores if s >= 60]   # [78, 91, 66]
```

::: tip 提示
过滤条件写在 for 之后，它决定「要不要这个元素」。
:::

## 条件表达式写在前面

如果每个元素都要保留，只是根据条件换成不同的值，就把 `if ... else` 写在 for 前面。

```python
labels = ["及格" if s >= 60 else "不及格" for s in scores]
```

::: warning 注意
写在前面的 if 必须带 else，写在后面的 if 不能带 else。这是最常见的报错来源。
:::

## 嵌套推导式

多个 for 从左到右对应外层到内层循环，常用来把二维列表展平。

```python
matrix = [[1, 2, 3], [4, 5, 6]]
flat = [n for row in matrix for n in row]   # [1, 2, 3, 4, 5, 6]
transposed = [[row[i] for row in matrix] for i in range(3)]
```

超过两层时，改回普通 for 循环通常更好读。

## 字典与集合推导式

把方括号换成花括号，就得到字典或集合推导式。

```python
words = ["apple", "banana", "cherry"]
lengths = {w: len(w) for w in words}   # {'apple': 5, 'banana': 6, 'cherry': 6}
initials = {w[0] for w in words}        # {'a', 'b', 'c'}
```

## 性能对比

对 10 万个整数求平方，三种写法的耗时大致如下。推导式通常最快，因为它省去了反复查找 append 方法。

| 写法 | 耗时 | 可读性 |
| --- | ---: | --- |
| for + append | 6.1 ms | 直观，但啰嗦 |
| 列表推导式 | 3.9 ms | 简洁 |
| map + lambda | 5.2 ms | 需要熟悉函数式写法 |

以上是示意数据，不同机器上结果会不同。

## 常见错误

- 在推导式里调用 `print` 等有副作用的函数，结果列表全是 `None`
- 把 `if` 和 `if ... else` 的位置写反
- 处理很大的数据却用了列表，应该改用生成器表达式 `( )`

## 小练习

1. 生成 1 到 20 中所有 3 的倍数
2. 把 `["a", "b", "c"]` 变成 `["A", "B", "C"]`
3. 统计一句英文里每个单词的长度，结果用字典表示

::: details 参考答案
```python
[x for x in range(1, 21) if x % 3 == 0]
[c.upper() for c in ["a", "b", "c"]]
{w: len(w) for w in "the quick brown fox".split()}
```
:::
