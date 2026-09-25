# 用例说明

## UC-001 教师创建并发布写作作业

Actor:
Teacher

Trigger:
教师进入“写作任务”页面，点击“创建任务”。

Preconditions:
- 教师已登录。
- 教师至少拥有一个班级。

Main Flow:
1. 教师填写作业标题、写作要求、目标班级、开始时间、截止时间、最少/最多字数。
2. 教师选择语法检测策略：`off` 或 `after_submit`。
3. 教师设置修改次数。
4. 教师提交，系统创建 `WritingAssignment`，状态为 `draft`。
5. 教师在任务列表点击“发布”。
6. 系统将状态改为 `published`。
7. 班级学生可以在“写作任务”中看到该作业。

Alternative Flow:
- 教师没有班级：系统阻止创建并提示先创建班级。
- 教师选择 `after_submit` 但 AI 配置不存在：系统阻止创建并提示检测策略不可用。

Failure Cases:
- 请求网络失败：前端显示错误，已填写表单保留。
- 截止时间早于开始时间：前端和后端都拒绝。

Postconditions:
- `WritingAssignment.status = published`。
- 学生可见该作业。

Related Requirements:
FR-001, FR-002, FR-003, FR-008, FR-009, FR-015

## UC-002 学生进入写作页面并自动保存草稿

Actor:
Student

Trigger:
学生从写作任务详情点击“开始写作”或“继续写作”。

Preconditions:
- 学生已登录并加入该作业对应班级。
- 作业状态为 `published`。
- 当前时间在 `starts_at` 和 `due_at` 之间，或教师允许补交。

Main Flow:
1. 前端调用 `POST /writing/assignments/{id}/submissions`。
2. 系统查找该学生该作业唯一 `WritingSubmission`。
3. 不存在则创建，状态为 `drafting`，草稿为空。
4. 前端跳转到写作页面。
5. 写作页面加载草稿，并调用 `POST .../presence/enter` 开始停留记录。
6. 学生输入内容，前端 debounce 后调用 `PATCH .../draft`。
7. 后端更新 `draft_content`、`draft_word_count`、`draft_updated_at`。
8. 页面显示“已保存”。

Alternative Flow:
- 学生此前已有草稿：恢复草稿和当前状态。
- 学生刷新页面：重新加载 `WritingSubmission`，草稿仍在。

Failure Cases:
- 自动保存失败：前端显示“保存失败”，下一次 debounce 重试。
- 学生没有权限：返回 403。
- 作业未开始或已截止：返回 400。

Postconditions:
- 草稿保存到后端。
- 学生有一条 open 停留记录，服务端持续收到心跳。

Related Requirements:
FR-003, FR-004, FR-005, FR-011, FR-015

## UC-003 学生首次提交并触发语法标注

Actor:
Student

Trigger:
学生在写作页面点击“提交初稿”。

Preconditions:
- 作业 `grammar_hint_mode = after_submit`。
- 草稿非空且满足最少字数。
- 作业未截止，或允许补交。

Main Flow:
1. 前端将当前草稿发送到 `POST .../submit`。
2. 后端锁定提交行，创建 `WritingRevision`，`revision_number=0`。
3. 后端记录 `first_submitted_at`。
4. 后端将提交状态置为 `revising`，若修改次数为 0 则置为 `finalized`。
5. 后端调用 `WritingGrammarService.detect`。
6. 检测服务把文本分段，调用 AI，返回问题位置和类别。
7. 后端校验范围、去重、换算全局偏移，保存 `WritingGrammarIssue`。
8. 后端返回最新提交状态、版本和问题列表。
9. 前端显示标注结果，但不显示正确写法。

Alternative Flow:
- 教师关闭检测：跳过检测，`grammar_status=not_applicable`。
- AI 检测失败：提交仍成功，`grammar_status=failed`，前端提示检测暂时不可用。

Failure Cases:
- 字数不满足：返回 400，不创建版本。
- 重复提交：使用同一当前草稿提交时，后端按状态机拒绝或返回已有最新版本，不重复创建。
- AI 返回非法 JSON：不阻塞提交，标记检测失败。

Postconditions:
- 至少存在 `revision_number=0` 版本。
- 语法问题和版本关联保存。
- 学生获得后续修改机会或进入最终锁定。

Related Requirements:
FR-004, FR-006, FR-007, FR-008, FR-009, FR-010

## UC-004 学生修改并最终提交

Actor:
Student

Trigger:
学生在首次提交后点击“提交修改”。

Preconditions:
- 提交状态为 `revising`。
- 剩余修改次数大于 0。

Main Flow:
1. 前端基于最新提交内容展示编辑器，学生修改。
2. 修改过程中不显示新版本语法问题。
3. 学生点击“提交修改”。
4. 后端创建新的不可变版本，`revision_number` 递增。
5. 后端重新检测该版本。
6. 若新版本数量达到上限，状态置为 `finalized`，编辑器锁定。
7. 前端显示最新版本和问题列表。

Alternative Flow:
- 学生不修改直接再次提交：允许，作为新版本保存。
- 剩余次数为 0：后端返回 409，前端锁定提交按钮。

Failure Cases:
- AI 失败：提交成功，标记 `failed`，可点击“重新检测”。
- 提交并发：后端使用事务和行锁，只接受一个有效版本。

Postconditions:
- 最终版本不可变。
- `final_submitted_at` 写入。
- 教师可查看所有版本。

Related Requirements:
FR-007, FR-008, FR-009, FR-010

## UC-005 教师关闭语法检测

Actor:
Teacher

Trigger:
教师创建作业时选择“关闭语法检测”。

Preconditions:
- 教师有权限创建作业。

Main Flow:
1. 作业保存 `grammar_hint_mode=off`。
2. 学生提交时，后端跳过 AI 调用。
3. 版本 `grammar_status=not_applicable`。
4. 前端不显示语法结果区域。

Failure Cases:
无 AI 相关失败。

Postconditions:
写作、修改、提交、停留追踪仍然有效，只没有语法标注。

Related Requirements:
FR-008

## UC-006 页面停留与离开追踪

Actor:
Student

Trigger:
学生进入、隐藏、关闭或重新打开写作页面。

Preconditions:
- 学生已打开写作页面。
- 后端存在对应 `WritingSubmission`。

Main Flow:
1. 进入页面，前端生成 `client_visit_id`，调用 `presence/enter`。
2. 后端关闭同一提交上已有的 open visit，并创建新的 open visit。
3. 前端每 10 秒调用 `presence/heartbeat`。
4. 学生切走标签页或离开路由，前端调用 `presence/leave`。
5. 后端把对应 visit 的 `ended_at` 设为当前时间。
6. 学生返回页面，前端再次 `presence/enter`，形成新 visit。

Alternative Flow:
- 浏览器直接关闭或断网：`leave` 未到达，后端心跳超时后关闭 visit，`end_reason=idle_timeout`。
- 学生打开多个标签页：新 `enter` 关闭上一个 open visit，`end_reason=new_visit`。

Failure Cases:
- `fetch keepalive` 失败：心跳超时兜底。
- 服务器时间与客户端时间不同：统一使用服务端 UTC 时间，不使用客户端时间。

Postconditions:
- 教师可查看每次停留和离开区间。

Related Requirements:
FR-011, FR-014

## UC-007 复制粘贴被阻止并记录

Actor:
Student

Trigger:
学生在写作页面尝试复制、剪切、粘贴、右键或拖拽文本。

Preconditions:
- 写作页面已挂载。

Main Flow:
1. 前端捕获对应事件。
2. 调用 `preventDefault()`，文本不会进入编辑器。
3. 前端节流后调用 `POST .../integrity`。
4. 后端保存违规事件。

Alternative Flow:
- 学生使用浏览器 DevTools 等非普通交互：前端不保证拦截。

Failure Cases:
- 违规上报网络失败：不阻塞写作，仅丢失本次日志。

Postconditions:
- 教师端可见违规尝试记录。

Related Requirements:
FR-012, FR-013, FR-014

## UC-008 教师查看写作提交和行为记录

Actor:
Teacher

Trigger:
教师进入某写作作业的提交列表，点击某学生。

Preconditions:
- 教师是该作业创建者。

Main Flow:
1. 教师查看提交列表，看到学生、状态、版本数、字数、语法问题数和最后活动时间。
2. 教师打开详情，看到所有版本和对应问题。
3. 教师看到总停留时长、总离开时长、离开次数、每次停留/离开区间。
4. 教师看到复制粘贴拦截记录。

Alternative Flow:
- 学生还未提交：详情显示草稿状态和已有停留记录，但没有版本。

Failure Cases:
- 学生不是该班级成员：不应出现在列表。

Postconditions:
教师获得足够的写作过程观察数据。

Related Requirements:
FR-011, FR-013, FR-014, FR-015

## UC-009 作业截止和关闭

Actor:
Student / Teacher

Trigger:
作业到达截止时间，或教师主动关闭作业。

Preconditions:
- 作业存在。

Main Flow:
1. 后端在提交接口检查 `due_at` 和 `status`。
2. 若已截止且未允许补交，返回 `WRITING_ASSIGNMENT_CLOSED`。
3. 若教师主动关闭，学生仍可查看历史提交，但不能编辑和提交。

Alternative Flow:
- 教师允许补交，则截止后仍可提交。

Failure Cases:
无。

Postconditions:
- 已保存草稿和已提交版本不丢失。

Related Requirements:
FR-002, FR-003, FR-010, FR-015

## UC-010 AI 检测失败与重试

Actor:
Student

Trigger:
学生提交后 AI 检测失败，或点击“重新检测”。

Preconditions:
- 作业启用 `after_submit`。
- 最新版本 `grammar_status=failed`。

Main Flow:
1. 学生看到“本次语法检测暂时不可用，但草稿已提交”。
2. 学生点击“重新检测”。
3. 前端调用 `POST .../retry-grammar`。
4. 后端重新检测最新版本，不创建新版本。
5. 成功则更新问题记录，失败则保持 `failed`。

Failure Cases:
- 仍失败：保持 `failed`，学生仍可修改提交。

Postconditions:
- 最新版本有可查看的检测结果或明确失败状态。

Related Requirements:
FR-007, FR-008, FR-009

## UC-011 多标签页并发处理

Actor:
Student

Trigger:
学生同时在两个浏览器标签页打开同一个写作作业。

Preconditions:
- 两个标签页都登录同一学生账号。

Main Flow:
1. 新标签页进入时，后端创建新 visit，并关闭旧 open visit。
2. 草稿保存以后到达的请求为准。
3. 提交接口使用行锁，避免重复创建同一版本。

Alternative Flow:
- 旧标签页继续编辑但新标签页已提交最终版：旧标签页下一次保存/提交会被后端状态机拒绝，并提示刷新。

Failure Cases:
- 旧标签页显示过期状态：前端轮询或刷新恢复。

Postconditions:
- 同一学生同一作业只有一份有效提交，历史版本按服务端状态保存。

Related Requirements:
FR-004, FR-005, FR-009, FR-010, FR-011

