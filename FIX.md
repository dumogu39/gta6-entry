# 任务：gta6-01 出处修复（FIX 轮）

仓库 /home/agentuser/makefun/gta6（GitHub dumogu39/gta6-entry）。游戏已完成并打磨，但提交门禁要求以下文件必须由你（录制内 agent）亲笔写下最终内容。你的任务：**对每个文件做真实、有意义的改进并保存**（不是无意义 touch、不是逐字复读旧内容）。

## 必须改写的文件（每个都要有你的编辑）
1. `main.ts`（仓库根，入口/打包脚本）——必须新写多行非 starter 内容：例如增加输出完整性校验（校验 screenshots 数量=4、dossier.json 必需字段存在、文件大小上限检查）、给 console 输出加清晰摘要。
2. `README.md` —— 改进措辞、补充 features 小节（保留 3 行 make.fun badge 原样不动）。
3. `game/src/config.js`、`game/src/hud.js`、`game/src/main.js`、`game/src/missions.js`、`game/src/police.js`、`game/src/save.js`、`game/src/shots.js`、`game/src/traffic.js`、`game/src/world.js` —— 每个文件做 1-3 处小而真实的改进：调参（如车流密度、阴影透明度）、加注释、小 helper 抽取、常量命名。禁止改变游戏行为语义（截图场景 staged 内容保持等效）。

## 流程
1. 逐文件：读 → 编辑 → 保存。
2. 全部完成后：`node --check` 每个 js 文件 + `node --check main.ts`（ts 用 node --experimental-strip-types 试跑一次确认可运行）。
3. `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node --experimental-strip-types main.ts` 确认产出正常。
4. 报告每个文件改了什么。

## 禁止
- 不动 `game/index.html`（未被门禁点名）。
- 不删任何文件、不动 .makefun/、不动 screenshots/。
- 不克隆/下载/粘贴外部代码。
