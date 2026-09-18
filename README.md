# pi-kegel 🧘

**English** | [简体中文](./README.zh-CN.md)

A [pi](https://github.com/earendil-works/pi) extension that turns the time you spend waiting for the model into pelvic-floor training.

When the agent starts working, a flower drawn in **Braille dots** blooms above the editor: contract for 10 seconds, relax for 10, repeat. It disappears when you're done, asks how it felt, and keeps a daily log. No timer to remember, no app to switch to — you were going to sit there waiting anyway.

![Training demo](assets/demo.en.gif)

> The GIF plays at **true speed**, not sped up. The demo uses a shortened 5s/5s × 2 prescription so the file stays reasonable — the default is 10s/10s × 8 × 3.

| Contracting — the petals gather into a bud | Relaxing — they open back up |
|---|---|
| ![Contract](assets/contract.en.png) | ![Relax](assets/relax.en.png) |

The interface ships in **English and Chinese** — pick it under ⚙️ Settings → Language, or run `/kegel lang en`. Screenshots above are the English UI.

---

## Why

Kegel training isn't hard to understand — it's hard to *keep doing*. The prescription is boring: three sets of ten, ten seconds per hold, roughly three minutes a day, every day. And you can't do anything else while you do it, because the whole point is paying attention to the contraction.

Waiting for an AI to write code is exactly that kind of window: you're at the keyboard, your hands are idle, and you'd rather not context-switch. So the design goal here is **zero activation cost** — you never decide "I should train today". The agent starts working, the flower appears.

## Install

```bash
git clone https://github.com/cheers666-max/pi-kegel.git ~/.pi/agent/extensions/kegel
```

Then **restart pi** (extensions load at startup). Run `/kegel` to check it's there.

To update:

```bash
cd ~/.pi/agent/extensions/kegel && git pull
```

> No git? Drop `index.ts`, `core.ts`, `widget.ts`, `bloom.ts` and `history.ts` into `~/.pi/agent/extensions/kegel/`.

## Usage

Start pi and send a message as usual. When the model starts working:

1. A flower and a countdown appear above the editor (3-second prepare)
2. **Contract** — squeeze upward like you're stopping urine mid-flow, hold until the flower gathers into a bud and the countdown hits zero
3. **Relax** — fully let go (this part matters more than the squeeze; don't half-hold)
4. Eight reps per set, three sets, 30 seconds between sets
5. When the plan finishes it asks "how did that feel?", you pick 1-5, and it gets out of the way

You never need to touch the keyboard mid-session, but you can: `alt+k` pause, `alt+n` skip a phase, `alt+e` end early. See [Keys](#keys).

## The flower

Everything is drawn with **Braille patterns** (U+2800–U+28FF), where one character cell is a 2×4 dot grid. That's what lets a flower fit in a dozen columns and still have smooth edges in a terminal. It scales with the breathing curve:

- **Contracting** pulls the petals into a bud (diameter shrinks to about 1/2.6)
- **Relaxing** opens them back up
- The phase boundaries are designed so nothing jumps: gathering always starts from fully open, opening always starts from the bud. There's a test for that.
- During idle phases (prepare, set rest) the flower breathes gently around *the starting point of the next contraction*, so you can see where you're heading

You can flip which phase opens the flower (`bloomOn: "contract"`) — some people find that more intuitive. It takes effect immediately and persists.

The flower size adapts to terminal height (about a third of the screen). Below 26 rows or 36 columns it falls back to a compact progress bar.

## Audio cues

Every phase change makes a sound, so you can train with your eyes closed:

| Moment | System sound | Spoken mode (EN) | Spoken mode (ZH) |
|--------|--------------|--------------|--------------|
| Prepare | `Morse` | "get ready" | 准备 |
| Start **contract** | `Tink` (bright, high) | "squeeze" | 收紧 |
| Start **relax** | `Blow` (airy, soft) | "relax" | 放松 |
| Set rest | `Purr` | "rest" | 休息 |
| Final N seconds of a phase (once per second) | `Pop` at 45% volume | 3 / 2 / 1 | 3 / 2 / 1 |
| Done | `Glass` | "done" | 完成 |

- **Ticking** (last 3 seconds by default) tells you a boundary is coming without looking. Phases shorter than 3.5s never tick — otherwise the rapid 1s/1s preset becomes a stream of clicks
- **Spoken mode** uses macOS `say`, with the voice picked from your UI language (`Samantha` for English, `Tingting` for Chinese) — override it with the `voice` setting
- **Volume** via `afplay -v`, 0-100%
- macOS only (`afplay` / `say`); silent everywhere else

## Training log

Every run that **finishes naturally** is recorded (ending early with `alt+e` is not), and you're asked to rate it 1-5:

| Score | Meaning |
|---|---|
| 5 | Great — strong throughout, held every rep |
| 4 | Good — mostly controlled |
| 3 | OK — got through it |
| 2 | Off — couldn't find the contraction |
| 1 | Bad — pain, leaking, or couldn't engage at all |

The rating isn't decoration. The real risk with pelvic-floor training is doing it wrong without noticing, so a run of 1s and 2s is a signal: see a doctor, or you're too tired to train today.

`/kegel` → **📈 Training log** shows:

![Training log](assets/menu.en.png)

- Today's sessions, total contractions, total time, and today's average rating
- The current streak (an empty today doesn't break it), lifetime totals, average rating
- A per-day bar chart for the last N days (bar length = contraction time; gaps are drawn as `·····` rather than silently skipped)
- Your last five ratings and notes

The same menu lets you re-rate the last session, add a note, change the window, or clear the log.

Data lives in `~/.pi/agent/kegel-history.jsonl`, one JSON object per finished session — plain text, greppable, easy to back up:

```bash
# how much you trained each day this week
tail -7 ~/.pi/agent/kegel-history.jsonl | jq -r '"\(.at|todate) \(.reps) reps"'
```

> Each line stores: timestamp, reps completed, sets, contract/relax seconds, total contraction time, session duration, whether it finished, the rating, and an optional note. No personal identifiers, and nothing leaves your machine.

## Presets

| Preset | Contract / relax | Reps × sets | Set rest | Roughly |
|---|---|---|---|---|
| Quick 1/1 | 1s / 1s | 20 × 3 | 30s | 3 min — fast-twitch fibres |
| Beginner 5/5 | 5s / 5s | 8 × 2 | 30s | 3 min — start here if you can't feel the contraction |
| **Standard 10/10** | **10s / 10s** | **8 × 3** | 30s | 9 min — the default, and the usual clinical prescription |
| Endurance 10/5 | 10s / 5s | 10 × 3 | 30s | 8 min — shorter rest, harder |
| Strength 15/10 | 15s / 10s | 6 × 2 | 40s | 6 min — long holds |
| Endless 10/10 | 10s / 10s | ∞ | 30s | loops until you stop it |
| Custom | 1-120s / 1-120s | 0-200 × 0-50 | 0-300s | anything (`0` reps or sets means endless) |

## Configuration

`/kegel` → ⚙️ **Settings**:

| Setting | Default | Notes |
|---|---|---|
| Language | auto | follows `$LANG`; Chinese locales get Chinese, everything else English. Also `/kegel lang zh` / `en` / `auto` |
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

Or edit `~/.pi/agent/kegel.json` directly:

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
  "voice": "",
  "visual": "bloom",
  "bloomOn": "relax",
  "log": true,
  "askRating": true,
  "historyDays": 14,
  "lang": "auto"
}
```

Unknown or out-of-range values are clamped on load, and the pre-0.2 `sound: true/false` spelling is migrated automatically.

## Keys

| Action | Key |
|---|---|
| Pause / resume | `alt+k` |
| Skip phase | `alt+n` |
| End early | `alt+e` |
| Menu | `/kegel` |
| Start a preset directly | `/kegel quick`, `/kegel standard`, … |
| Status | `/kegel status` |
| Switch language | `/kegel lang en` (or `zh` / `auto`; no argument cycles) |

**If `alt+k` does nothing in Ghostty or Terminal.app**: those terminals default to `macos-option-as-alt = false`, so Option+K sends the composed character `˚` instead of `ESC k`. The extension catches `˚` / `˜` / `´` directly, so **it works out of the box with no terminal config**. If you prefer, set `macos-option-as-alt = true` in your Ghostty config; `ctrl+shift+k` / `ctrl+shift+n` / `ctrl+shift+e` also work on terminals that support the kitty keyboard protocol.

## Limitations

- **Audio is macOS-only** (`afplay` / `say`)
- **Short model replies mean short sessions**: if the agent answers in a few seconds the workout gets interrupted almost immediately — that's what "freeze while the agent is idle" is for; it resumes when you next send a message
- **Queued messages don't re-trigger a session**: a follow-up you type while the agent is busy belongs to the same run, so re-arming falls back to `turn_start` (verified)
- **`alt+k` is a global shortcut** and is reserved whether or not a session is running
- **The Braille flower needs a font with U+2800–28FF**: without it you'll see boxes. Ghostty, iTerm and Terminal.app ship one by default
- Not a medical device, and no substitute for a doctor

## Development

The logic modules run standalone, with no pi dependency:

```bash
# unit tests: state machine, breathing curve, dot rendering, log aggregation,
# i18n key parity and pluralization (47 tests)
node --experimental-strip-types core.test.ts

# regenerate the README assets for one language (needs pi installed; the
# scripts find pi-tui themselves). Repeat with `--lang en` for the English set.
node --experimental-strip-types tools/render-frames.mjs   # sample frames (300ms each by default)
python3 tools/make-assets.py                              # PNGs + GIF at true speed
python3 tools/verify-assets.py                            # no eyeballs needed
```

| File | Role |
|---|---|
| `core.ts` | State machine + config validation (pure, no TUI dependency) |
| `bloom.ts` | Braille flower geometry and breathing curve (pure functions) |
| `history.ts` | Training-log data layer + report rendering (pure functions) |
| `i18n.ts` | Every user-facing string, in both languages (pure functions) |
| `widget.ts` | Renders state as a terminal component |
| `index.ts` | Extension entry: events, shortcuts, audio, menu orchestration |
| `core.test.ts` | Unit tests (the widget's language rendering included) |

The scripts under `tools/` render the **real** `widget.ts` / `bloom.ts` / `history.ts`, so the screenshots cannot drift from what actually ships. `verify-assets.py` exists because asset generation has silently broken three different ways: Menlo has no Braille block (the flower turned into `.notdef` boxes), quantised GIFs shift the background colour (breaking a naive "pixel ≠ background" ink test), and a frame sequence can render while never actually animating.

## Safety

- Don't hold your breath while contracting — breathe normally
- Really relax between reps; permanently half-holding is counterproductive
- Don't practise this while urinating (it interferes with the voiding reflex)
- Stop and see a doctor if you get pain or noticeably worse leaking

## License

MIT
