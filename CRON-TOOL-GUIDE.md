# Cron Scheduler Tool - 使用文档

## 📋 概述

Cron Scheduler 是基于 ACS Timer API 构建的类 cron 定时任务工具。支持标准 cron 表达式，可以灵活地安排各种周期性任务。

### 特性

- ✅ 标准 5 位 cron 表达式
- ✅ 灵活的时间调度（分钟、小时、日、月、星期）
- ✅ 自动重新调度
- ✅ 任务持久化（应用重启后恢复）
- ✅ 完整的任务管理（列表、删除）
- ✅ 精确触发（基于 AlarmManager）
- ✅ 低电量模式支持

## 🚀 快速开始

### 1. 添加 Cron 任务

```javascript
// 通过 ClawdBot 对话
> 添加一个 cron 任务，每天午夜清理临时文件

// 或者直接调用工具
cron_add {
  name: "daily_cleanup",
  cronExpression: "0 0 * * *",
  callback: "console.log('清理任务执行')",
  description: "每日清理任务"
}
```

### 2. 查看所有任务

```javascript
> 列出所有 cron 任务

// 返回所有任务及其状态
cron_list
```

### 3. 删除任务

```javascript
> 删除 cron 任务 daily_cleanup

cron_delete {
  name: "daily_cleanup"
}
```

## 📖 Cron 表达式

### 表达式格式

```
 ┌────────── 分钟 (0-59)
 │ ┌────────── 小时 (0-23)
 │ │ ┌────────── 日 (1-31)
 │ │ │ ┌────────── 月 (1-12)
 │ │ │ │ ┌────────── 星期 (0-6, 0=周日)
 │ │ │ │ │
 * * * * *
```

### 特殊字符

| 字符 | 含义 | 示例 |
|------|------|------|
| `*` | 任意值 | `* * * * *` = 每分钟 |
| `,` | 值列表 | `1,15,30 * * * *` = 每小时的1分、15分、30分 |
| `-` | 值范围 | `0 9-17 * * *` = 9点到17点每小时 |
| `/` | 步长值 | `*/15 * * * *` = 每15分钟 |

### 常用表达式

| 表达式 | 说明 | 触发时间 |
|--------|------|----------|
| `0 0 * * *` | 每天午夜 | 00:00 |
| `30 9 * * 1-5` | 工作日上午 | 周一到周五 09:30 |
| `0 */2 * * *` | 每2小时 | 00:00, 02:00, 04:00... |
| `15,45 * * * *` | 每小时2次 | xx:15, xx:45 |
| `0 0 1 * *` | 每月1号 | 每月1号 00:00 |
| `0 12 * * 0` | 每周日中午 | 周日 12:00 |
| `*/10 * * * *` | 每10分钟 | 每10分钟 |
| `0 9 1,15 * *` | 每月两次 | 每月1号和15号 09:00 |

## 🛠️ 工具详解

### cron_add - 添加任务

添加一个新的 cron 任务。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 任务名称（唯一标识） |
| `cronExpression` | string | ✅ | Cron 表达式（5位格式） |
| `callback` | string | ✅ | JavaScript 代码字符串 |
| `description` | string | ❌ | 任务描述 |

**示例**:

```javascript
// 每天早上9点的提醒
cron_add {
  name: "morning_reminder",
  cronExpression: "0 9 * * *",
  callback: `
    console.log('☀️ 早安！');
    if (typeof globalApi !== 'undefined') {
      globalApi.toast('新的一天开始了！', 'short');
    }
  `,
  description: "每日早晨提醒"
}
```

**返回值**:

```json
{
  "success": true,
  "output": {
    "jobName": "morning_reminder",
    "cronExpression": "0 9 * * *",
    "nextRun": 1709179200000,
    "nextRunFormatted": "2024-02-28T01:00:00.000Z",
    "timerTaskId": "timer_123abc",
    "message": "Cron job \"morning_reminder\" created successfully"
  }
}
```

### cron_list - 列出任务

列出所有已创建的 cron 任务及其状态。

**参数**: 无

**示例**:

```javascript
cron_list
```

**返回值**:

```json
{
  "success": true,
  "output": {
    "jobs": [
      {
        "name": "morning_reminder",
        "cronExpression": "0 9 * * *",
        "description": "每日早晨提醒",
        "enabled": true,
        "nextRun": 1709179200000,
        "nextRunFormatted": "2024-02-28T01:00:00.000Z",
        "lastRun": 1709092800000,
        "lastRunFormatted": "2024-02-27T01:00:00.000Z",
        "runCount": 5,
        "createdAt": 1708660800000
      }
    ],
    "count": 1
  }
}
```

### cron_delete - 删除任务

删除指定的 cron 任务。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 要删除的任务名称 |

**示例**:

```javascript
cron_delete {
  name: "morning_reminder"
}
```

**返回值**:

```json
{
  "success": true,
  "output": {
    "jobName": "morning_reminder",
    "message": "Cron job \"morning_reminder\" deleted successfully"
  }
}
```

## 💡 实际应用场景

### 场景 1: 自动签到

```javascript
cron_add {
  name: "daily_checkin",
  cronExpression: "0 9 * * *",  // 每天 9:00
  callback: `
    console.log('🎯 开始自动签到');

    // 打开应用
    if (typeof auto !== 'undefined') {
      await auto.launchApp('com.example.app');
      await new Promise(r => setTimeout(r, 3000));

      // 点击签到按钮
      const btn = await auto.findOne(auto.selector().text('签到'));
      if (btn) {
        await btn.click();
        console.log('✅ 签到成功');
      }
    }
  `,
  description: "每日自动签到"
}
```

### 场景 2: 定时备份

```javascript
cron_add {
  name: "backup",
  cronExpression: "0 2 * * *",  // 每天 2:00
  callback: `
    console.log('💾 开始备份');

    if (typeof file !== 'undefined') {
      const data = file.read('/sdcard/important_data.json');
      const timestamp = new Date().toISOString().split('T')[0];
      file.write('/sdcard/backups/data_' + timestamp + '.json', data);
      console.log('✅ 备份完成');
    }
  `,
  description: "每日凌晨备份"
}
```

### 场景 3: 工作提醒

```javascript
cron_add {
  name: "work_reminders",
  cronExpression: "0 9,14,18 * * 1-5",  // 工作日 9、14、18点
  callback: `
    const hour = new Date().getHours();
    let message = '';

    if (hour === 9) message = '开始工作！';
    else if (hour === 14) message = '下午加油！';
    else if (hour === 18) message = '准备下班了！';

    console.log('⏰', message);

    if (typeof globalApi !== 'undefined') {
      globalApi.toast(message, 'short');
    }
  `,
  description: "工作日提醒"
}
```

### 场景 4: 数据同步

```javascript
cron_add {
  name: "data_sync",
  cronExpression: "*/30 * * * *",  // 每30分钟
  callback: `
    console.log('🔄 同步数据');

    if (typeof network !== 'undefined' && typeof file !== 'undefined') {
      try {
        const response = await network.get('https://api.example.com/data');
        file.write('/sdcard/sync_data.json', JSON.stringify(response));
        console.log('✅ 同步成功');
      } catch (error) {
        console.error('❌ 同步失败:', error);
      }
    }
  `,
  description: "定期数据同步"
}
```

### 场景 5: 周报提醒

```javascript
cron_add {
  name: "weekly_report",
  cronExpression: "0 16 * * 5",  // 每周五 16:00
  callback: `
    console.log('📊 周报提醒');

    if (typeof globalApi !== 'undefined') {
      globalApi.toast('别忘了写周报！', 'long');
    }
  `,
  description: "周五周报提醒"
}
```

## ⚠️ 注意事项

### 1. 回调字符串

- 回调必须是**字符串形式**的 JavaScript 代码
- 可以使用模板字符串编写复杂逻辑
- 不能直接传递函数引用

```javascript
// ✅ 正确
callback: "console.log('Hello')"

// ✅ 正确（模板字符串）
callback: `
  const time = new Date();
  console.log('Time:', time);
`

// ❌ 错误（函数引用）
callback: () => console.log('Hello')
```

### 2. 时间精度

- 基于 Android AlarmManager，精度为分钟级
- 在 Doze 模式下使用 `allowWhileIdle` 可保证触发
- 实际触发时间可能有几秒误差

### 3. 最小间隔

- 理论上支持每分钟触发（`* * * * *`）
- 高频任务（<5分钟）可能影响电池续航
- 建议最小间隔 >= 15 分钟

### 4. 任务持久化

- 任务保存在 `/sdcard/ACS/cron_jobs.json`
- 应用重启后会自动恢复任务
- 手动删除文件会清空所有任务

### 5. 错误处理

```javascript
// 在回调中添加 try-catch
callback: `
  try {
    // 你的代码
    console.log('执行任务');
  } catch (error) {
    console.error('任务执行失败:', error);
  }
`
```

## 🔍 故障排查

### 问题 1: 任务不触发

**症状**: cron_add 成功但任务不执行

**解决方案**:
1. 检查设备是否在 Doze 模式
2. 确认应用未被系统杀死
3. 查看 Timer API 日志
4. 使用 `cron_list` 检查任务状态

### 问题 2: 表达式错误

**症状**: `Invalid cron expression`

**解决方案**:
1. 确认表达式是 5 位格式
2. 检查字段范围是否正确
3. 测试表达式: [Crontab Guru](https://crontab.guru/)

### 问题 3: 回调执行错误

**症状**: 任务触发但回调失败

**解决方案**:
1. 在回调中添加 try-catch
2. 检查 console 输出
3. 确认使用的 API 在回调环境中可用

## 📚 相关文档

- [Timer API 文档](../timer_demo/README.md)
- [Cron 表达式参考](https://en.wikipedia.org/wiki/Cron)
- [Android AlarmManager](https://developer.android.com/reference/android/app/AlarmManager)

## 🎓 最佳实践

### 1. 合理选择时间间隔

```javascript
// ✅ 推荐：低频任务
"0 0 * * *"    // 每天一次
"0 */4 * * *"  // 每4小时一次

// ⚠️ 谨慎：高频任务
"*/5 * * * *"  // 每5分钟（耗电）
"* * * * *"    // 每分钟（非常耗电）
```

### 2. 错误处理和日志

```javascript
callback: `
  try {
    console.log('[Cron] 任务开始:', new Date().toISOString());

    // 你的任务代码
    doSomething();

    console.log('[Cron] 任务完成');
  } catch (error) {
    console.error('[Cron] 任务失败:', error.message);

    // 可选：记录到文件
    if (typeof file !== 'undefined') {
      const log = new Date().toISOString() + ' ERROR: ' + error.message + '\\n';
      file.append('/sdcard/ACS/cron_errors.log', log);
    }
  }
`
```

### 3. 条件执行

```javascript
callback: `
  // 只在周末执行
  const day = new Date().getDay();
  if (day !== 0 && day !== 6) {
    console.log('今天不是周末，跳过');
    return;
  }

  // 只在白天执行
  const hour = new Date().getHours();
  if (hour < 8 || hour > 20) {
    console.log('非工作时间，跳过');
    return;
  }

  // 执行任务
  doSomething();
`
```

### 4. 任务依赖

```javascript
// 任务A: 数据采集
cron_add {
  name: "data_collect",
  cronExpression: "0 */2 * * *",  // 每2小时
  callback: "collectData()"
}

// 任务B: 数据处理（依赖任务A）
cron_add {
  name: "data_process",
  cronExpression: "30 */2 * * *",  // 每2小时30分（比任务A晚30分钟）
  callback: "processData()"
}
```

---

**版本**: v1.0.0
**最后更新**: 2026-02-27
**维护者**: Anode ClawdBot 开发团队
