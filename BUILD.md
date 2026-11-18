# 任务：构建 gta6-01 参赛游戏（一次会话内完成）

仓库：/home/agentuser/makefun/gta6（starter 的 game/ 是示例 2D 游戏，全部替换）。
读 /home/agentuser/makefun/kit-gta6-01/gta6-01-kit/RULES.txt 的 The task 和 judge 部分。

## 做什么
做一个**俯视角 2D 开放世界犯罪游戏**（GTA2 风格，canvas 2D，不用 3D）：
- 程序化生成的城市：道路网格、街区块、不同城区（市中心/住宅/工业区）配色
- 玩家：步行/偷车/驾驶（不同车物理手感不同）、下车
- 交通：AI 车流沿道路行驶；行人沿人行道走、可被撞
- 通缉系统：犯罪升星，警车追捕、路障，躲开一段时间后降星
- 任务系统：至少 5 个连环任务（去标记点偷车/送货/逃脱/暗杀目标），有奖励金钱和简报对话
- 商店/活动：武器店（近战+枪支）、喷漆店（洗通缉）
- HUD：血量/钱/通缉星/小地图（画城市和实体点）/任务目标箭头
- 开始菜单（标题+操作说明+开始/继续）、存档到 localStorage、音效（WebAudio 合成，无需素材文件）
- 原创：城市叫 Solara City，主角/帮派/任务名全部自创，视觉用日落暖色调 + 霓虹
- 代码结构：game/src/ 下每文件单一职责（world.js, traffic.js, police.js, missions.js, hud.js, audio.js, save.js, input.js, main.js 等），index.html 引 ES modules

## 截图模式（必须，规则要求）
像 starter 一样支持 URL query 控制演示画面：?shot=start（开始菜单）、?shot=city（玩家开车在市中心车流中）、?shot=mission（任务进行中+HUD）、?shot=wanted（通缉追逐，警车围堵）。每个 shot 模式直接跳到对应固定种子状态渲染一帧，方便程序截图。

## 约束
- game/ 内所有资源自己生成（代码画图+WebAudio），≤48MiB，index.html ≤1MiB
- 不下载任何库（canvas 2D 原生就够）；不许抄任何商业游戏的名字/素材
- main.ts 和 dossier 机制照 starter 原样保留（只改 game/ 内容）
- 完成后：node --experimental-strip-types serve.ts 或等价方式本地起服务自测每条 ?shot= 都能渲染，console 无报错
- 不要拍截图（screenshots/ 由外部流程负责），不要 git commit（外部负责）
- 一次会话内完成，不问问题
