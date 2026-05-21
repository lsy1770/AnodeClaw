# 基础工具类添加说明

## 更新概述

根据用户需求，添加了基础工具类（Utility Tools），为 Agent 提供通用的数据处理和逻辑判断能力。

## 新增工具 (10个)

### 📅 时间/日期工具 (3个)

1. **get_current_time** - 获取当前时间
   - 支持多种格式：ISO、时间戳、可读格式、自定义格式
   - 支持时区转换
   - 用于：记录时间、生成时间戳、时间判断

2. **sleep** - 延迟/等待
   - 等待指定毫秒数（最大 60 秒）
   - 用于：操作间延迟、等待页面加载、模拟人类行为

3. **calculate_time** - 时间计算
   - 在基准时间上加减天/时/分/秒
   - 用于：计算截止日期、设置提醒、判断过期

### 📝 字符串工具 (2个)

4. **string_manipulate** - 字符串操作
   - 支持：trim、uppercase、lowercase、replace、substring、split、length、reverse
   - 用于：文本清理、格式化、转换

5. **regex_match** - 正则匹配
   - 支持正则表达式匹配
   - 支持标志（g、i、m）
   - 用于：格式验证、信息提取、模式识别

### 🔢 数学工具 (2个)

6. **calculate** - 数学计算
   - 支持：加减乘除、取模、幂、平方根、绝对值、取整、最大最小值
   - 用于：价格计算、坐标计算、统计分析

7. **random_number** - 随机数生成
   - 生成指定范围的整数或浮点数
   - 用于：随机延迟、随机选择、测试数据

### 🔀 逻辑工具 (1个)

8. **conditional** - 条件判断
   - 支持：equals、not_equals、greater_than、less_than、contains、starts_with、ends_with、is_empty、is_null
   - 用于：流程控制、数据验证、条件分支

### 📦 集合工具 (1个)

9. **array_manipulate** - 数组操作
   - 支持：length、includes、slice、join、sort、reverse、first、last、unique
   - 用于：列表处理、去重、排序、查找

### 🔐 编码工具 (1个)

10. **encode_decode** - 编码/解码
    - 支持：Base64 编码/解码、URL 编码/解码
    - 用于：API 参数处理、数据传输、文件名编码

## 文件修改

### 新增文件

1. **src/tools/builtin/UtilityTools.ts** (946 行)
   - 实现了全部 10 个工具
   - 完整的参数验证
   - 详细的错误处理

2. **docs/Utility-Tools-Guide.md** (完整使用指南)
   - 每个工具的详细说明
   - 参数说明和示例
   - 实际应用场景
   - 最佳实践

### 修改文件

1. **src/tools/types.ts**
   - 在 `category` 类型中添加 `'utility'`

2. **src/tools/builtin/index.ts**
   - 导入 `utilityTools`
   - 添加到 `builtinTools` 数组
   - 导出 `utilityTools`

## 技术特性

### 1. 类型安全
- 所有工具使用 Zod schema 验证参数
- TypeScript 严格类型检查
- 参数默认值支持

### 2. 错误处理
- 统一的错误返回格式
- 详细的错误信息
- Try-catch 保护

### 3. 性能优化
- 纯函数实现（无副作用）
- 所有工具标记为 `parallelizable: true`（sleep 除外）
- 最小化依赖

### 4. 易用性
- 清晰的参数命名
- 合理的默认值
- 丰富的操作类型

## 使用示例

### 示例 1：智能延迟
```javascript
// 模拟人类操作的随机延迟
const delay = await random_number({ min: 1000, max: 3000 });
await sleep({ duration: delay.result });
await android_click_element({ text: "登录" });
```

### 示例 2：数据处理
```javascript
// 提取价格并计算折扣
const priceMatch = await regex_match({
  input: "原价: ¥100",
  pattern: '\\d+'
});
const price = parseInt(priceMatch.matches[0]);
const discounted = await calculate({
  operation: 'multiply',
  a: price,
  b: 0.8
});
```

### 示例 3：条件判断
```javascript
// 检查时间范围
const now = await get_current_time({ format: 'time' });
const isWorkTime = await conditional({
  operation: 'contains',
  value1: now.time,
  value2: '09:' // 9 点到 10 点之间
});
```

### 示例 4：文本清理
```javascript
// 清理和格式化用户输入
const trimmed = await string_manipulate({
  input: "  Hello World  ",
  operation: 'trim'
});
const lower = await string_manipulate({
  input: trimmed.result,
  operation: 'lowercase'
});
```

## 应用场景

### 1. 自动化脚本
- 时间控制（定时任务、延迟）
- 数据处理（格式化、验证）
- 流程控制（条件判断、循环）

### 2. 数据采集
- 文本提取（正则匹配）
- 数据清洗（去重、排序）
- 格式转换（编码、解码）

### 3. 智能交互
- 随机延迟（模拟人类）
- 动态计算（价格、数量）
- 条件响应（根据内容决策）

## 与其他工具的配合

### 配合 Android 工具
```javascript
// 获取屏幕信息 → 处理数据 → 执行操作
const screen = await android_describe_screen();
const button = screen.interactiveElements.elements[0];

// 使用字符串工具处理文本
const cleanText = await string_manipulate({
  input: button.text,
  operation: 'trim'
});

// 条件判断
const shouldClick = await conditional({
  operation: 'equals',
  value1: cleanText.result,
  value2: '登录'
});

if (shouldClick.result) {
  await android_click_element({ text: cleanText.result });
}
```

### 配合文件工具
```javascript
// 生成带时间戳的文件名
const time = await get_current_time({
  format: 'custom',
  customFormat: 'YYYY-MM-DD_HH-mm-ss'
});

const filename = `screenshot_${time.time}.png`;
await android_screenshot({ path: `./screenshots/${filename}` });
```

## 性能影响

- **计算开销**：极小，都是纯计算/字符串操作
- **内存占用**：可忽略（无状态，无缓存）
- **并发支持**：除 `sleep` 外，所有工具可并行
- **响应时间**：< 1ms（除 `sleep` 需要实际等待）

## 未来扩展

可能添加的工具：

1. **JSON 工具**
   - JSON 解析/序列化
   - JSON 路径查询
   - JSON 合并

2. **加密工具**
   - MD5/SHA 哈希
   - AES 加密/解密

3. **日期高级工具**
   - 日期差值计算
   - 日期格式化（更丰富）
   - 时区转换（更完善）

4. **数据转换工具**
   - CSV 解析
   - XML 解析
   - 数据类型转换

## 总结

基础工具类为 Agent 提供了 10 个实用工具，覆盖了：
- ⏰ 时间处理
- 📝 字符串操作
- 🔢 数学计算
- 🔀 逻辑判断
- 📦 数组操作
- 🔐 编码转换

这些工具可以：
- ✅ 单独使用
- ✅ 组合使用
- ✅ 与其他工具配合
- ✅ 提高自动化能力

**推荐使用顺序**：
1. `sleep`、`get_current_time` - 最常用
2. `conditional`、`string_manipulate` - 核心逻辑
3. `calculate`、`array_manipulate` - 数据处理
4. 其他工具 - 按需使用

详细使用指南：`docs/Utility-Tools-Guide.md`
