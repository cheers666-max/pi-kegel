/**
 * Kegel trainer widget - rendered above the editor while a session is active.
 * The component owns no timer: the extension drives repaints via `tui.requestRender()`.
 *
 * Two visuals:
 *  - "bloom": a Braille flower that opens while you squeeze and closes while you
 *    rest (Apple-Mindfulness style). Needs some terminal height; falls back to the
 *    bar automatically on short or narrow terminals.
 *  - "bar": the original compact progress-bar layout.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { bloomForPhase, renderBloom } from "./bloom.ts";
import {
	type KegelEngine,
	type Lang,
	formatClock,
	formatPlan,
	phaseLabel,
	phaseHint,
	presetIdFor,
} from "./core.ts";
import { DEFAULT_LANG, formatPlanIn, resolveLang, t } from "./i18n.ts";

export const WIDGET_KEY = "kegel-trainer";

export type VisualMode = "bloom" | "bar";

const BAR_MIN_WIDTH = 6;
/** Below this width the right-aligned rep/set counter is dropped. */
const SHOW_PROGRESS_MIN = 52;
/** Below this inner width the flower is not worth drawing - use the bar. */
const BLOOM_MIN_WIDTH = 36;
/** At or above this inner width the flower sits left of the text block. */
const BLOOM_SIDE_BY_SIDE = 62;
/** Ring rank -> theme color. Lower rank = more prominent. */
const RANK_COLORS = ["accent", "accent", "muted", "dim"] as const;

type PhaseColor = "warning" | "success" | "accent" | "muted";

/** Pad or truncate a styled line to exactly `width` visible columns. */
function fit(text: string, width: number): string {
	if (width <= 0) return "";
	return truncateToWidth(text, width, "", true);
}

/** Left text, right text, padded to exactly `width`. Right side wins the space. */
function row(left: string, right: string, width: number): string {
	const rightWidth = visibleWidth(right);
	const maxLeft = Math.max(0, width - rightWidth - 1);
	const leftFitted = truncateToWidth(left, maxLeft, "…", false);
	const gap = Math.max(1, width - visibleWidth(leftFitted) - rightWidth);
	return fit(leftFitted + " ".repeat(gap) + right, width);
}

/** Center a block of lines inside `width`, preserving exact line widths. */
function center(text: string, width: number): string {
	const pad = Math.max(0, Math.floor((width - visibleWidth(text)) / 2));
	return fit(" ".repeat(pad) + text, width);
}

function planLabel(engine: KegelEngine, lang: Lang): string {
	const presetId = presetIdFor(engine.config);
	// A preset gets its short name; a custom plan gets the full plan string.
	if (presetId && t(lang).presetNames[presetId]) return t(lang).presetNames[presetId];
	return formatPlanIn(lang, engine.config);
}

export class KegelWidget {
	private engine: KegelEngine;
	private getTheme: () => Theme;
	private isAgentBusy: () => boolean;
	private getRows: () => number;
	private getVisualMode: () => VisualMode;
	private getLang: () => Lang;
	private cachedLines: string[] = [];
	private cachedWidth = 0;
	private cacheKey = "";

	constructor(
		engine: KegelEngine,
		getTheme: () => Theme,
		isAgentBusy: () => boolean,
		getRows: () => number = () => 40,
		getVisualMode: () => VisualMode = () => "bloom",
		getLang: () => Lang = () => DEFAULT_LANG,
	) {
		this.engine = engine;
		this.getTheme = getTheme;
		this.isAgentBusy = isAgentBusy;
		this.getRows = getRows;
		this.getVisualMode = getVisualMode;
		this.getLang = getLang;
	}

	invalidate(): void {
		this.cachedWidth = 0;
		this.cacheKey = "";
	}

	/** Elapsed time inside the current phase (freezes while paused). */
	private get phaseElapsedMs(): number {
		return Math.max(0, this.engine.phaseTotalMs - this.engine.remainingMs);
	}

	render(width: number): string[] {
		const theme = this.getTheme();
		const engine = this.engine;
		const rows = this.getRows();
		let visual = this.getVisualMode();
		// A flower needs room; degrade gracefully instead of drawing a squashed blob.
		if (visual === "bloom" && (width < BLOOM_MIN_WIDTH || rows < 26)) visual = "bar";

		const cacheKey = [
			width,
			visual,
			rows,
			engine.phase,
			engine.paused ? "paused" : "run",
			engine.secondsLeft,
			engine.rep,
			engine.set,
			engine.completedReps,
			// Sub-second bucket so the bloom animates smoothly between ticks.
			visual === "bloom" ? Math.floor(this.phaseElapsedMs / 90) : 0,
			this.isAgentBusy() ? "busy" : "idle",
			this.getLang(),
			theme.name ?? "",
		].join("|");
		if (width === this.cachedWidth && cacheKey === this.cacheKey) return this.cachedLines;

		const inner = Math.max(12, width - 1);
		const lines = visual === "bloom" ? this.renderBloomLayout(theme, width, inner, rows) : this.renderBarLayout(theme, width, inner);

		this.cachedLines = lines;
		this.cachedWidth = width;
		this.cacheKey = cacheKey;
		return lines;
	}

	// ── bloom layout ────────────────────────────────────────────────────────

	private bloomRowCount(rows: number): number {
		// widget height = bloomRows + 4 (two rules, header, footer). Target roughly a
		// third of the terminal so transcript and editor keep their room.
		return Math.round(Math.min(11, Math.max(3, (rows - 14) / 3)));
	}

	private renderBloomLayout(theme: Theme, width: number, inner: number, rows: number): string[] {
		const engine = this.engine;
		const lines: string[] = [];
		const push = (text: string) => lines.push(fit(` ${text}`, width));

		push(theme.fg("dim", "─".repeat(inner)));

		const title =
			`${theme.fg("accent", "🧘")} ${theme.bold(theme.fg("text", t(this.getLang()).appTitleText))}` +
			theme.fg("muted", ` · ${planLabel(engine, this.getLang())}`);
		const clockRight = `${theme.fg("muted", "⏱ ")}${theme.fg("accent", formatClock(engine.elapsedMs))}`;
		push(row(title, clockRight, inner));

		const bloomRows = this.bloomRowCount(rows);
		const sideBySide = inner >= BLOOM_SIDE_BY_SIDE;
		const flowerRows = sideBySide ? bloomRows : Math.max(3, bloomRows - 2);
		const bloomCols = sideBySide ? bloomRows * 2 : Math.min(inner - 4, flowerRows * 2);
		const flower = this.renderFlower(theme, bloomCols, flowerRows);
		// Leave 4 columns for the flower indent + gutter on the right panel.
		const info = this.infoParts(theme, sideBySide ? Math.max(16, inner - bloomCols - 4) : inner - 2);

		if (sideBySide) {
			// Flower left, info panel right: text group vertically centred, with the
			// countdown and bar anchored to the bottom two rows.
			const block: string[] = new Array(Math.max(4, bloomRows)).fill("");
			const top = Math.max(0, Math.floor((block.length - 5) / 2));
			block[top] = info.text;
			block[top + 1] = info.hint;
		block[top + 2] = info.counter;
			block[block.length - 2] = info.countdown;
			block[block.length - 1] = info.bar;
			for (let i = 0; i < block.length; i += 1) {
				const right = fit(block[i] ?? "", Math.max(16, inner - bloomCols - 4));
				push(row("  " + (flower[i] ?? ""), right, inner));
			}
		} else {
			// Narrow: flower on top, three compact info lines underneath.
			for (const line of flower) push(center(line, inner));
			push(row(info.text, info.countdown, inner));
			push(row(info.hint, info.counter, inner));
			push(fit(info.bar, inner));
		}

		this.pushFooter(theme, inner, push);
		push(theme.fg("dim", "─".repeat(inner)));
		return lines;
	}

	private renderFlower(theme: Theme, cols: number, rows: number): string[] {
		const engine = this.engine;
		const { color } = this.phaseHeadline(theme);
		const bloom = engine.finished
			? 1
			: bloomForPhase(engine.phase, this.phaseElapsedMs, engine.phaseTotalMs / 1000, engine.config.bloomOn);
		return renderBloom({
			width: cols,
			height: Math.max(1, rows),
			bloom: engine.paused ? Math.max(0.12, bloom) : bloom,
			colorize: (rank, glyph) => {
				const name = engine.paused ? "muted" : (RANK_COLORS[rank] ?? "dim");
				const tinted = theme.fg(name === "accent" ? color : name, glyph);
				return rank === 0 ? theme.bold(tinted) : tinted;
			},
		});
	}

	/** Text fragments for the info panel; each layout arranges them itself. */
	private infoParts(theme: Theme, width: number): {
		color: PhaseColor;
		text: string;
		hint: string;
		counter: string;
		countdown: string;
		bar: string;
	} {
		const engine = this.engine;
		// Bloom mode renders the hint on its own line, so keep the headline short.
		const { color, text } = this.phaseHeadline(theme, false);
		let countdown = "";
		if (engine.running && !engine.paused) {
			countdown = `${theme.bold(theme.fg(color, String(engine.secondsLeft)))}${theme.fg(color, "s")}`;
		} else if (engine.paused) {
			countdown = `${theme.fg("muted", `${String(engine.secondsLeft)}s`)}`;
		}
		return {
			color,
			text,
			hint: theme.fg("dim", phaseHint(this.getLang(), engine.phase) ?? "…"),
			counter: engine.finished
				? theme.fg("success", t(this.getLang()).widgetDone(engine.completedReps, formatClock(engine.totalContractMs)))
				: this.counter(theme),
			countdown,
			bar: this.bar(theme, Math.min(width, 40), color),
		};
	}

	private bar(theme: Theme, width: number, color: PhaseColor): string {
		const engine = this.engine;
		const barWidth = Math.max(BAR_MIN_WIDTH, width);
		const filled = Math.round(barWidth * engine.phaseProgress);
		const fillColor = engine.paused ? "muted" : color;
		return (
			theme.fg(fillColor, (engine.paused ? "▒" : "█").repeat(filled)) +
			theme.fg("dim", "░".repeat(Math.max(0, barWidth - filled)))
		);
	}

	// ── bar layout (compact fallback) ───────────────────────────────────────

	private renderBarLayout(theme: Theme, width: number, inner: number): string[] {
		const engine = this.engine;
		const lines: string[] = [];
		const push = (text: string) => lines.push(fit(` ${text}`, width));

		push(theme.fg("dim", "─".repeat(inner)));

		const title =
			`${theme.fg("accent", "🧘")} ${theme.bold(theme.fg("text", t(this.getLang()).appTitleText))}` +
			theme.fg("muted", ` · ${planLabel(engine, this.getLang())}`);
		const clockRight = `${theme.fg("muted", "⏱ ")}${theme.fg("accent", formatClock(engine.elapsedMs))}`;
		push(row(title, clockRight, inner));

		const { color, text } = this.phaseHeadline(theme);
		const counter = inner >= SHOW_PROGRESS_MIN ? this.counter(theme) : "";
		push(row(text, counter, inner));

		const countdown = engine.running && !engine.paused ? `${engine.secondsLeft}s` : "";
		const countdownStyled = countdown
			? theme.bold(theme.fg(engine.paused ? "muted" : color, ` ${countdown}`))
			: "";
		const barWidth = Math.max(BAR_MIN_WIDTH, inner - visibleWidth(countdownStyled) - 2);
		push(row(this.bar(theme, barWidth, color), countdownStyled, inner));

		this.pushFooter(theme, inner, push);
		push(theme.fg("dim", "─".repeat(inner)));
		return lines;
	}

	// ── shared pieces ───────────────────────────────────────────────────────

	private pushFooter(theme: Theme, inner: number, push: (text: string) => void): void {
		const status = this.statusLine(theme);
		const keys = this.keysHint(theme, inner);
		if (!status) {
			push(keys);
		} else if (visibleWidth(status) + 3 + visibleWidth(keys) <= inner) {
			push(row(status, keys, inner));
		} else {
			push(fit(status, inner));
		}
	}

	private phaseHeadline(theme: Theme, withHint = true): { color: PhaseColor; text: string } {
		const engine = this.engine;
		const hint = (text: string) => (withHint ? theme.fg("dim", ` · ${text}`) : "");
		const s = t(this.getLang());
		if (engine.finished) {
			return { color: "success", text: theme.bold(theme.fg("success", s.headline.done)) };
		}
		if (engine.paused) {
			return {
				color: "muted",
				text: `${theme.bold(theme.fg("warning", s.headline.paused))}${hint(phaseLabel(this.getLang(), engine.phase))}`,
			};
		}
		switch (engine.phase) {
			case "contract":
				return {
					color: "warning",
					text: `${theme.bold(theme.fg("warning", s.headline.contract))}${hint(s.shortHint.contract)}`,
				};
			case "relax":
				return {
					color: "success",
					text: `${theme.bold(theme.fg("success", s.headline.relax))}${hint(s.shortHint.relax)}`,
				};
			case "setRest":
				return {
					color: "accent",
					text: `${theme.bold(theme.fg("accent", s.headline.setRest))}${hint(s.shortHint.setRest)}`,
				};
			case "prepare":
				return {
					color: "accent",
					text: `${theme.bold(theme.fg("accent", s.headline.prepare))}${hint(s.shortHint.prepare)}`,
				};
			default:
				return { color: "muted", text: theme.fg("muted", phaseLabel(this.getLang(), engine.phase)) };
		}
	}

	private counter(theme: Theme): string {
		const engine = this.engine;
		const reps = engine.config.reps === 0 ? "∞" : String(engine.config.reps);
		const sets = engine.config.sets === 0 ? "∞" : String(engine.config.sets);
		const s = t(this.getLang());
		if (engine.phase === "contract" || engine.phase === "relax" || engine.phase === "prepare") {
			return theme.fg("muted", s.widgetRepSet(engine.rep, reps, engine.set, sets));
		}
		// prepare/setRest/done only show the set counter
		return theme.fg("muted", s.setCounter(engine.set, sets));
	}

	private statusLine(theme: Theme): string {
		const engine = this.engine;
		const s = t(this.getLang());
		if (engine.finished) {
			return theme.fg("success", s.widgetDone(engine.completedReps, formatClock(engine.totalContractMs)));
		}
		if (engine.paused) {
			return theme.fg("warning", s.pausedLine("alt+k"));
		}
		return "";
	}

	/** Key hints, shortened to fit narrow terminals. */
	private keysHint(theme: Theme, width: number): string {
		const engine = this.engine;
		const key = (text: string) => theme.fg("accent", text);
		const label = (text: string) => theme.fg("dim", text);
		const s = t(this.getLang());
		const toggle = !engine.running ? s.keyStart : engine.paused ? s.keyResume : s.keyPause;
		const sep = label(" · ");

		const full = [
			`${key("alt+k")}${label(toggle)}`,
			`${key("alt+n")}${label(s.keySkip)}`,
			`${key("alt+e")}${label(s.keyEnd)}`,
			`${key("/kegel")}${label(s.keySettings)}`,
		];
		const medium = full.slice(0, 3);
		const short = [`${key("alt+k")}${label(toggle)}`, `${key("alt+n")}`, `${key("alt+e")}`];

		for (const candidate of [full, medium, short]) {
			const text = candidate.join(sep);
			if (visibleWidth(text) <= width) return text;
		}
		return `${key("alt+k")}${label(toggle)}`;
	}
}

export function formatSummary(engine: KegelEngine, lang?: Lang): string {
	const s = t(lang ?? resolveLang(engine.config.lang));
	return s.summary(formatPlan(engine.config), engine.completedReps, formatClock(engine.totalContractMs));
}
