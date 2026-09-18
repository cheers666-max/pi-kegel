/**
 * Kegel trainer extension for pi.
 *
 * Shows a live contract/relax timer above the editor while the model is working,
 * so you can train your pelvic floor while waiting for the agent.
 *
 * - 10s contract / 10s relax by default, difficulty presets from 1/1 to 15/10
 * - auto-starts when the agent starts working, auto-hides when the plan ends
 * - `/kegel` for difficulty + settings, alt+k / alt+n / alt+e for hands-free control
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { isKittyProtocolActive, type TUI } from "@earendil-works/pi-tui";
import {
	DEFAULT_CONFIG,
	KegelEngine,
	PRESETS,
	type KegelConfig,
	type PhaseChange,
	configFromPreset,
	estimateDuration,
	formatClock,
	formatPlan,
	presetIdFor,
} from "./core.ts";
import { KegelWidget, WIDGET_KEY, formatSummary } from "./widget.ts";
import {
	LANG_LABEL,
	type Lang,
	nextLang,
	presetLabelIn,
	resolveLang,
	resolveVoice,
	t,
} from "./i18n.ts";
import {
	type HistoryEntry,
	appendEntry,
	historyReport,
	parseHistory,
	rateSession,
	ratingLabel,
	serializeHistory,
	dayKey,
	stars,
	totals,
} from "./history.ts";

const STATUS_KEY = "kegel";
const TICK_MS = 100;
/** How long the "done" summary stays on screen before the widget hides. */
const DONE_LINGER_MS = 8000;

/** One system sound per transition. Timbres are deliberately distinct. */
const SOUND_FILES: Record<string, string> = {
	prepare: "Morse.aiff",
	contract: "Tink.aiff",
	relax: "Blow.aiff",
	setRest: "Purr.aiff",
	done: "Glass.aiff",
};
/** The final-seconds tick: short and quiet, so it reads as a countdown. */
const TICK_SOUND = "Pop.aiff";
const TICK_VOLUME_FACTOR = 0.45;
/** Spoken cue text for the current language. */
function voiceText(phase: string): string {
	const cues = str().voiceCue as Record<string, string | undefined>;
	return cues[phase] ?? "";
}

/** `say` voice for the current language (see `resolveVoice` in i18n.ts). */
function voice(): string {
	return resolveVoice(lang(), engine.config.voice);
}
/** Phases shorter than this never tick - a 1s rep would just chatter. */
const TICK_MIN_PHASE_MS = 3500;

type KegelAction = "toggle" | "skip" | "end";

/**
 * macOS terminals send Option+K as the composed character ˚ rather than ESC+k
 * unless "option as alt/meta" is enabled. Ghostty defaults `macos-option-as-alt`
 * to false and Terminal.app leaves Option composing too, so `alt+k` never reaches
 * the keybinding. These composed characters match no keybinding at all, so while a
 * session is live we intercept and consume them as the equivalent alt+ shortcut.
 */
const OPTION_CHAR_ACTIONS: Record<string, KegelAction> = {
	"\u02da": "toggle", // Option+K → ˚
	"\u02dc": "skip", // Option+N → ˜
	"\u00b4": "end", // Option+E → ´
};

// ── module state (one session per pi process, reset on session_start) ────────

let engine = new KegelEngine(DEFAULT_CONFIG);
let activeCtx: ExtensionContext | null = null;
let agentBusy = false;
let ticker: ReturnType<typeof setInterval> | null = null;
let lingerTimer: ReturnType<typeof setTimeout> | null = null;
let tuiRef: TUI | null = null;
let widgetRef: KegelWidget | null = null;
let widgetVisible = false;
let lastStatus = "";
/** Session was started by agent_start rather than by the user. */
let autoStartedByAgent = false;
/** User ended the workout (or it finished) - don't re-arm until they prompt again. */
let autoStartSuppressed = false;
/** Session is currently frozen because the agent went idle. */
let autoPausedForIdle = false;
/** Last `secondsLeft` we ticked, so each second fires exactly once. */
let lastTickSecond = -1;
let unlistenTerminalInput: (() => void) | null = null;

/** The active language: resolved from `config.lang` ("auto" follows the env). */
function lang(): Lang {
	return resolveLang(engine.config.lang);
}

function str() {
	return t(lang());
}

// ── persistence ─────────────────────────────────────────────────────────────

function configFile(): string {
	return join(getAgentDir(), "kegel.json");
}

/** One JSONL line per finished session. */
function historyFile(): string {
	return join(getAgentDir(), "kegel-history.jsonl");
}

function loadHistory(): HistoryEntry[] {
	try {
		return parseHistory(readFileSync(historyFile(), "utf8"));
	} catch {
		return [];
	}
}

/**
 * The log is small enough to rewrite wholesale. Doing it this way also heals a
 * torn line left behind by a hard kill, which an append-only writer cannot.
 */
function writeHistory(entries: HistoryEntry[]): void {
	try {
		const file = historyFile();
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, serializeHistory(entries), "utf8");
	} catch {
		// best effort only
	}
}

/** Append a finished session and return the entry we wrote (for rating later). */
function recordSession(entry: HistoryEntry): HistoryEntry | null {
	if (!engine.config.log) return null;
	try {
		const next = appendEntry(loadHistory(), entry);
		writeHistory(next);
		return entry;
	} catch {
		return null;
	}
}

function loadConfig(): Partial<KegelConfig> {
	try {
		const parsed: unknown = JSON.parse(readFileSync(configFile(), "utf8"));
		if (parsed && typeof parsed === "object") return parsed as Partial<KegelConfig>;
	} catch {
		// missing or unreadable file: fall back to defaults
	}
	return {};
}

function saveConfig(config: KegelConfig): void {
	try {
		const file = configFile();
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	} catch {
		// best effort only
	}
}

// ── audio cues ─────────────────────────────────────────────────────────────

const isMac = process.platform === "darwin";

/** Fire-and-forget a detached process; failures are silent. */
function playDetached(cmd: string, args: string[]): void {
	try {
		spawn(cmd, args, { stdio: "ignore" }).unref();
	} catch {
		// afplay/say missing: silent no-op
	}
}

function speak(text: string): void {
	playDetached("say", ["-v", voice(), text]);
}

/**
 * Announce a transition (or a countdown tick).
 *
 * `tick` is the last-seconds countdown; it uses a quieter, shorter sound and
 * says the remaining number in voice mode.
 */
function cue(kind: string, secondsLeft?: number): void {
	const { cue: mode } = engine.config;
	if (mode === "off" || !isMac) return;

	if (mode === "voice") {
		const text = kind === "tick" ? String(secondsLeft ?? "") : voiceText(kind);
		if (text) speak(text);
		return;
	}

	const file = kind === "tick" ? TICK_SOUND : (SOUND_FILES[kind] ?? "Tink.aiff");
	const volume = kind === "tick" ? engine.config.volume * TICK_VOLUME_FACTOR : engine.config.volume;
	playDetached("afplay", ["-v", volume.toFixed(2), `/System/Library/Sounds/${file}`]);
}

/** Play a sample of the current cue style (used when previewing in settings). */
function previewCue(): void {
	cue("contract");
}

// ── widget + footer plumbing ────────────────────────────────────────────────

function ensureWidget(ctx: ExtensionContext): void {
	if (ctx.mode !== "tui") return;
	ctx.ui.setWidget(
		WIDGET_KEY,
		(tui, theme) => {
			tuiRef = tui;
			widgetRef = new KegelWidget(
				engine,
				() => activeCtx?.ui.theme ?? theme,
				() => agentBusy,
				() => tui.terminal?.rows ?? 40,
				() => engine.config.visual,
				() => lang(),
			);
			return widgetRef;
		},
		{ placement: "aboveEditor" },
	);
	widgetVisible = true;
}

/** Force the live widget to rebuild on the next render (e.g. after a settings change). */
function invalidateWidget(): void {
	widgetRef?.invalidate();
	tuiRef?.requestRender();
}

function hideWidget(ctx: ExtensionContext | null): void {
	if (!ctx || !widgetVisible) return;
	if (ctx.mode !== "tui") {
		widgetVisible = false;
		return;
	}
	ctx.ui.setWidget(WIDGET_KEY, undefined);
	tuiRef = null;
	widgetRef = null;
	widgetVisible = false;
}

function refreshStatus(ctx: ExtensionContext | null): void {
	if (!ctx || !ctx.hasUI) return;
	const theme = ctx.ui.theme;
	let text: string | undefined;
	if (engine.running) {
		const icon = engine.paused ? "⏸" : engine.phase === "contract" ? "▲" : engine.phase === "relax" ? "▽" : "●";
		const color = engine.paused ? "warning" : engine.phase === "contract" ? "warning" : "success";
		text = theme.fg(color, `${icon} ${engine.secondsLeft}s`);
	} else if (engine.finished) {
		text = theme.fg("success", str().statusCounter(engine.completedReps));
	}
	if (text === lastStatus) return;
	lastStatus = text ?? "";
	ctx.ui.setStatus(STATUS_KEY, text);
}

function requestRender(): void {
	tuiRef?.requestRender();
}

// ── session lifecycle ───────────────────────────────────────────────────────

function clearLinger(): void {
	if (lingerTimer) {
		clearTimeout(lingerTimer);
		lingerTimer = null;
	}
}

function startTicker(): void {
	if (ticker) return;
	lastTickSecond = -1;
	ticker = setInterval(() => {
		const events = engine.advance(TICK_MS);
		if (events.length > 0) handlePhaseChanges(events);
		maybeTick();
		refreshStatus(activeCtx);
		requestRender();
		if (!engine.running) {
			stopTicker();
			if (engine.finished) onFinished();
		}
	}, TICK_MS);
}

/**
 * Count the phase down out loud (or with a quiet click) so you can exercise
 * without watching the screen. Fires once per second for the final
 * `tickLastSec` seconds of a long-enough phase.
 */
function maybeTick(): void {
	const limit = engine.config.tickLastSec;
	if (limit <= 0 || engine.phase === "done" || !engine.running || engine.paused) {
		lastTickSecond = -1;
		return;
	}
	if (engine.phaseTotalMs < TICK_MIN_PHASE_MS) {
		lastTickSecond = -1;
		return;
	}
	const left = engine.secondsLeft;
	if (left > limit || left <= 0 || left === lastTickSecond) return;
	lastTickSecond = left;
	cue("tick", left);
}

function stopTicker(): void {
	if (ticker) {
		clearInterval(ticker);
		ticker = null;
	}
}

function handlePhaseChanges(events: PhaseChange[]): void {
	const last = events[events.length - 1];
	if (!last) return;
	lastTickSecond = -1;
	cue(last.to);
}

function beginSession(ctx: ExtensionContext, source: "auto" | "manual"): void {
	clearLinger();
	autoStartedByAgent = source === "auto";
	autoPausedForIdle = false;
	lastTickSecond = -1;
	const events = engine.start();
	// `start()` only reports transitions for zero-length phases, so the opening
	// phase has to be announced explicitly or "prepare" would be silent.
	if (events.length > 0) handlePhaseChanges(events);
	else cue(engine.phase);
	ensureWidget(ctx);
	startTicker();
	refreshStatus(ctx);
	requestRender();
}

function endSession(ctx: ExtensionContext | null, reason: string): void {
	clearLinger();
	const wasRunning = engine.running;
	const summary = formatSummary(engine);
	stopTicker();
	engine.stop();
	hideWidget(ctx);
	lastStatus = "";
	autoStartedByAgent = false;
	autoPausedForIdle = false;
	// They asked to stop: don't pop the flower back up for the rest of this run.
	autoStartSuppressed = true;
	ctx?.ui.setStatus(STATUS_KEY, undefined);
	if (wasRunning && ctx?.hasUI) ctx.ui.notify(str().notifyEnded(reason, summary), "info");
}

function onFinished(): void {
	clearLinger();
	// The phase transition already fired the "done" cue - don't play it twice.
	refreshStatus(activeCtx);
	// The plan is done; let it linger, then stay away until the next prompt.
	autoStartSuppressed = true;
	// Record first (synchronously, before finishSession's first await) so the
	// "today" tally below already includes this session.
	void finishSession(activeCtx, "done");
	if (activeCtx?.hasUI) {
		activeCtx.ui.notify(str().notifyDone(formatSummary(engine, lang()), todaySuffix()), "info");
	}
	lingerTimer = setTimeout(() => {
		lingerTimer = null;
		hideWidget(activeCtx);
		lastStatus = "";
		activeCtx?.ui.setStatus(STATUS_KEY, undefined);
		requestRender();
	}, DONE_LINGER_MS);
}

// ── training log ────────────────────────────────────────────────────────────

function entryFromEngine(at: number, end: "done" | "stopped"): HistoryEntry {
	return {
		at,
		reps: engine.completedReps,
		sets: engine.config.sets,
		contractSec: engine.config.contractSec,
		relaxSec: engine.config.relaxSec,
		contractMs: engine.totalContractMs,
		durationMs: engine.elapsedMs,
		end,
	};
}

/**
 * Persist a session, then offer the 1-5 rating. Only naturally-finished runs ask:
 * someone who hit alt+e wants out, not a questionnaire.
 */
async function finishSession(ctx: ExtensionContext | null, end: "done" | "stopped"): Promise<void> {
	if (!engine.config.log || engine.completedReps <= 0) return;
	const entry = recordSession(entryFromEngine(Date.now(), end));
	if (!entry || end !== "done") return;
	if (!engine.config.askRating || !ctx?.hasUI) return;
	try {
		await rateSessionDialog(ctx, entry.at);
	} catch {
		// the dialog may be dismissed by a host that is closing down
	}
}

/** The 1-5 "how did that feel?" dialog. Also reachable from the log menu. */
async function rateSessionDialog(ctx: ExtensionContext, at: number): Promise<void> {
	const texts = str();
	const options = [5, 4, 3, 2, 1].map((score) => `${score} · ${texts.ratingScale[score]}`);
	options.push(texts.ratingSkip);
	const choice = await ctx.ui.select(texts.ratingTitle, options);
	if (!choice || choice === texts.ratingSkip) return;
	const score = Number.parseInt(choice, 10);
	if (!Number.isFinite(score)) return;
	const history = rateSession(loadHistory(), at, score);
	writeHistory(history);
	const rated = history.find((item) => item.at === at);
	const agg = totals(history, Date.now());
	ctx.ui.notify(
		texts.ratingRecorded(
			stars(rated?.rating),
			ratingLabel(lang(), rated?.rating),
			agg.rating === undefined ? "—" : agg.rating.toFixed(1),
		),
		"info",
	);
}

/** `/kegel` -> training log: the report plus the actions that edit it. */
async function openHistory(ctx: ExtensionContext): Promise<void> {
	while (true) {
		const history = loadHistory();
		const texts = str();
		const report = historyReport(ctx.ui.theme, history, Date.now(), engine.config.historyDays, lang());
		const latest = history[history.length - 1];
		const actions = [
			latest
				? texts.historyRateLatest(dayLabel(latest.at), stars(latest.rating))
				: texts.historyRateNone,
			latest
				? `${texts.historyNoteLatest}${latest.note ? texts.historyNoteHas : ""}`
				: `${texts.historyNoteLatest}${texts.historyNoteNone}`,
			texts.historyDaysSetting(engine.config.historyDays),
			texts.historyClear,
			texts.historyBack,
		];
		const choice = await ctx.ui.select(texts.historyTitle, [...report, "", ...actions]);
		if (!choice || choice === texts.historyBack) return;
		if (choice.startsWith("⭐")) {
			if (latest) await rateSessionDialog(ctx, latest.at);
		} else if (choice.startsWith("📝")) {
			if (!latest) continue;
			const note = await ctx.ui.input(texts.historyNoteTitle, latest.note ?? texts.historyNotePlaceholder);
			if (note === undefined) continue;
			writeHistory(rateSession(loadHistory(), latest.at, latest.rating, note));
			ctx.ui.notify(note.trim() ? texts.historyNoteSaved : texts.historyNoteRemoved, "info");
		} else if (choice.startsWith("📅")) {
			const days = await askNumber(ctx, texts.historyDaysTitle, String(engine.config.historyDays), 3, 60);
			if (days === undefined) continue;
			engine.applyConfig({ historyDays: days });
			saveConfig(engine.config);
		} else if (choice.startsWith("🗑")) {
			const ok = await ctx.ui.confirm(
				texts.historyClearConfirmTitle,
				texts.historyClearConfirmBody(history.length),
			);
			if (!ok) continue;
			writeHistory([]);
			ctx.ui.notify(texts.historyCleared, "info");
		}
	}
}

function dayLabel(at: number): string {
	return `${dayKey(at).slice(5)} ${new Date(at).toTimeString().slice(0, 5)}`;
}

/** ` · today 2 sessions / 8:00` - read from the log, so it survives restarts. */
function todaySuffix(): string {
	if (!engine.config.log) return "";
	try {
		const now = Date.now();
		const entries = loadHistory().filter((entry) => dayKey(entry.at) === dayKey(now));
		if (entries.length === 0) return "";
		const reps = entries.reduce((sum, entry) => sum + entry.reps, 0);
		const contractMs = entries.reduce((sum, entry) => sum + entry.contractMs, 0);
		const agg = totals(loadHistory(), now);
		const texts = str();
		const streak = agg.streak > 1 ? texts.streakSuffix(agg.streak) : "";
		return texts.todaySuffix(entries.length, reps, formatClock(contractMs)) + streak;
	} catch {
		return "";
	}
}

// ── actions shared by shortcuts and the command ─────────────────────────────

function sessionLive(): boolean {
	return engine.running || widgetVisible;
}

function runAction(ctx: ExtensionContext, action: KegelAction): void {
	if (action === "toggle") toggleSession(ctx);
	else if (action === "skip") skipPhase(ctx);
	else endSession(ctx, str().notifyReasonManual);
}

/**
 * Catch the macOS Option+letter fallback characters. This is what makes `alt+k`
 * work on a stock Ghostty / Terminal.app setup without any config change.
 */
function registerOptionCharFallback(ctx: ExtensionContext): void {
	unlistenTerminalInput?.();
	unlistenTerminalInput = null;
	if (ctx.mode !== "tui") return;
	try {
		unlistenTerminalInput = ctx.ui.onTerminalInput((data) => {
			// Only steal these characters while a session is on screen, so normal
			// typing of ˚ / ˜ / ´ still works the rest of the time.
			if (!sessionLive()) return undefined;
			const action = OPTION_CHAR_ACTIONS[data];
			if (!action) return undefined;
			runAction(ctx, action);
			return { consume: true };
		});
	} catch {
		unlistenTerminalInput = null;
	}
}

function toggleSession(ctx: ExtensionContext): void {
	if (!engine.running) {
		if (ctx.mode !== "tui") {
			ctx.ui.notify(str().notifyNotTui, "warning");
			return;
		}
		beginSession(ctx, "manual");
		return;
	}
	clearLinger();
	autoPausedForIdle = false;
	engine.togglePause();
	ensureWidget(ctx);
	startTicker();
	refreshStatus(ctx);
	requestRender();
}

function skipPhase(ctx: ExtensionContext): void {
	if (!engine.running) {
		ctx.ui.notify(str().notifyNoSession, "warning");
		return;
	}
	handlePhaseChanges(engine.skip());
	requestRender();
}

// ── /kegel menu ─────────────────────────────────────────────────────────────

async function pickDifficulty(ctx: ExtensionContext): Promise<void> {
	const texts = str();
	const labels = PRESETS.map((preset) => presetLabelIn(lang(), preset.id));
	labels.push(texts.customOption);
	const choice = await ctx.ui.select(texts.difficultyTitle, labels);
	if (!choice) return;

	const index = labels.indexOf(choice);
	if (index === PRESETS.length) {
		await pickCustom(ctx);
		return;
	}
	const preset = PRESETS[index];
	if (!preset) return;
	const workout = configFromPreset(preset.id);
	if (!workout) return;
	applyWorkout(ctx, t(lang()).presetNames[preset.id] ?? preset.id, workout);
}

async function askNumber(
	ctx: ExtensionContext,
	title: string,
	placeholder: string,
	min: number,
	max: number,
	allowZero = false,
): Promise<number | undefined> {
	const raw = await ctx.ui.input(title, placeholder);
	if (raw === undefined || raw.trim() === "") return undefined;
	const value = Number(raw.trim());
	if (!Number.isFinite(value)) {
		ctx.ui.notify(str().notifyNumberRequired, "warning");
		return undefined;
	}
	const floor = allowZero ? 0 : min;
	return Math.min(max, Math.max(floor, Math.round(value)));
}

async function pickVolume(ctx: ExtensionContext, current: number): Promise<void> {
	const percent = await askNumber(ctx, str().volumeTitle, String(Math.round(current * 100)), 0, 100, true);
	if (percent === undefined) return;
	engine.applyConfig({ volume: percent / 100 });
	previewCue();
}

async function pickCustom(ctx: ExtensionContext): Promise<void> {
	const texts = str();
	const contractSec = await askNumber(ctx, texts.customContractTitle, "10", 1, 120);
	if (contractSec === undefined) return;
	const relaxSec = await askNumber(ctx, texts.customRelaxTitle, "10", 1, 120);
	if (relaxSec === undefined) return;
	const reps = await askNumber(ctx, texts.customRepsTitle, "8", 1, 200, true);
	if (reps === undefined) return;
	const sets = await askNumber(ctx, texts.customSetsTitle, "3", 1, 50, true);
	if (sets === undefined) return;
	const setRestSec = await askNumber(ctx, texts.customSetRestTitle, "30", 0, 300, true);
	if (setRestSec === undefined) return;
	applyWorkout(ctx, str().custom, { contractSec, relaxSec, reps, sets, setRestSec });
}

function applyWorkout(ctx: ExtensionContext, name: string, workout: Partial<KegelConfig>): void {
	const wasRunning = engine.running;
	engine.applyConfig(workout);
	saveConfig(engine.config);
	lastStatus = "";
	refreshStatus(ctx);
	requestRender();
	const duration = estimateDuration(engine.config);
	const texts = str();
	const tail = duration ? texts.estimateMinutes(Math.round(duration / 60000)) : texts.estimateEndless;
	ctx.ui.notify(texts.notifyLevelSet(name, formatPlan(engine.config), tail), "info");
	if (wasRunning) {
		const applyTexts = str();
		void ctx.ui
			.select(applyTexts.applyWhenTitle, [applyTexts.applyNext, applyTexts.applyNow])
			.then((choice) => {
				if (choice === applyTexts.applyNow) beginSession(ctx, "manual");
			});
	}
}

async function openSettings(ctx: ExtensionContext): Promise<void> {
	while (true) {
		const config = engine.config;
		const texts = str();
		const cueLabel =
			config.cue === "system"
				? texts.systemSound(Math.round(config.volume * 100))
				: config.cue === "voice"
					? texts.spoken(voice())
					: texts.off;
		const choice = await ctx.ui.select(texts.settingsTitle, [
			`${texts.settingsCue}${cueLabel}`,
			`${texts.settingsTick}${config.tickLastSec > 0 ? texts.settingsTickValue(config.tickLastSec) : texts.off}`,
			`${texts.settingsVisual}${config.visual === "bloom" ? texts.visualBloom : texts.visualBar}`,
			`${texts.settingsBloomOn}${config.bloomOn === "relax" ? texts.bloomOnRelax : texts.bloomOnContract}`,
			`${texts.settingsLang}${LANG_LABEL[lang()]}`,
			`${texts.settingsLog}${texts.onOff(config.log)}`,
			`${texts.settingsAskRating}${texts.onOff(config.askRating)}`,
			`${texts.settingsAutoStart}${texts.onOff(config.autoStart)}`,
			`${texts.settingsAutoStop}${texts.onOff(config.autoStop)}`,
			`${texts.settingsPauseWhenIdle}${texts.onOff(config.pauseWhenIdle)}`,
			`${texts.settingsPrepare}${config.prepareSec}s`,
			texts.settingsBack,
		]);
		if (!choice || choice === texts.settingsBack) return;
		if (choice.startsWith(texts.settingsCue)) {
			// system -> voice -> off -> system
			const next = config.cue === "system" ? "voice" : config.cue === "voice" ? "off" : "system";
			engine.applyConfig({ cue: next });
			if (next !== "off") previewCue();
			if (next === "system") await pickVolume(ctx, config.volume);
		} else if (choice.startsWith(texts.settingsTick)) {
			const seconds = await askNumber(ctx, texts.tickTitle, String(config.tickLastSec), 0, 10, true);
			if (seconds === undefined) continue;
			engine.applyConfig({ tickLastSec: seconds });
			if (engine.config.tickLastSec > 0) cue("tick", engine.config.tickLastSec);
		} else if (choice.startsWith(texts.settingsVisual)) {
			engine.applyConfig({ visual: config.visual === "bloom" ? "bar" : "bloom" });
			invalidateWidget();
		} else if (choice.startsWith(texts.settingsBloomOn)) {
			engine.applyConfig({ bloomOn: config.bloomOn === "relax" ? "contract" : "relax" });
			invalidateWidget();
		} else if (choice.startsWith(texts.settingsLang)) {
			const next = nextLang(lang());
			engine.applyConfig({ lang: next });
			invalidateWidget();
			ctx.ui.notify(t(next).notifyLangChanged(LANG_LABEL[next]), "info");
		} else if (choice.startsWith(texts.settingsLog)) {
			engine.applyConfig({ log: !config.log });
			if (!engine.config.log) ctx.ui.notify(texts.notifyLogOff, "info");
		} else if (choice.startsWith(texts.settingsAskRating)) {
			engine.applyConfig({ askRating: !config.askRating });
		} else if (choice.startsWith(texts.settingsAutoStart)) {
			engine.applyConfig({ autoStart: !config.autoStart });
		} else if (choice.startsWith(texts.settingsAutoStop)) {
			engine.applyConfig({ autoStop: !config.autoStop });
		} else if (choice.startsWith(texts.settingsPauseWhenIdle)) {
			engine.applyConfig({ pauseWhenIdle: !config.pauseWhenIdle });
		} else if (choice.startsWith(texts.settingsPrepare)) {
			const seconds = await askNumber(ctx, texts.prepareTitle, "3", 0, 30, true);
			if (seconds === undefined) continue;
			engine.applyConfig({ prepareSec: seconds });
		}
		saveConfig(engine.config);
	}
}

/** `/kegel lang [zh|en|auto]` - switch, or cycle when no argument is given. */
function switchLang(ctx: ExtensionContext, arg: string): void {
	const wanted = arg.trim().toLowerCase();
	const next: Lang | "auto" = wanted === "zh" || wanted === "en" || wanted === "auto" ? wanted : nextLang(lang());
	engine.applyConfig({ lang: next });
	saveConfig(engine.config);
	invalidateWidget();
	ctx.ui.notify(t(resolveLang(next)).notifyLangChanged(LANG_LABEL[next]), "info");
}

async function showStatus(ctx: ExtensionContext): Promise<void> {
	const texts = str();
	const presetId = presetIdFor(engine.config);
	const state = engine.running
		? engine.paused
			? texts.statePaused
			: texts.stateRunning
		: engine.finished
			? texts.stateFinished
			: texts.stateIdle;
	const lines = [
		texts.statusDifficulty(presetId ? (texts.presetNames[presetId] ?? texts.custom) : texts.custom),
		texts.statusPlan(formatPlan(engine.config)),
		texts.statusState(state),
		texts.statusProgress(engine.completedReps, formatClock(engine.totalContractMs)),
	];
	if (engine.config.log) {
		const history = loadHistory();
		const agg = totals(history, Date.now());
		const today = history.filter((entry) => dayKey(entry.at) === dayKey(Date.now()));
		const reps = today.reduce((sum, entry) => sum + entry.reps, 0);
		const contractMs = today.reduce((sum, entry) => sum + entry.contractMs, 0);
		lines.push(
			texts.statusLog(
				agg.sessions,
				agg.streak,
				agg.rating === undefined ? texts.historyUnrated : `${stars(agg.rating)} ${agg.rating.toFixed(1)}`,
			),
			texts.statusToday(today.length, reps, formatClock(contractMs)),
		);
	}
	if (engine.config.sets > 0) lines.push(texts.statusCurrentSet(engine.set, engine.config.sets));
	lines.push(
		texts.statusVisual(engine.config.visual === "bloom" ? texts.visualBloom : texts.visualBar),
		texts.statusCue(
			engine.config.cue === "system"
				? texts.systemSound(Math.round(engine.config.volume * 100))
				: engine.config.cue === "voice"
					? texts.spoken(voice())
					: texts.off,
		),
		texts.statusTick(engine.config.tickLastSec > 0 ? texts.settingsTickValue(engine.config.tickLastSec) : texts.off),
		engine.config.visual === "bloom"
			? texts.statusFlowerSize(Math.min(11, Math.max(3, Math.round(((tuiRef?.terminal?.rows ?? 40) - 14) / 3))))
			: "",
		isKittyProtocolActive() ? texts.statusKeysKitty : texts.statusKeysOption,
	);
	await ctx.ui.select(texts.statusTitle, lines);
}

async function openMenu(ctx: ExtensionContext): Promise<void> {
	while (true) {
		const texts = str();
		// Dispatch by key, not by matching localized text - an English label could
		// otherwise collide with another entry's substring.
		const items: Array<{ label: string; key: string }> = [
			{
				label: engine.running ? (engine.paused ? texts.menuResume : texts.menuPause) : texts.menuStart,
				key: "toggle",
			},
			{ label: texts.menuSkip, key: "skip" },
			{ label: texts.menuEnd, key: "end" },
			{ label: texts.menuDifficulty, key: "difficulty" },
			{ label: texts.menuHistory, key: "history" },
			{ label: texts.menuSettings, key: "settings" },
			{ label: texts.menuStatus, key: "status" },
			{ label: texts.menuClose, key: "close" },
		];
		const choice = await ctx.ui.select(texts.appTitle, items.map((item) => item.label));
		const key = items.find((item) => item.label === choice)?.key;
		if (!key || key === "close") return;
		if (key === "toggle") {
			toggleSession(ctx);
		} else if (key === "skip") {
			skipPhase(ctx);
		} else if (key === "end") {
			endSession(ctx, texts.notifyReasonManual);
			return;
		} else if (key === "difficulty") {
			await pickDifficulty(ctx);
		} else if (key === "history") {
			await openHistory(ctx);
		} else if (key === "settings") {
			await openSettings(ctx);
		} else if (key === "status") {
			await showStatus(ctx);
		}
	}
}


// ── extension entry point ───────────────────────────────────────────────────

export default function kegelExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		activeCtx = ctx;
		agentBusy = false;
		stopTicker();
		clearLinger();
		const saved = loadConfig();
		engine = new KegelEngine(saved);
		widgetVisible = false;
		lastStatus = "";
		autoStartedByAgent = false;
		autoPausedForIdle = false;
		autoStartSuppressed = false;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		registerOptionCharFallback(ctx);
	});

	pi.on("session_shutdown", async () => {
		stopTicker();
		clearLinger();
		unlistenTerminalInput?.();
		unlistenTerminalInput = null;
		tuiRef = null;
		widgetVisible = false;
		activeCtx = null;
	});

	pi.on("agent_start", async (_event, ctx) => {
		activeCtx = ctx;
		agentBusy = true;
		// A fresh agent run is a fresh intent.
		autoStartSuppressed = false;
		if (engine.running) {
			// Resume a session we froze because the agent went idle.
			if (autoPausedForIdle) {
				autoPausedForIdle = false;
				engine.resume();
				startTicker();
				refreshStatus(ctx);
				requestRender();
			}
			return;
		}
		if (!engine.config.autoStart || ctx.mode !== "tui") return;
		beginSession(ctx, "auto");
	});

	// A prompt queued while the agent was busy continues the *same* agent run, so
	// neither agent_start nor before_agent_start fires for it. `input` is the only
	// reliable "the user just asked for something" signal - use it to re-arm.
	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive") return;
		if (event.text.trimStart().startsWith("/")) return;
		autoStartSuppressed = false;
		if (engine.running || !engine.config.autoStart || ctx.mode !== "tui") return;
		beginSession(ctx, "auto");
	});

	// Safety net: if the flower somehow went away while the agent is still working
	// (linger expired, widget torn down on reload), bring it back on the next turn.
	pi.on("turn_start", async (_event, ctx) => {
		if (engine.running || autoStartSuppressed) return;
		if (!engine.config.autoStart || ctx.mode !== "tui") return;
		beginSession(ctx, "auto");
	});

	pi.on("agent_settled", async (_event, ctx) => {
		agentBusy = false;
		// The run is over; the next prompt may auto-start again.
		autoStartSuppressed = false;
		if (engine.config.autoStop && engine.running) {
			endSession(ctx, str().notifyReasonAgentSettled);
			return;
		}
		// Don't burn through the plan while nothing is on screen: freeze instead.
		if (engine.config.pauseWhenIdle && autoStartedByAgent && engine.running && !engine.paused) {
			autoPausedForIdle = true;
			engine.pause();
			refreshStatus(ctx);
		}
		requestRender();
	});

	pi.registerCommand("kegel", {
		// Registered once at load time, so it can't follow a runtime language switch
		// - show both languages instead of going stale.
		description: "Kegel trainer / 凯格尔训练：难度 · 开始 · 暂停 · 结束（alt+k / ctrl+shift+k）",
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase();
			if (command === "start" || command === "begin") return toggleSession(ctx);
			if (command === "stop" || command === "end") return endSession(ctx, str().notifyReasonManual);
			if (command === "next" || command === "skip") return skipPhase(ctx);
			if (command === "pause" || command === "resume") return toggleSession(ctx);
			if (command === "status") return showStatus(ctx);
			if (command === "lang" || command.startsWith("lang ")) {
				return switchLang(ctx, command.slice(4).trim());
			}
			if (command) {
				const workout = configFromPreset(command);
				if (workout) {
					return applyWorkout(ctx, str().presetNames[command] ?? command, workout);
				}
				ctx.ui.notify(
					str().notifyUnknownArg(command, `start / stop / next / status / lang / ${PRESETS.map((p) => p.id).join(" / ")}`),
					"warning",
				);
				return;
			}
			return openMenu(ctx);
		},
	});

	// alt+* works when the terminal reports Option as meta, or through the composed-character
	// fallback registered in session_start. ctrl+shift+* is the path that needs no config.
	pi.registerShortcut("alt+k", {
		description: "Kegel: start/pause · 凯格尔：开始/暂停",
		handler: (ctx) => toggleSession(ctx),
	});

	pi.registerShortcut("alt+n", {
		description: "Kegel: skip phase · 凯格尔：跳过当前阶段",
		handler: (ctx) => skipPhase(ctx),
	});

	pi.registerShortcut("alt+e", {
		description: "Kegel: end session · 凯格尔：结束训练",
		handler: (ctx) => endSession(ctx, str().notifyReasonManual),
	});

	pi.registerShortcut("ctrl+shift+k", {
		description: "Kegel: start/pause (fallback key) · 凯格尔：开始/暂停（备用键）",
		handler: (ctx) => toggleSession(ctx),
	});

	pi.registerShortcut("ctrl+shift+n", {
		description: "Kegel: skip phase (fallback key) · 凯格尔：跳过当前阶段（备用键）",
		handler: (ctx) => skipPhase(ctx),
	});

	pi.registerShortcut("ctrl+shift+e", {
		description: "Kegel: end session (fallback key) · 凯格尔：结束训练（备用键）",
		handler: (ctx) => endSession(ctx, str().notifyReasonManual),
	});
}
