# pi-kegel 🧘

**在等模型干活的时候练凯格尔 · Pelvic-floor training while you wait for the model.**

[中文](#中文) · [English](#english)

一个 [pi](https://github.com/earendil-works/pi) 扩展：模型开始「打字」时，输入框上方自动浮出一朵用盲文点阵画的呼吸花，收缩 10 秒、放松 10 秒，练完自动收起。不用记时间、不用看表、不用额外打开 App —— 等模型写代码那几分钟，顺手就把盆底肌练了。

![训练演示](assets/demo.gif)

> 动图是**真实速度**，一秒不差（演示用的处方是 5s/5s × 2 次，缩短了是为了让动图别太长；默认处方是 10s/10s × 8 × 3）。

| 收紧 —— 花瓣被攥成花苞 | 放松 —— 花瓣绽开 |
|---|---|
| ![收缩](assets/contract.png) | ![放松](assets/relax.png) |

---

## 中文

### 为什么做这个

凯格尔训练的核心难点不是「怎么做」，是**坚持**。它的处方很无聊：每天 3 组、每组 10 次、每次收紧 10 秒 —— 大概 3 分钟，但要天天做，而且做的当时你没法干别的事（要专心感受盆底发力）。

而「等 AI 写代码」正好是这样一段时间：你盯着屏幕、脑子闲着、手也闲着，但又不想切出去干别的。这 3 分钟就该拿来练。

所以这个扩展的核心设计是**零启动成本**：不需要「我今天要练」这个决定，模型一开工，花就开了。练完它问你一句「这次感觉如何」，然后自己消失。

### 安装

```bash
git clone https://github.com/cheers666-max/pi-kegel.git ~/.pi/agent/extensions/kegel
```

然后**重开 pi**（扩展在启动时加载）。装好后输入 `/kegel` 应该能看到菜单。

更新：

```bash
cd ~/.pi/agent/extensions/kegel && git pull
```

> 不想用 git 也行：把 `index.ts` / `core.ts` / `widget.ts` / `bloom.ts` / `history.ts` 五个文件丢进 `~/.pi/agent/extensions/kegel/` 即可。

### 用法

启动 pi，正常发消息。模型开始工作时：

1. 输入框上方浮出一朵花 + 倒计时（准备 3 秒）
2. **收紧**：像憋尿一样向上提，保持到花聚成苞、倒计时归零
3. **放松**：完全松开（这一步比收紧更重要，别一直提着）
4. 重复 8 次为一组，共 3 组，组间休息 30 秒
5. 练完问你「这次感觉如何？」，1-5 分选一个，然后花收起来

全程不用碰键盘，但想控制也行（见 [快捷键](#快捷键)）。

### 花瓣可视化

花是用 **Braille 点阵**（U+2800–U+28FF）画的：一个字符格 = 2×4 个点，所以一朵花只占十几个字符宽，在终端里能量出圆滑的边缘。它跟着呼吸曲线缩放：

- **收紧**时花瓣被攥成花苞（直径缩到约 1/2.6）
- **放松**时花瓣绽开
- 阶段交接处按「聚拢必从全开起步、绽开必从花苞起步」设计，所以不会突跳（有测试守着）
- 闲置阶段（准备 / 组间休息）花会轻轻呼吸，提示你「下一次收缩的起点在哪」

方向可以反过来（`花瓣绽开于：收缩时`），有些人觉得反过来更顺 —— 在设置里一键切换，立即生效。

尺寸随终端高度自适应（约占 1/3 屏高）；终端太矮（< 26 行）或太窄（< 36 列）时自动退化成紧凑进度条。

### 音效 / 语音报数

每个阶段切换都有声音，不用盯屏幕：

| 时刻 | 系统音 | 语音模式 |
|------|--------|---------|
| 准备开始 | `Morse` | 准备 |
| 开始**收紧** | `Tink`（清脆、高） | 收紧 |
| 开始**放松** | `Blow`（吹气、软） | 放松 |
| 组间休息 | `Purr`（喉音） | 休息 |
| 阶段最后 N 秒（每秒一次） | `Pop`（音量降到 45%） | 3 / 2 / 1 |
| 完成 | `Glass`（铃） | 完成 |

- **滴答**（默认最后 3 秒）：边界快到了提醒你，可以闭眼练。短于 3.5 秒的阶段不滴答（否则快肌 1/1 会变成哒哒哒噪音）
- **语音模式**：用 macOS `say` 念（默认 `Tingting`），像教练在报数，适合闭眼跟练
- **音量**：`afplay -v`，0-100%
- 只在 **macOS** 上有效（依赖 `afplay` / `say`），其他平台静默

### 训练记录

每次**完整练完**（手动 `alt+e` 结束的不算）自动记一笔，并问你 1-5 分：

| 分数 | 含义 |
|---|---|
| 5 | 很好（有力、全程撑住） |
| 4 | 不错（基本可控） |
| 3 | 一般（勉强完成） |
| 2 | 偏差（找不到发力感） |
| 1 | 很差（疼痛 / 漏尿 / 完全使不上力） |

评分不是仪式感 —— 盆底肌训练最怕「练错了还不知道」，1-2 分连着出现就该去看医生，或者说明你太累了。

`/kegel` → **📈 训练记录** 可以看：

![训练记录](assets/menu.png)

- 今日练了几次、几个收缩、总时长、当天平均感受
- 连续天数（今天还没练也不算断）、累计量、历史平均感受
- 近 N 天柱状图（柱长 = 收缩时长，中间的空档会显示成 `·····`，不会偷偷跳过）
- 最近 5 次感受 + 备注

还能在同一个菜单里：给最近一次改分、写备注、改显示天数、清空全部记录。

数据存在 `~/.pi/agent/kegel-history.jsonl`（一行一次训练），纯文本、可 grep、可备份：

```bash
# 最近一周每天练了多少
tail -7 ~/.pi/agent/kegel-history.jsonl | jq -r '"\(.at|todate) \(.reps)次"'
```

> 记录里存的是：时间戳、完成次数、组数、收缩/放松秒数、累计收缩时长、训练总时长、是否练完、评分、备注。**没有任何个人身份信息**，也不联网。

### 难度表

| 难度 | 处方 | 说明 |
|---|---|---|
| 快肌 | 1s / 1s × 10 × 3 | 练快肌纤维，节奏很快 |
| 入门 | 3s / 6s × 10 × 3 | 找不到发力感时从这个开始 |
| 轻量 | 5s / 10s × 10 × 3 | |
| **标准** | **10s / 10s × 8 × 3** | 默认，也是最常见的临床处方 |
| 加强 | 10s / 5s × 10 × 3 | 放松时间短，强度更大 |
| 耐力 | 15s / 10s × 8 × 3 | |
| 自定义 | 任意 | 收缩 1-120s、放松 1-120s、次数、组数、组间休息 |

### 配置

`/kegel` → ⚙️ 其它设置：

| 项 | 默认 | 说明 |
|---|---|---|
| 音效 | 系统音 | `系统音`（含音量）→ `语音` → `关` |
| 结束前滴答 | 最后 3 秒 | 0-10 秒或关 |
| 可视化 | 花瓣绽放 | 或进度条 |
| 花瓣绽开于 | 放松时 | 或「收缩时」 |
| 记录训练 | 开 | 关掉后不再写入（已有记录保留） |
| 练完询问感受 | 开 | 关掉就不弹 1-5 分 |
| 模型开始工作时自动开始 | 开 | |
| 模型结束后自动结束 | 关 | |
| 模型空闲时自动暂停 | 开 | 模型干完活、训练还没做完时自动冻结计时，你下次发消息再接着走 |
| 准备倒计时 | 3s | |

配置写在 `~/.pi/agent/kegel.json`：

```json
{
  "contractSec": 10,
  "relaxSec": 10,
  "reps": 8,
  "sets": 3,
  "setRestSec": 30,
  "prepareSec": 3,
  "cue": "system",
  "volume": 0.7,
  "tickLastSec": 3,
  "voice": "Tingting",
  "visual": "bloom",
  "bloomOn": "relax",
  "log": true,
  "askRating": true,
  "historyDays": 14
}
```

### 快捷键

| 操作 | 快捷键 |
|---|---|
| 暂停 / 继续 | `alt+k` |
| 跳过当前阶段 | `alt+n` |
| 提前结束 | `alt+e` |
| 打开菜单 | `/kegel` |
| 直接开始某个难度 | `/kegel quick`、`/kegel standard` 等 |
| 查看状态 | `/kegel status` |

**如果在 Ghostty / Terminal.app 下 `alt+k` 没反应**：这两个终端默认 `macos-option-as-alt = false`，Option+K 发出的是组合字符 `˚` 而不是 `ESC k`。扩展已经做了兜底 —— 训练期间它直接拦截 `˚` / `˜` / `´` 三个字符，所以**开箱即用，不用改终端配置**。

想更稳妥，可以在 Ghostty 配置里加：

```ini
macos-option-as-alt = true
```

另外 `ctrl+shift+k` / `ctrl+shift+n` / `ctrl+shift+e` 是无冲突的备用键（需要终端支持 kitty 键盘协议）。

### 已知限制

- **音效仅 macOS**：依赖 `afplay` / `say`
- **模型写超长回复时才开始练**：如果它只回一句话（几秒），训练刚开始就被下一轮打断 —— 这时 `模型空闲时自动暂停` 会把它冻住，等你下次发消息继续
- **排队消息不触发重新开始**：agent 忙时你追加的消息属于同一个 run，扩展靠 `turn_start` 兜底重新武装（已测）
- **`alt+k` 是全局快捷键**：训练没开时按下只会被忽略，但会占用这个组合键
- **Braille 花需要等宽字体**：终端字体没有 U+2800–28FF 时会显示成方框（Ghostty / iTerm / Terminal.app 默认字体都有）
- 不是医疗器械，不替代医生

### 开发

三个纯逻辑模块都可以脱离 pi 独立跑：

```bash
# 单元测试：状态机 + 呼吸曲线 + 点阵渲染 + 记录聚合（33 项）
node --experimental-strip-types core.test.ts

# 重新生成 README 素材（需要装过 pi，脚本会自己找到 pi-tui）
node --experimental-strip-types tools/render-frames.mjs   # 采样成帧（默认 300ms/帧）
python3 tools/make-assets.py                              # 画 PNG / 合成 GIF（真实速度）
python3 tools/verify-assets.py                            # 无需肉眼：查缺字、查花真的在缩放
```

文件分工：

| 文件 | 职责 |
|---|---|
| `core.ts` | 状态机 + 配置校验（纯逻辑，零 TUI 依赖） |
| `bloom.ts` | Braille 点阵花的几何与呼吸曲线（纯函数） |
| `history.ts` | 训练记录的数据层 + 报表渲染（纯函数） |
| `widget.ts` | 把状态画成终端组件 |
| `index.ts` | 扩展入口：事件订阅、快捷键、音效、菜单编排 |
| `core.test.ts` | 单元测试 |

`tools/` 里的脚本会加载**真实的** `widget.ts` / `bloom.ts` / `history.ts` 来出图，所以 README 里的截图不可能和实际渲染脱节。`verify-assets.py` 之所以存在，是因为出图踩过三个坑：Menlo 没有 Braille 字形（花静默变成方框）、量化后的 GIF 背景色会偏移（导致「非背景即墨迹」的判定失效）、以及动画可能根本不动的帧序列。

### 安全提示

- 收紧时**不要憋气**，正常呼吸
- 放松阶段要真的松开，一直半提着练反而有害
- 排尿时**不要**用这个练（会干扰排尿反射）
- 出现疼痛、明显漏尿加重，停练并看医生

---

<a name="english"></a>

## English

A [pi](https://github.com/earendil-works/pi) extension that turns the time you spend waiting for the model into pelvic-floor training.

When the agent starts working, a flower drawn in **Braille dots** blooms above the editor: contract for 10 seconds, relax for 10, repeat. It disappears when you're done, asks how it felt, and keeps a daily log. No timer to remember, no app to switch to — you were going to sit there waiting anyway.

The GIF at the top plays at **true speed** (the demo uses a shortened 5s/5s × 2 prescription so the file stays reasonable; the default is 10s/10s × 8 × 3).

### Why

Kegel training isn't hard to understand — it's hard to *keep doing*. The prescription is boring: three sets of ten, ten seconds per hold, roughly three minutes a day, every day. And you can't do anything else while you do it, because the whole point is paying attention to the contraction.

Waiting for an AI to write code is exactly that kind of window: you're at the keyboard, your hands are idle, and you'd rather not context-switch. So the design goal here is **zero activation cost** — you never decide "I should train today". The agent starts working, the flower appears.

### Install

```bash
git clone https://github.com/cheers666-max/pi-kegel.git ~/.pi/agent/extensions/kegel
```

Then **restart pi** (extensions load at startup). Run `/kegel` to check it's there.

To update:

```bash
cd ~/.pi/agent/extensions/kegel && git pull
```

> No git? Drop `index.ts`, `core.ts`, `widget.ts`, `bloom.ts` and `history.ts` into `~/.pi/agent/extensions/kegel/`.

### Usage

Start pi and send a message as usual. When the model starts working:

1. A flower and a countdown appear above the editor (3-second prepare)
2. **Contract** — squeeze upward like you're stopping urine mid-flow, hold until the flower gathers into a bud and the countdown hits zero
3. **Relax** — fully let go (this part matters more than the squeeze; don't half-hold)
4. Eight reps per set, three sets, 30 seconds between sets
5. When the plan finishes it asks "how did that feel?", you pick 1-5, and it gets out of the way

You never need to touch the keyboard mid-session, but you can: `alt+k` pause, `alt+n` skip a phase, `alt+e` end early.

### The flower

Everything is drawn with **Braille patterns** (U+2800–U+28FF), where one character cell is a 2×4 dot grid. That's what lets a flower fit in a dozen columns and still have smooth edges in a terminal. It scales with the breathing curve:

- **Contracting** pulls the petals into a bud (diameter shrinks to about 1/2.6)
- **Relaxing** opens them back up
- The phase boundaries are designed so nothing jumps: gathering always starts from fully open, opening always starts from the bud. There's a test for that.
- During idle phases (prepare, set rest) the flower breathes gently around *the starting point of the next contraction*, so you can see where you're heading

You can flip which phase opens the flower (`bloomOn: "contract"`) — some people find that more intuitive. It takes effect immediately and persists.

The flower size adapts to terminal height (about a third of the screen). Below 26 rows or 36 columns it falls back to a compact progress bar.

### Audio cues

Every phase change makes a sound, so you can train with your eyes closed:

| Moment | System sound | Spoken mode |
|--------|--------------|-------------|
| Prepare | `Morse` | 准备 |
| Start **contract** | `Tink` (bright, high) | 收紧 |
| Start **relax** | `Blow` (airy, soft) | 放松 |
| Set rest | `Purr` | 休息 |
| Final N seconds of a phase (once per second) | `Pop` at 45% volume | 3 / 2 / 1 |
| Done | `Glass` | 完成 |

- **Ticking** (last 3 seconds by default) tells you a boundary is coming without looking. Phases shorter than 3.5s never tick — otherwise the rapid 1s/1s preset becomes a stream of clicks
- **Spoken mode** uses macOS `say` (voice defaults to `Tingting`) and reads the cues in Chinese, like a coach counting for you
- **Volume** via `afplay -v`, 0-100%
- macOS only (`afplay` / `say`); silent everywhere else

### Training log

Every run that **finishes naturally** is recorded (ending early with `alt+e` is not), and you're asked to rate it 1-5:

| Score | Meaning |
|---|---|
| 5 | Great — strong throughout, held every rep |
| 4 | Good — mostly controlled |
| 3 | OK — got through it |
| 2 | Off — couldn't find the contraction |
| 1 | Bad — pain, leaking, or couldn't engage at all |

The rating isn't decoration. The real risk with pelvic-floor training is doing it wrong without noticing, so a run of 1s and 2s is a signal: see a doctor, or you're too tired to train today.

`/kegel` → **📈 训练记录** shows the report above: today's volume and average feeling, the current streak, lifetime totals, and a per-day bar chart (bar length = contraction time, gaps are drawn as `·····` rather than silently skipped), plus your last five ratings and notes.

The same menu lets you re-rate the last session, add a note, change the window, or clear the log.

Data lives in `~/.pi/agent/kegel-history.jsonl`, one JSON object per finished session — plain text, greppable, easy to back up:

```bash
# how much you trained each day this week
tail -7 ~/.pi/agent/kegel-history.jsonl | jq -r '"\(.at|todate) \(.reps) reps"'
```

> Each line stores: timestamp, reps completed, sets, contract/relax seconds, total contraction time, session duration, whether it finished, the rating, and an optional note. No personal identifiers, and nothing leaves your machine.

### Presets

| Preset | Prescription | Notes |
|---|---|---|
| Quick | 1s / 1s × 10 × 3 | Fast-twitch fibres, very fast rhythm |
| Beginner | 3s / 6s × 10 × 3 | Start here if you can't feel the contraction |
| Light | 5s / 10s × 10 × 3 | |
| **Standard** | **10s / 10s × 8 × 3** | The default, and the usual clinical prescription |
| Intense | 10s / 5s × 10 × 3 | Shorter rest, harder |
| Endurance | 15s / 10s × 8 × 3 | |
| Custom | anything | contract 1-120s, relax 1-120s, reps, sets, set rest |

### Configuration

`/kegel` → ⚙️ 其它设置:

| Setting | Default | Notes |
|---|---|---|
| Audio | system sounds | system (with volume) → spoken → off |
| End-of-phase ticks | last 3 seconds | 0-10 seconds, or off |
| Visual | flower | or progress bar |
| Flower opens on | relax | or "contract" |
| Log training | on | turning it off stops writes; existing log is kept |
| Ask how it felt | on | turning it off skips the 1-5 prompt |
| Auto-start when the agent works | on | |
| Auto-stop when the agent settles | off | |
| Freeze while the agent is idle | on | if the model finishes before your workout does, the clock freezes instead of burning through phases unattended; it resumes on your next message |
| Prepare countdown | 3s | |

Or edit `~/.pi/agent/kegel.json` directly — the file is shown in the Chinese section above.

### Keys

| Action | Key |
|---|---|
| Pause / resume | `alt+k` |
| Skip phase | `alt+n` |
| End early | `alt+e` |
| Menu | `/kegel` |
| Start a preset directly | `/kegel quick`, `/kegel standard`, … |
| Status | `/kegel status` |

**If `alt+k` does nothing in Ghostty or Terminal.app**: those terminals default to `macos-option-as-alt = false`, so Option+K sends the composed character `˚` instead of `ESC k`. The extension catches `˚` / `˜` / `´` directly, so **it works out of the box with no terminal config**. If you prefer, set `macos-option-as-alt = true` in your Ghostty config; `ctrl+shift+k` / `ctrl+shift+n` / `ctrl+shift+e` also work on terminals that support the kitty keyboard protocol.

### Limitations

- **Audio is macOS-only** (`afplay` / `say`)
- **Short model replies mean short sessions**: if the agent answers in a few seconds the workout gets interrupted almost immediately — that's what "freeze while the agent is idle" is for; it resumes when you next send a message
- **Queued messages don't re-trigger a session**: a follow-up you type while the agent is busy belongs to the same run, so re-arming falls back to `turn_start` (verified)
- **`alt+k` is a global shortcut** and is reserved whether or not a session is running
- **The Braille flower needs a font with U+2800–28FF**: without it you'll see boxes. Ghostty, iTerm and Terminal.app ship one by default
- Not a medical device, and no substitute for a doctor

### Development

The three logic modules run standalone, with no pi dependency:

```bash
# unit tests: state machine, breathing curve, dot rendering, log aggregation (33 tests)
node --experimental-strip-types core.test.ts

# regenerate the README assets (needs pi installed; the script finds pi-tui itself)
node --experimental-strip-types tools/render-frames.mjs   # sample frames (300ms each by default)
python3 tools/make-assets.py                              # PNGs + GIF at true speed
python3 tools/verify-assets.py                            # no eyeballs needed
```

| File | Role |
|---|---|
| `core.ts` | State machine + config validation (pure, no TUI dependency) |
| `bloom.ts` | Braille flower geometry and breathing curve (pure functions) |
| `history.ts` | Training-log data layer + report rendering (pure functions) |
| `widget.ts` | Renders state as a terminal component |
| `index.ts` | Extension entry: events, shortcuts, audio, menu orchestration |
| `core.test.ts` | Unit tests |

The scripts under `tools/` render the **real** `widget.ts` / `bloom.ts` / `history.ts`, so the screenshots cannot drift from what actually ships. `verify-assets.py` exists because asset generation has silently broken three different ways: Menlo has no Braille block (the flower turned into `.notdef` boxes), quantised GIFs shift the background colour (breaking a naive "pixel ≠ background" ink test), and a frame sequence can render while never actually animating.

### Safety

- Don't hold your breath while contracting — breathe normally
- Really relax between reps; permanently half-holding is counterproductive
- Don't practise this while urinating (it interferes with the voiding reflex)
- Stop and see a doctor if you get pain or noticeably worse leaking

## License / 许可

MIT
