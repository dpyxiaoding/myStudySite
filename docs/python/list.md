---
order: 3
summary: 第 3 课 · 创建与访问、增删、常用操作
---

# 列表

列表是 Python 里最常用的容器，用方括号表示，可以放任意类型的元素，也可以随时增删。

## 创建与访问

```python
fruits = ["apple", "banana", "cherry"]

print(fruits[0])    # apple，下标从 0 开始
print(fruits[-1])   # cherry，负数从末尾数
print(fruits[0:2])  # ['apple', 'banana']，切片不含结束位置
```

## 增加与删除

```python
fruits.append("durian")      # 末尾添加
fruits.insert(1, "blueberry")  # 插入到位置 1
fruits.remove("banana")      # 删除第一个 banana
last = fruits.pop()          # 弹出最后一个
```

::: warning 注意
`remove` 在元素不存在时会抛出 `ValueError`，删除前可以先用 `in` 判断。
:::

## 常用操作

| 写法 | 作用 |
| --- | --- |
| `len(lst)` | 元素个数 |
| `lst.sort()` | 原地排序 |
| `sorted(lst)` | 返回排好序的新列表 |
| `lst[::-1]` | 反转 |
| `x in lst` | 判断是否包含 |

## 小练习

1. 创建一个包含 5 个数字的列表，求出最大值和最小值
2. 把列表 `[3, 1, 2]` 排序后再反转
