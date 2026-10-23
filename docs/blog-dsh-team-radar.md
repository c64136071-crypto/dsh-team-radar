# 给多 Agent 团队做一块仪表盘：DSH 插件 Team Radar 开发记

> 本文记录 [dsh-team-radar](https://github.com/c64136071-crypto/dsh-team-radar) 的实现思路：
> 一个跑在 DeepSeek Harness Web/Desktop 里的纯客户端插件，把 Agent Teams 的成员和共享任务画成实时雷达图。
> 读完你能了解 DSH 的浏览器插件是怎么被加载的、团队状态从哪来，以及一个"零构建"前端插件的工程化做法。

## 1. 起因：多 Agent 协作，看不见

DSH（DeepSeek Harness）的实验性 **Agent Teams** 让一个 Lead 会话可以创建若干 teammate，共享一块任务板：

- Lead 负责拆任务、派活、验收；
- teammate 各自认领任务、汇报进度；
- 任务有状态、负责人、依赖（`blockedBy`）和提示性写作用域。

这一切在对话流里当然能被看到，但一旦成员多起来，"谁在跑、谁卡住、整体完成到哪了"就很难一眼判断。DSH 自带的团队面板是一个紧凑的列表；我们想要一块更像仪表盘的东西——于是有了 Team Radar。

## 2. 关键发现：DSH 客户端插件不是"打包好的 React 应用"

翻 DSH 的发行包和文档后，客户端插件的形态其实很朴素：

1. 插件是一个 npm 包，`package.json` 里有 `dsh.client` 声明（`platform: web`、`inject`、`external`）；
2. 包的 `./client` 入口导出一个**浏览器模块**，内容就是一次 `window.__ModuleLoader__.load({ id, factory })` 调用；
3. `factory(require)` 里只能 `require` 平台模块表里的东西（`react`、`react-dom`、`react/jsx-runtime` 等），模块 id 必须等于包名；
4. Host 侧按 `dsh.client` 扫描 Loader 条目，把每个 `client.js` 作为 bundle 提供给页面；
5. 最后用一份 bundle patch（`cordis.patch.yml`）插入一个 Host 行，让这个包进入 profile 的插件树。

也就是说：**不需要 build 步骤**。手写一个符合 `__ModuleLoader__` 协议的 `client.js`，就是合法插件。模板里甚至连 `index.js` 都只有一行：

```js
export function apply() {}
```

（Host 半边空着，能力全在浏览器侧。）

## 3. 数据从哪来：Session 投影

DSH 的客户端状态是 Session store + 投影（projection）。团队信息在 Lead 会话的 `agentTeam` 投影里：

```js
const team = useSessions((state) =>
  state.projectionsBySession[leadSessionId]?.values?.agentTeam
);
```

`team` 的结构大致是：

```ts
{
  members: { id, name, role: 'lead' | 'teammate', phase: 'provisioning' | 'active' | 'failed', error? }[],
  tasks: { id, subject, status, ownerName?, blockedBy, writeScopes, ready, writeScopeWarnings }[],
  failure?: string
}
```

运行状态单独从 `useSessionStatus` 拿：

```js
const running = useSessionStatus((state) => state.get(member.id)?.running);
```

这两个 hook 以及 `sessionId`、`t`（i18n）等，都是 **slot 渲染器自动注入的标准 props**。我们只需要在 `ctx.slots.register` 时声明槽位。

还有一个容易忽略的细节：DSH 的团队面板在 teammate 会话里也能用。做法是先把当前会话解析回 Lead：

```js
const leadSessionId =
  useSession((snapshot) => snapshot?.subagent?.address?.parentSessionId) ?? sessionId;
```

这样在 coder 的会话里点开雷达，看到的仍然是整个团队。

## 4. 可视化实现

### 4.1 布局

- Lead 固定在圆心，teammate 按角度均分在椭圆轨道上；
- 用 SVG 画：虚线轨道圈、Lead 到成员的连线、带状态的节点；
- 状态配色：运行中（蓝 + 呼吸光环）、空闲（灰）、筹备中（虚化灰）、失败（红）；
- 一个旋转扫描线给"雷达"一点动感，`prefers-reduced-motion` 下自动关闭。

### 4.2 交互

- 点击任一成员节点 → 打开该成员的会话（在 teammate 会话里点 Lead 则回 Lead）：

```js
const leadSessionId = resolveLeadSession(targetSessionId);
if ((sessions.retainInfo(targetSessionId).getSnapshot().retainedBy.mainView ?? 0) === 0) return;
ctx.uiWorkspace.openSession({ parentSessionId: leadSessionId, childSessionId: memberSessionId, mode: 'continuable' });
```

- 当前会话成员加一圈虚线外环；
- 悬停用 SVG `<title>` 显示模型、认领任务数、失败原因；
- 面板用 `react-dom` 的 `createPortal` 挂到 `document.body`，`position: fixed` 由触发器位置计算并夹在视口内；
- 所有颜色走 DSH 主题变量（`--dsw-alias-*`），带深色兜底，所以亮/暗主题都能用。

### 4.3 空状态

没有团队投影时整个按钮不渲染——不打扰没有用 Agent Teams 的会话。

## 5. 工程化：没有构建，也要能测

"零构建"不代表"零测试"。插件目录里放了三层检查：

| 脚本 | 作用 |
|---|---|
| `scripts/smoke.cjs` | 桩掉 `window.__ModuleLoader__` 和 React，验证模块注册、槽位注册、中英词典、空状态渲染 |
| `scripts/render-test.cjs` | jsdom + 真实 React：渲染组件、点击触发器、断言雷达节点/任务卡片/进度/当前会话环，再点击节点断言 `openMember` 调用参数 |
| `scripts/screenshot.cjs` | 用 jsdom 渲染出面板 DOM + CSS，生成 `docs/preview.html`，交给无头浏览器截屏得到 README 里的截图 |

最后一步值得展开：README 里的截图**不是手画的**，而是真实组件渲染后截屏，所以它不会和代码脱节；CI 里跑 `pnpm test` 就能守住行为，截图随时可重生成。

```sh
pnpm install      # 只装 react / react-dom / jsdom 三个 devDependencies
pnpm test         # smoke + render
pnpm run preview  # 生成 docs/preview.html
```

截图生成命令（Windows，无头 Edge）：

```sh
msedge --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=520,820 \
  --screenshot=docs/screenshot.png docs/preview.html
```

## 6. 走过的坑

- **profile 安装**：本地开发用 `link:` 依赖把包挂进 profile 的 `node_modules`，再把包名加进 `dsh.profile.bundles`；DSH 开着 HMR 时会重新组合插件树，新增 bundle 不需要重启（首次加载有时需要刷新页面）。
- **`dsh.client.inject` 是模块加载顺序**，不是服务依赖；真正的服务依赖写在 `factory` 返回值的 `inject: ['slots', 'locale', 'sessions', 'uiWorkspace']`。
- **错误不会炸掉整个页面**：模块系统按条目隔离失败，插件报错只影响自己那一行；调试时先看"设置 → 插件"的加载诊断。
- **发行版是 ASAR**：源码在 `app.asar` 里，Shell、glob、rg 都读不到；要查协议只能解包 asar（或直接看包里 `lib/*.js` 与文档）。
- **清理**：插件是只读视图，不写 Session、不碰任务板；所有 DOM 副作用（`<style>`、事件监听）都挂在 `ctx.effect` 的清理函数上。

## 7. 小结

Team Radar 只有两个运行时文件（`client.js` + `index.js`），却覆盖了 DSH 插件开发的几个核心点：模块加载协议、slot 注入、Session 投影、跨会话导航和主题适配。

如果你也在做 Agent 相关的工具，这个项目可以作为参考：
**先把状态来源找对（投影），再做可视化（SVG），最后用真实 DOM 测试守住行为。**

仓库：<https://github.com/c64136071-crypto/dsh-team-radar> · MIT
