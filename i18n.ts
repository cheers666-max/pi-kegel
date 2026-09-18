/**
 * UI strings, English and Chinese.
 *
 * Pure data plus lookup helpers - no pi/TUI dependency, so it stays testable
 * and `core.ts` can use it without dragging in the terminal layer.
 *
 * `Strings` is an interface, and `STRINGS` is typed `Record<Lang, Strings>`,
 * so adding a key to one language without the other is a type error rather
 * than a half-translated menu at runtime. `core.test.ts` also walks both
 * tables to catch the cases the compiler can't (leftover Chinese in the
 * English column, missing preset labels, placeholder mismatches).
 */

export type Lang = "zh" | "en";

export const LANGS: Lang[] = ["zh", "en"];

/** Shown in the language picker; each name is written in its own language. */
/** `1 rep` / `2 reps` - English counts every noun explicitly. */
function plural(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

export const LANG_LABEL: Record<Lang | "auto", string> = {
	auto: "自动",
	zh: "中文",
	en: "English",
};

export const DEFAULT_LANG: Lang = "zh";

export interface Strings {
	/** Window title of the menu. */
	appTitle: string;
	/** Widget header text (no emoji - the widget draws that itself). */
	appTitleText: string;
	/** Spoken/summary name for the plan. */
	phase: Record<"idle" | "prepare" | "contract" | "relax" | "setRest" | "done", string>;
	phaseHint: Record<"prepare" | "contract" | "relax" | "setRest" | "done", string>;
	/** Units used by `formatPlan`. */
	/** Unit for the rep count; the argument lets English pluralize. */
	repUnit: (count: string) => string;
	setUnit: (count: string) => string;
	custom: string;
	/** Widget headline badges (icon + word). */
	headline: Record<"prepare" | "contract" | "relax" | "setRest" | "paused" | "done", string>;
	/** Short inline hints next to the headline. */
	shortHint: Record<"prepare" | "contract" | "relax" | "setRest", string>;
	/** "⏸ paused · alt+k to resume". */
	pausedLine: (toggleKey: string) => string;
	/** Key-hint labels: start/resume/pause, skip, end, settings. */
	keyStart: string;
	keyResume: string;
	keyPause: string;
	keySkip: string;
	keyEnd: string;
	keySettings: string;
	/** Summary line: the plan, the session total, and the time under tension. */
	summary: (plan: string, reps: number, span: string) => string;
	/** Widget footer. */
	widgetHint: (keys: { toggle: string; skip: string; end: string }) => string;
	widgetBusy: string;
	widgetIdlePaused: string;
	/** Widget done line: "共 24 次 · 收缩 4:00". */
	widgetDone: (reps: number, span: string) => string;
	widgetRepSet: (rep: number | string, reps: number | string, set: number | string, sets: number | string) => string;
	/** Set-only counter for phases that aren't reps (prepare / set rest / done). */
	setCounter: (set: number | string, sets: number | string) => string;
	/** Status/footer line while running. */
	statusRunning: (rep: number, reps: number, set: number, sets: number) => string;
	statusPaused: string;

	// ── menu ──
	menuStart: string;
	menuPause: string;
	menuResume: string;
	menuSkip: string;
	menuEnd: string;
	menuDifficulty: string;
	menuHistory: string;
	menuSettings: string;
	menuStatus: string;
	menuClose: string;

	// ── difficulty ──
	presetNames: Record<string, string>;
	presetDetails: Record<string, string>;

	// ── settings ──
	settingsTitle: string;
	/**
	 * Every settings row owns its own separator: it is a function of the value,
	 * not a label to be glued onto one. Concatenating a label and a value by
	 * hand is how "LanguageEnglish" and "结束前滴答最后 3 秒" happen.
	 */
	settingsCue: (value: string) => string;
	settingsTick: (value: string) => string;
	settingsVisual: (value: string) => string;
	settingsBloomOn: (value: string) => string;
	settingsLang: (value: string) => string;
	settingsLog: (value: string) => string;
	settingsAskRating: (value: string) => string;
	settingsAutoStart: (value: string) => string;
	settingsAutoStop: (value: string) => string;
	settingsPauseWhenIdle: (value: string) => string;
	settingsPrepare: (value: string) => string;
	settingsBack: string;
	/** Values that go into the rows above. */
	visualBloom: string;
	visualBar: string;
	bloomOnRelax: string;
	bloomOnContract: string;
	/** Set rest, in the shared "last N seconds" unit. */
	lastSeconds: (seconds: number) => string;
	onOff: (value: boolean) => string;
	systemSound: (percent: number) => string;
	spoken: (voice: string) => string;
	off: string;
	volumeTitle: string;
	tickTitle: string;
	prepareTitle: string;
	secondsValue: (seconds: number) => string;

	// ── status view ──
	statusTitle: string;
	statusDifficulty: (name: string) => string;
	statusPlan: (plan: string) => string;
	statusState: (state: string) => string;
	statusProgress: (reps: number, span: string) => string;
	statusCurrentSet: (set: number, sets: number) => string;
	statusVisual: (value: string) => string;
	statusCue: (value: string) => string;
	statusTick: (value: string) => string;
	statusFlowerSize: (rows: number) => string;
	statusKeysKitty: string;
	statusKeysOption: string;
	statusLog: (sessions: number, streak: number, rating: string) => string;
	statusToday: (sessions: number, reps: number, span: string) => string;
	stateRunning: string;
	statePaused: string;
	stateFinished: string;
	stateIdle: string;

	// ── history ──
	historyTitle: string;
	historyToday: string;
	historyStreak: string;
	/** "2 天" / "2 days". */
	historyStreakValue: (days: number) => string;
	historyTotal: string;
	historyAverage: string;
	historyUnrated: string;
	historyWindowTitle: (days: number, peak: string) => string;
	historySessions: (count: number) => string;
	historyReps: (count: number) => string;
	historyRecent: string;
	historyEmpty: string;
	historyEmptyHint: string;
	historyRateLatest: (when: string, stars: string) => string;
	historyRateNone: string;
	historyNoteLatest: string;
	historyNoteHas: string;
	historyNoteNone: string;
	historyDaysSetting: (days: number) => string;
	historyClear: string;
	historyBack: string;
	historyClearConfirmTitle: string;
	historyClearConfirmBody: (count: number) => string;
	historyCleared: string;
	historyNoteTitle: string;
	historyNotePlaceholder: string;
	historyNoteSaved: string;
	historyNoteRemoved: string;
	historyDaysTitle: string;
	historyNoTrainingToday: string;

	// ── rating ──
	ratingTitle: string;
	ratingScale: Record<number, string>;
	ratingSkip: string;
	ratingRecorded: (stars: string, label: string, todayAverage: string) => string;
	ratingUnrated: string;

	// ── notifications ──
	notifyDone: (summary: string, today: string) => string;
	notifyEnded: (reason: string, summary: string) => string;
	notifyReasonManual: string;
	notifyPlanChanged: (name: string) => string;
	notifyUnknownArg: (arg: string, available: string) => string;
	notifyLogOff: string;
	notifyLangChanged: (label: string) => string;
	notifyNumberRequired: string;
	notifyNoSession: string;
	notifyNotTui: string;
	notifyReasonAgentSettled: string;
	notifyLevelSet: (name: string, plan: string, tail: string) => string;
	estimateMinutes: (minutes: number) => string;
	estimateEndless: string;
	/** Footer status counter while running. */
	statusCounter: (reps: number) => string;
	/** ` · 今日 2 次 / 48 个收缩 / 8:00` and ` · 连续 6 天`. */
	todaySuffix: (sessions: number, reps: number, span: string) => string;
	streakSuffix: (days: number) => string;

	// ── difficulty picker ──
	difficultyTitle: string;
	customOption: string;
	customContractTitle: string;
	customRelaxTitle: string;
	customRepsTitle: string;
	customSetsTitle: string;
	customSetRestTitle: string;
	applyWhenTitle: string;
	applyNext: string;
	applyNow: string;

	/** Spoken cues, and the `say` voice to use when none is configured. */
	voiceCue: Record<"prepare" | "contract" | "relax" | "setRest" | "done", string>;
	defaultVoice: string;
}

const zh: Strings = {
	appTitle: "🧘 凯格尔训练",
	appTitleText: "凯格尔训练",
	phase: {
		idle: "待机",
		prepare: "准备",
		contract: "收缩",
		relax: "放松",
		setRest: "组间休息",
		done: "完成",
	},
	phaseHint: {
		prepare: "坐直，找到盆底肌的位置",
		contract: "向上提紧，保持",
		relax: "完全松开，别憋气",
		setRest: "深呼吸，放松全身",
		done: "训练完成，辛苦了",
	},
	repUnit: () => "次",
	setUnit: () => "组",
	custom: "自定义",
	headline: {
		prepare: "● 准备",
		contract: "▲ 收缩 HOLD",
		relax: "▽ 放松",
		setRest: "≡ 组间休息",
		paused: "⏸ 暂停",
		done: "✅ 完成",
	},
	shortHint: {
		prepare: "找到盆底肌",
		contract: "向上提紧，别憋气",
		relax: "完全松开",
		setRest: "深呼吸",
	},
	pausedLine: (key) => `⏸ 已暂停 · ${key} 继续`,
	keyStart: " 开始",
	keyResume: " 继续",
	keyPause: " 暂停",
	keySkip: " 跳过",
	keyEnd: " 结束",
	keySettings: " 设置",
	summary: (plan, reps, span) => `${plan} · 完成 ${reps} 次 · 累计收缩 ${span}`,
	widgetHint: (k) => `${k.toggle} 暂停 · ${k.skip} 跳过 · ${k.end} 结束 · /kegel 设置`,
	widgetBusy: "模型进行中",
	widgetIdlePaused: "模型空闲，已暂停",
	widgetDone: (reps, span) => `共 ${reps} 次 · 收缩 ${span}`,
	widgetRepSet: (rep, reps, set, sets) => `第 ${rep}/${reps} 次 · 第 ${set}/${sets} 组`,
	setCounter: (set, sets) => `第 ${set}/${sets} 组`,
	statusRunning: (rep, reps, set, sets) => `第 ${rep}/${reps} 次 · 第 ${set}/${sets} 组`,
	statusPaused: "已暂停",

	menuStart: "▶️ 开始训练",
	menuPause: "⏸ 暂停",
	menuResume: "▶️ 继续",
	menuSkip: "⏭ 跳过当前阶段",
	menuEnd: "⏹ 结束训练",
	menuDifficulty: "🎚 选择难度",
	menuHistory: "📈 训练记录",
	menuSettings: "⚙️ 其它设置",
	menuStatus: "ℹ️ 查看状态",
	menuClose: "关闭",

	presetNames: {
		standard: "标准 10/10",
		beginner: "入门 5/5",
		endurance: "耐力 10/5",
		strength: "力量 15/10",
		quick: "快肌 1/1",
		endless: "无限循环 10/10",
	},
	presetDetails: {
		standard: "收缩 10s · 放松 10s · 8 次 × 3 组（约 9 分钟）",
		beginner: "收缩 5s · 放松 5s · 8 次 × 2 组（约 3 分钟）",
		endurance: "收缩 10s · 放松 5s · 10 次 × 3 组（约 8 分钟）",
		strength: "收缩 15s · 放松 10s · 6 次 × 2 组（约 6 分钟）",
		quick: "快速收缩 1s · 放松 1s · 20 次 × 3 组（约 3 分钟）",
		endless: "收缩 10s · 放松 10s · 一直循环（手动结束）",
	},

	settingsTitle: "其它设置",
	settingsCue: (value) => `音效：${value}`,
	settingsTick: (value) => `结束前滴答：${value}`,
	settingsVisual: (value) => `可视化：${value}`,
	settingsBloomOn: (value) => `花瓣绽开于：${value}`,
	settingsLang: (value) => `界面语言：${value}`,
	settingsLog: (value) => `记录训练：${value}`,
	settingsAskRating: (value) => `练完询问感受：${value}`,
	settingsAutoStart: (value) => `模型开始工作时自动开始：${value}`,
	settingsAutoStop: (value) => `模型结束后自动结束：${value}`,
	settingsPauseWhenIdle: (value) => `模型空闲时自动暂停：${value}`,
	settingsPrepare: (value) => `准备倒计时：${value}`,
	settingsBack: "返回",
	visualBloom: "花瓣绽放",
	visualBar: "进度条",
	bloomOnRelax: "放松时（收紧→聚拢）",
	bloomOnContract: "收缩时（收紧→绽开）",
	lastSeconds: (s) => `最后 ${s} 秒`,
	onOff: (v) => (v ? "开" : "关"),
	systemSound: (percent) => `系统音 ${percent}%`,
	spoken: (voice) => `语音（${voice}）`,
	off: "关",
	volumeTitle: "音量 (0-100)",
	tickTitle: "结束前几秒开始滴答？(0-10，0=关)",
	prepareTitle: "准备几秒？(0-30)",
	secondsValue: (s) => `${s}s`,

	statusTitle: "凯格尔训练状态",
	statusDifficulty: (name) => `难度：${name}`,
	statusPlan: (plan) => `计划：${plan}`,
	statusState: (state) => `状态：${state}`,
	statusProgress: (reps, span) => `进度：已完成 ${reps} 次 · 累计收缩 ${span}`,
	statusCurrentSet: (set, sets) => `当前：第 ${set}/${sets} 组`,
	statusVisual: (v) => `可视化：${v}`,
	statusCue: (v) => `音效：${v}`,
	statusTick: (v) => `结束前滴答：${v}`,
	statusFlowerSize: (rows) => `花瓣尺寸：${rows} 行（随终端高度自适应）`,
	statusKeysKitty: "键盘：ctrl+shift+k/n/e 可用（kitty 协议）",
	statusKeysOption: "键盘：alt+k/n/e（Option 字符已自动兼容）或 ctrl+shift+k/n/e",
	statusLog: (sessions, streak, rating) => `记录：共 ${sessions} 次 · 连续 ${streak} 天 · 平均感受 ${rating}`,
	statusToday: (sessions, reps, span) => `今日：${sessions} 次 · ${reps} 个收缩 · ${span}`,
	stateRunning: "进行中",
	statePaused: "已暂停",
	stateFinished: "已完成",
	stateIdle: "待机",

	historyTitle: "📈 训练记录",
	historyToday: "今日",
	historyStreak: "连续",
	historyStreakValue: (d) => `${d} 天`,
	historyTotal: "累计",
	historyAverage: "平均",
	historyUnrated: "未评分",
	historyWindowTitle: (days, peak) => `近 ${days} 天（柱长 = 收缩时长，最长 ${peak}）`,
	historySessions: (n) => `${n} 次`,
	historyReps: (n) => `${n} 个收缩`,
	historyRecent: "最近的感受",
	historyEmpty: "还没有记录。完整练完一次就会自动记一笔，并问你「这次感觉如何」。",
	historyEmptyHint: "提示：手动结束（alt+e）不算完成，不会记入。",
	historyRateLatest: (when, stars) => `⭐ 给最近一次评分（${when} ${stars}）`,
	historyRateNone: "⭐ 给最近一次评分（暂无记录）",
	historyNoteLatest: "📝 给最近一次写备注",
	historyNoteHas: "（已有）",
	historyNoteNone: "（暂无记录）",
	historyDaysSetting: (days) => `📅 显示天数：${days} 天`,
	historyClear: "🗑 清空全部记录",
	historyBack: "返回",
	historyClearConfirmTitle: "清空训练记录？",
	historyClearConfirmBody: (n) => `将删除全部 ${n} 条记录，无法撤销。`,
	historyCleared: "🗑 训练记录已清空",
	historyNoteTitle: "备注（留空则清除）",
	historyNotePlaceholder: "例如：今天漏尿了 / 左侧发力更弱",
	historyNoteSaved: "📝 备注已保存",
	historyNoteRemoved: "📝 备注已清除",
	historyDaysTitle: "记录显示多少天？(3-60)",
	historyNoTrainingToday: "今天还没练，随时 /kegel 开始",

	ratingTitle: "🧘 这次训练感觉如何？",
	ratingScale: {
		1: "很差（疼痛 / 漏尿 / 完全使不上力）",
		2: "偏差（找不到发力感）",
		3: "一般（勉强完成）",
		4: "不错（基本可控）",
		5: "很好（有力、全程撑住）",
	},
	ratingSkip: "跳过（不评分）",
	ratingRecorded: (stars, label, avg) => `🧘 已记录 ${stars} ${label} · 今日感受平均 ${avg}`,
	ratingUnrated: "未评分",

	notifyDone: (summary, today) => `🧘 训练完成 · ${summary}${today}`,
	notifyEnded: (reason, summary) => `🧘 结束训练（${reason}）· ${summary}`,
	notifyReasonManual: "手动结束",
	notifyPlanChanged: (name) => `已切换到 ${name}`,
	notifyUnknownArg: (arg, available) => `未知参数：${arg}。可用：${available}`,
	notifyLogOff: "已关闭记录（已有记录保留，可在「训练记录」里查看/清空）",
	notifyLangChanged: (label) => `界面语言已切换为 ${label}`,
	notifyNumberRequired: "请输入数字",
	notifyNoSession: "当前没有进行中的训练",
	notifyNotTui: "凯格尔训练界面需要交互式 TUI 模式",
	notifyReasonAgentSettled: "模型已结束",
	notifyLevelSet: (name, plan, tail) => `🎚 难度已设为 ${name} · ${plan}${tail}`,
	estimateMinutes: (m) => `（约 ${m} 分钟）`,
	estimateEndless: "（无限循环）",
	statusCounter: (reps) => `✓ ${reps} 次`,
	todaySuffix: (sessions, reps, span) => ` · 今日 ${sessions} 次 / ${reps} 个收缩 / ${span}`,
	streakSuffix: (days) => ` · 连续 ${days} 天`,

	difficultyTitle: "选择难度",
	customOption: "自定义…",
	customContractTitle: "收缩几秒？(1-120)",
	customRelaxTitle: "放松几秒？(1-120)",
	customRepsTitle: "每组做几次？(0 = 无限循环)",
	customSetsTitle: "做几组？(0 = 无限循环)",
	customSetRestTitle: "组间休息几秒？(0 = 不休息)",
	applyWhenTitle: "当前有训练在进行，何时应用？",
	applyNext: "下次开始时应用",
	applyNow: "立即重新开始",

	voiceCue: {
		prepare: "准备",
		contract: "收紧",
		relax: "放松",
		setRest: "休息",
		done: "完成",
	},
	defaultVoice: "Tingting",
};

const en: Strings = {
	appTitle: "🧘 Kegel trainer",
	appTitleText: "Kegel trainer",
	phase: {
		idle: "idle",
		prepare: "get ready",
		contract: "contract",
		relax: "relax",
		setRest: "set rest",
		done: "done",
	},
	phaseHint: {
		prepare: "Sit up straight and find the muscle",
		contract: "Squeeze upward and hold",
		relax: "Let go completely, keep breathing",
		setRest: "Breathe deeply, relax everything",
		done: "Workout complete — nice one",
	},
	repUnit: (count) => (count === "1" ? "rep" : "reps"),
	setUnit: (count) => (count === "1" ? "set" : "sets"),
	custom: "custom",
	headline: {
		prepare: "● GET READY",
		contract: "▲ CONTRACT HOLD",
		relax: "▽ RELAX",
		setRest: "≡ SET REST",
		paused: "⏸ PAUSED",
		done: "✅ DONE",
	},
	shortHint: {
		prepare: "find the muscle",
		contract: "squeeze up, keep breathing",
		relax: "let go completely",
		setRest: "breathe deeply",
	},
	pausedLine: (key) => `⏸ paused · ${key} to resume`,
	keyStart: " start",
	keyResume: " resume",
	keyPause: " pause",
	keySkip: " skip",
	keyEnd: " end",
	keySettings: " settings",
	// The plan gives the per-set prescription ("8 reps x 3 sets"); this is the
	// session total, so it says "total" rather than looking like a repeat.
	summary: (plan, reps, span) => `${plan} · ${plural(reps, "rep", "reps")} total · ${span} under tension`,
	widgetHint: (k) => `${k.toggle} pause · ${k.skip} skip · ${k.end} end · /kegel settings`,
	widgetBusy: "agent working",
	widgetIdlePaused: "agent idle — paused",
	widgetDone: (reps, span) => `${plural(reps, "rep", "reps")} · ${span} under tension`,
	widgetRepSet: (rep, reps, set, sets) => `rep ${rep}/${reps} · set ${set}/${sets}`,
	setCounter: (set, sets) => `set ${set}/${sets}`,
	statusRunning: (rep, reps, set, sets) => `rep ${rep}/${reps} · set ${set}/${sets}`,
	statusPaused: "paused",

	menuStart: "▶️ Start training",
	menuPause: "⏸ Pause",
	menuResume: "▶️ Resume",
	menuSkip: "⏭ Skip phase",
	menuEnd: "⏹ End session",
	menuDifficulty: "🎚 Difficulty",
	menuHistory: "📈 Training log",
	menuSettings: "⚙️ Settings",
	menuStatus: "ℹ️ Status",
	menuClose: "Close",

	presetNames: {
		standard: "Standard 10/10",
		beginner: "Beginner 5/5",
		endurance: "Endurance 10/5",
		strength: "Strength 15/10",
		quick: "Quick 1/1",
		endless: "Endless 10/10",
	},
	presetDetails: {
		standard: "contract 10s · relax 10s · 8 reps × 3 sets (~9 min)",
		beginner: "contract 5s · relax 5s · 8 reps × 2 sets (~3 min)",
		endurance: "contract 10s · relax 5s · 10 reps × 3 sets (~8 min)",
		strength: "contract 15s · relax 10s · 6 reps × 2 sets (~6 min)",
		quick: "fast contract 1s · relax 1s · 20 reps × 3 sets (~3 min)",
		endless: "contract 10s · relax 10s · loops forever (end manually)",
	},

	settingsTitle: "Settings",
	settingsCue: (value) => `Audio: ${value}`,
	settingsTick: (value) => `Countdown ticks: ${value}`,
	settingsVisual: (value) => `Visual: ${value}`,
	visualBloom: "flower",
	visualBar: "progress bar",
	settingsBloomOn: (value) => `Flower opens on: ${value}`,
	bloomOnRelax: "relax (contracting gathers it)",
	bloomOnContract: "contract (contracting opens it)",
	settingsLog: (value) => `Log training: ${value}`,
	settingsAskRating: (value) => `Ask how it felt: ${value}`,
	settingsAutoStart: (value) => `Auto-start when the agent works: ${value}`,
	settingsAutoStop: (value) => `Auto-stop when the agent settles: ${value}`,
	settingsPauseWhenIdle: (value) => `Freeze while the agent is idle: ${value}`,
	settingsPrepare: (value) => `Prepare countdown: ${value}`,
	settingsLang: (value) => `Language: ${value}`,
	settingsBack: "Back",
	lastSeconds: (s) => `last ${s}s`,
	onOff: (v) => (v ? "on" : "off"),
	systemSound: (percent) => `system sounds ${percent}%`,
	spoken: (voice) => `spoken (${voice})`,
	off: "off",
	volumeTitle: "Volume (0-100)",
	tickTitle: "Tick for the last how many seconds? (0-10, 0=off)",
	prepareTitle: "Prepare countdown in seconds? (0-30)",
	secondsValue: (s) => `${s}s`,

	statusTitle: "Kegel trainer status",
	statusDifficulty: (name) => `Difficulty: ${name}`,
	statusPlan: (plan) => `Plan: ${plan}`,
	statusState: (state) => `State: ${state}`,
	statusProgress: (reps, span) => `Progress: ${plural(reps, "rep", "reps")} done · ${span} under tension`,
	statusCurrentSet: (set, sets) => `Current: set ${set}/${sets}`,
	statusVisual: (v) => `Visual: ${v}`,
	statusCue: (v) => `Audio: ${v}`,
	statusTick: (v) => `Countdown ticks: ${v}`,
	statusFlowerSize: (rows) => `Flower size: ${rows} rows (adapts to terminal height)`,
	statusKeysKitty: "Keys: ctrl+shift+k/n/e available (kitty protocol)",
	statusKeysOption: "Keys: alt+k/n/e (Option chars handled) or ctrl+shift+k/n/e",
	statusLog: (sessions, streak, rating) =>
		`Log: ${plural(sessions, "session", "sessions")} · ${streak}-day streak · avg ${rating}`,
	statusToday: (sessions, reps, span) =>
		`Today: ${plural(sessions, "session", "sessions")} · ${plural(reps, "rep", "reps")} · ${span}`,
	stateRunning: "running",
	statePaused: "paused",
	stateFinished: "finished",
	stateIdle: "idle",

	historyTitle: "📈 Training log",
	historyToday: "Today",
	historyStreak: "Streak",
	historyStreakValue: (d) => (d === 1 ? "1 day" : `${d} days`),
	historyTotal: "Total",
	historyAverage: "Average",
	historyUnrated: "unrated",
	historyWindowTitle: (days, peak) =>
		`Last ${plural(days, "day", "days")} (bar = time under tension, peak ${peak})`,
	historySessions: (n) => plural(n, "session", "sessions"),
	historyReps: (n) => plural(n, "rep", "reps"),
	historyRecent: "Recent ratings",
	historyEmpty: "No sessions logged yet. Finish a full workout and it's recorded automatically, then you're asked how it felt.",
	historyEmptyHint: "Note: ending early (alt+e) doesn't count as a finished session.",
	historyRateLatest: (when, stars) => `⭐ Rate the latest (${when} ${stars})`,
	historyRateNone: "⭐ Rate the latest (nothing logged yet)",
	historyNoteLatest: "📝 Add a note to the latest",
	historyNoteHas: " (has one)",
	historyNoteNone: " (nothing logged yet)",
	historyDaysSetting: (days) => `📅 Days shown: ${days}`,
	historyClear: "🗑 Clear the whole log",
	historyBack: "Back",
	historyClearConfirmTitle: "Clear the training log?",
	historyClearConfirmBody: (n) => `This deletes all ${n} entries and cannot be undone.`,
	historyCleared: "🗑 Training log cleared",
	historyNoteTitle: "Note (leave empty to remove)",
	historyNotePlaceholder: "e.g. leaked once today / left side feels weaker",
	historyNoteSaved: "📝 Note saved",
	historyNoteRemoved: "📝 Note removed",
	historyDaysTitle: "How many days should the log show? (3-60)",
	historyNoTrainingToday: "nothing yet today — /kegel to start",

	ratingTitle: "🧘 How did that feel?",
	ratingScale: {
		1: "bad (pain / leaking / couldn't engage)",
		2: "off (couldn't find the contraction)",
		3: "ok (got through it)",
		4: "good (mostly controlled)",
		5: "great (strong throughout)",
	},
	ratingSkip: "Skip (no rating)",
	ratingRecorded: (stars, label, avg) => `🧘 Logged ${stars} ${label} · today's average ${avg}`,
	ratingUnrated: "unrated",

	notifyDone: (summary, today) => `🧘 Workout complete · ${summary}${today}`,
	notifyEnded: (reason, summary) => `🧘 Session ended (${reason}) · ${summary}`,
	notifyReasonManual: "manual",
	notifyPlanChanged: (name) => `Switched to ${name}`,
	notifyUnknownArg: (arg, available) => `Unknown argument: ${arg}. Available: ${available}`,
	notifyLogOff: "Logging off (existing entries are kept — see Training log)",
	notifyLangChanged: (label) => `UI language switched to ${label}`,
	notifyNumberRequired: "Please enter a number",
	notifyNoSession: "No session in progress",
	notifyNotTui: "The kegel widget needs an interactive TUI",
	notifyReasonAgentSettled: "agent settled",
	notifyLevelSet: (name, plan, tail) => `🎚 Difficulty set to ${name} · ${plan}${tail}`,
	estimateMinutes: (m) => ` (~${m} min)`,
	estimateEndless: " (loops forever)",
	statusCounter: (reps) => `✓ ${plural(reps, "rep", "reps")}`,
	todaySuffix: (sessions, reps, span) =>
		` · today ${plural(sessions, "session", "sessions")} / ${plural(reps, "rep", "reps")} / ${span}`,
	streakSuffix: (days) => ` · ${days}-day streak`,

	difficultyTitle: "Difficulty",
	customOption: "Custom…",
	customContractTitle: "Contract for how many seconds? (1-120)",
	customRelaxTitle: "Relax for how many seconds? (1-120)",
	customRepsTitle: "Reps per set? (0 = endless)",
	customSetsTitle: "How many sets? (0 = endless)",
	customSetRestTitle: "Rest between sets, in seconds? (0 = none)",
	applyWhenTitle: "A session is running — apply when?",
	applyNext: "Apply on next start",
	applyNow: "Restart now",

	voiceCue: {
		prepare: "get ready",
		contract: "squeeze",
		relax: "relax",
		setRest: "rest",
		done: "done",
	},
	defaultVoice: "Samantha",
};

export const STRINGS: Record<Lang, Strings> = { zh, en };

export function t(lang: Lang): Strings {
	return STRINGS[lang] ?? STRINGS[DEFAULT_LANG];
}

/** Config values come from a JSON file; validate instead of trusting them. */
export function pickLang(value: unknown, fallback: Lang = DEFAULT_LANG): Lang {
	return value === "en" || value === "zh" ? value : fallback;
}

/**
 * Guess from the environment (`LANG` / `LC_ALL`), so an English-locale user
 * gets English UI without touching the config. Chinese locales get Chinese;
 * everything else is English.
 */
export function detectLang(env: Record<string, string | undefined> = process.env): Lang {
	const raw = (env.LC_ALL || env.LC_MESSAGES || env.LANG || "").toLowerCase();
	if (raw.startsWith("zh")) return "zh";
	if (raw) return "en";
	return DEFAULT_LANG;
}

/** Resolve `lang: "auto"` (the default) against the environment. */
export function resolveLang(value: unknown, env?: Record<string, string | undefined>): Lang {
	if (value === "zh" || value === "en") return value;
	return detectLang(env);
}

/** The next language in the picker cycle. */
/**
 * The `say` voice to use: whatever is configured, else the language's default.
 * An unknown voice name makes `say` print a list of voices and play nothing, so
 * falling back to the language default is friendlier than passing it through.
 */
export function resolveVoice(lang: Lang, configured: string): string {
	const trimmed = configured.trim();
	return trimmed || t(lang).defaultVoice;
}

export function nextLang(current: Lang): Lang {
	const index = LANGS.indexOf(current);
	return LANGS[(index + 1) % LANGS.length];
}

/** `10s/10s · 8 reps × 3 sets`; endless plans read `∞`. */
export function formatPlanIn(lang: Lang, config: {
	contractSec: number;
	relaxSec: number;
	reps: number;
	sets: number;
}): string {
	const s = t(lang);
	const reps = config.reps === 0 ? "∞" : String(config.reps);
	const sets = config.sets === 0 ? "∞" : String(config.sets);
	return `${config.contractSec}s/${config.relaxSec}s · ${reps} ${s.repUnit(reps)} × ${sets} ${s.setUnit(sets)}`;
}

/** Preset label for menus: `标准 10/10 — 收缩 10s · …`. */
export function presetLabelIn(lang: Lang, id: string): string {
	const s = t(lang);
	return `${s.presetNames[id] ?? id} — ${s.presetDetails[id] ?? ""}`;
}
