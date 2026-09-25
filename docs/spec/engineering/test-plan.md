# 测试计划

## 1. 测试目标

重点覆盖：

- 写作作业权限。
- 提交状态机。
- 语法检测位置和失败处理。
- 停留/离开追踪。
- 复制粘贴违规记录。
- 现有口语功能回归。

不追求形式化 100% 覆盖率。

## 2. 后端 Unit Test

### TU-001 字数计算

输入：
- 纯英文、纯中文、中英混合、空字符串。

断言：
- 英文按单词计。
- 中文按字符计。
- 与前端规则一致。

### TU-002 语法问题 normalization

Given:
- AI 返回非法 `segment_id`、越界 `start/end`、重复范围、未知类别。

Then:
- 非法范围被丢弃。
- 越界范围被 clamp。
- 重复范围被去重。
- 未知类别映射为 `grammar`。
- 重叠问题被合并或按规则处理。

### TU-003 固定提示不包含改法

Given:
- AI 返回任何类别。

Then:
- 保存的 `message` 来自固定映射。
- 不包含“应为”“改成”“suggested correction”等修改建议。

## 3. 后端 API Test

### API-T001 教师创建写作作业

Given:
- 教师登录，拥有班级。

When:
- 创建 `grammar_hint_mode=after_submit`，`revision_limit=1`。

Then:
- 状态为 `draft`。
- 发布后学生可见。

### API-T002 权限隔离

Given:
- 学生 A 和教师 T。

When:
- 学生 B 访问学生 A 的写作提交。
- 教师 T2 访问教师 T1 的作业。

Then:
- 返回 403 或 404，不泄露数据。

### API-T003 草稿保存和恢复

When:
- 学生 PATCH draft。
- 学生重新 GET submission。

Then:
- 草稿内容保持一致。

### API-T004 首次提交状态机

Given:
- `grammar_hint_mode=after_submit`，`revision_limit=1`。

When:
- 学生提交初稿。

Then:
- `status=revising`。
- `revisions[0].revision_number=0`。
- `first_submitted_at` 非空。
- `grammar_status=completed` 或 `failed`。

### API-T005 再次提交和最终锁定

When:
- 学生再次提交修改稿。

Then:
- `revision_number=1`。
- `status=finalized`。
- 再次提交返回 `WRITING_SUBMISSION_FINALIZED`。

### API-T006 语法检测失败不阻塞提交

Given:
- AI 返回 502 或非法 JSON。

When:
- 学生提交。

Then:
- 提交成功。
- `grammar_status=failed`。
- 学生可以修改或重试检测。

### API-T007 停留追踪

Given:
- 学生进入写作页面。

When:
- 发送 enter、heartbeat、leave。

Then:
- 创建 visit。
- heartbeat 更新时间。
- leave 关闭 visit。

### API-T008 心跳超时兜底

Given:
- 存在 open visit，`last_heartbeat_at` 超过阈值。

When:
- 教师查询详情。

Then:
- visit 被关闭，`end_reason=idle_timeout`。

### API-T009 违规事件上报

When:
- 学生上报 `paste_blocked`。

Then:
- `WritingIntegrityEvent` 写入。
- 教师详情可见。

### API-T010 幂等提交

Given:
- 相同 `client_submit_id` 重复提交。

Then:
- 只创建一个版本。
- 第二次返回已有版本。

## 4. 前端验证

### FE-T001 复制粘贴拦截

Manual:
- 进入写作页面。
- 尝试 Ctrl+C、Ctrl+V、右键粘贴、拖拽文本。

Expected:
- 编辑器中不出现粘贴文本。
- 浏览器 DevTools 网络面板出现 `/integrity` 请求。

### FE-T002 首次提交前无语法提示

Manual:
- 输入草稿。

Expected:
- 页面不显示语法问题面板。

### FE-T003 首次提交后显示问题

Manual:
- 提交初稿。

Expected:
- 显示问题高亮和固定类别提示。
- 不显示正确改法。
- 编辑器可继续修改。

### FE-T004 离开和返回追踪

Manual:
- 进入写作页面。
- 切到其他标签页 30 秒。
- 返回。
- 教师详情查看。

Expected:
- 至少有两段 visit。
- 总停留和总离开时长为正。

## 5. 全量回归

执行：

```powershell
cd D:\AFrontend\XQL\backend
python -m pytest

cd D:\AFrontend\XQL\frontend
npm run typecheck
npm run build
```

现有 `test_core_flow.py` 必须全部通过。

