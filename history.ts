/**
 * Training log - pure data layer, no TUI or filesystem dependency.
 *
 * Every finished session is one JSONL line in `~/.pi/agent/kegel-history.jsonl`,
 * which makes it append-only, greppable, and impossible to corrupt with a bad
 * write. Aggregation (daily volume + how it felt) happens here.
 */

export interface HistoryEntry {
	/** Epoch ms when the session ended. */
	at: number;
	/** Reps completed (a rep = one contract + one relax). */
	reps: number;
	sets: number;
	contractSec: number;
	relaxSec: number;
	/** Total ms spent actually contracting. */
	contractMs: number;
	/** Wall-clock ms the session ran, including rest phases. */
	durationMs: number;
	/** How it ended. */
	end: "done" | "stopped";
	/** Subjective 1-5 rating. `undefined` = not rated (skipped). */
	rating?: number;
	/** Free-form note. */
	note?: string;
}

export interface DayStat {
	/** Local date, `YYYY-MM-DD`. */
	date: string;
	sessions: number;
	reps: number;
	contractMs: number;
	/** Mean of the day's ratings, or undefined when nothing was rated. */
	rating?: number;
	ratedCount: number;
}

export interface HistoryTotals {
	sessions: number;
	reps: number;
	contractMs: number;
	/** Days with at least one session. */
	activeDays: number;
	/** Mean rating across all rated sessions. */
	rating?: number;
	ratedCount: number;
	/** Consecutive days ending today (or yesterday, if today is still empty). */
	streak: number;
}

/** Keep the log bounded - ~5k sessions is decades at any realistic rate. */
export const HISTORY_CAP = 5000;

export function clampRating(value: unknown): number | undefined {
	const num = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(num) || num <= 0) return undefined;
	return Math.min(5, Math.max(1, Math.round(num)));
}

/** Local-time `YYYY-MM-DD` - deliberately not `toISOString()` (that is UTC). */
export function dayKey(epochMs: number): string {
	const d = new Date(epochMs);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normalize(raw: unknown): HistoryEntry | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const at = Number(o.at);
	if (!Number.isFinite(at)) return null;
	const num = (v: unknown, dflt = 0) => {
		const n = Number(v);
		return Number.isFinite(n) && n >= 0 ? n : dflt;
	};
	const entry: HistoryEntry = {
		at,
		reps: Math.round(num(o.reps)),
		sets: Math.round(num(o.sets, 1)),
		contractSec: Math.round(num(o.contractSec, 10)),
		relaxSec: Math.round(num(o.relaxSec, 10)),
		contractMs: num(o.contractMs),
		durationMs: num(o.durationMs),
		end: o.end === "stopped" ? "stopped" : "done",
	};
	const rating = clampRating(o.rating);
	if (rating !== undefined) entry.rating = rating;
	if (typeof o.note === "string" && o.note.trim()) entry.note = o.note.trim().slice(0, 200);
	return entry;
}

/** Parse a JSONL log, tolerating blank lines and garbage. Sorted oldest first. */
export function parseHistory(text: string): HistoryEntry[] {
	const out: HistoryEntry[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const entry = normalize(JSON.parse(trimmed));
			if (entry) out.push(entry);
		} catch {
			// a torn last line (e.g. killed mid-write) must not nuke the log
		}
	}
	return out.sort((a, b) => a.at - b.at);
}

export function serializeEntry(entry: HistoryEntry): string {
	return `${JSON.stringify(entry)}\n`;
}

export function serializeHistory(entries: HistoryEntry[]): string {
	return entries.map(serializeEntry).join("");
}

/** Append, keeping only the newest `cap` entries. */
export function appendEntry(history: HistoryEntry[], entry: HistoryEntry, cap = HISTORY_CAP): HistoryEntry[] {
	const next = [...history, entry];
	return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Set/replace the rating (and optionally note) of the entry at `at`. */
export function rateSession(
	history: HistoryEntry[],
	at: number,
	rating: number | undefined,
	note?: string,
): HistoryEntry[] {
	return history.map((entry) => {
		if (entry.at !== at) return entry;
		const updated: HistoryEntry = { ...entry };
		const clamped = clampRating(rating);
		if (clamped === undefined) delete updated.rating;
		else updated.rating = clamped;
		if (note !== undefined) {
			if (note.trim()) updated.note = note.trim().slice(0, 200);
			else delete updated.note;
		}
		return updated;
	});
}

/**
 * The last `days` local days, oldest first, zero-filled. Days with no session
 * are included so a chart shows the gaps instead of silently skipping them.
 */
export function dayStats(history: HistoryEntry[], now: number, days: number): DayStat[] {
	const count = Math.max(1, Math.round(days));
	const buckets = new Map<string, { sessions: number; reps: number; contractMs: number; ratings: number[] }>();
	for (const entry of history) {
		const key = dayKey(entry.at);
		const bucket = buckets.get(key) ?? { sessions: 0, reps: 0, contractMs: 0, ratings: [] };
		bucket.sessions += 1;
		bucket.reps += entry.reps;
		bucket.contractMs += entry.contractMs;
		if (entry.rating !== undefined) bucket.ratings.push(entry.rating);
		buckets.set(key, bucket);
	}

	const out: DayStat[] = [];
	const DAY = 86_400_000;
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	for (let i = count - 1; i >= 0; i--) {
		const date = dayKey(today.getTime() - i * DAY);
		const bucket = buckets.get(date);
		if (!bucket) {
			out.push({ date, sessions: 0, reps: 0, contractMs: 0, ratedCount: 0 });
			continue;
		}
		const mean = bucket.ratings.length
			? bucket.ratings.reduce((a, b) => a + b, 0) / bucket.ratings.length
			: undefined;
		out.push({
			date,
			sessions: bucket.sessions,
			reps: bucket.reps,
			contractMs: bucket.contractMs,
			ratedCount: bucket.ratings.length,
			...(mean === undefined ? {} : { rating: mean }),
		});
	}
	return out;
}

/** Consecutive days with training, counted back from today. */
export function streakOf(history: HistoryEntry[], now: number): number {
	const keys = new Set(history.map((entry) => dayKey(entry.at)));
	const DAY = 86_400_000;
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	// Today still empty? A streak is only broken once the day is actually over.
	let cursor = today.getTime();
	if (!keys.has(dayKey(cursor))) cursor -= DAY;
	let streak = 0;
	while (keys.has(dayKey(cursor))) {
		streak += 1;
		cursor -= DAY;
	}
	return streak;
}

export function totals(history: HistoryEntry[], now: number): HistoryTotals {
	let reps = 0;
	let contractMs = 0;
	let ratingSum = 0;
	let ratedCount = 0;
	const days = new Set<string>();
	for (const entry of history) {
		reps += entry.reps;
		contractMs += entry.contractMs;
		days.add(dayKey(entry.at));
		if (entry.rating !== undefined) {
			ratingSum += entry.rating;
			ratedCount += 1;
		}
	}
	return {
		sessions: history.length,
		reps,
		contractMs,
		activeDays: days.size,
		ratedCount,
		streak: streakOf(history, now),
		...(ratedCount === 0 ? {} : { rating: ratingSum / ratedCount }),
	};
}

/** `3:20` for 3 min 20 s. */
export function formatSpan(ms: number): string {
	const totalSec = Math.max(0, Math.round(ms / 1000));
	const mins = Math.floor(totalSec / 60);
	const secs = totalSec % 60;
	return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** `★★★★☆` - the empty stars keep a column of ratings aligned. */
export function stars(rating: number | undefined): string {
	if (rating === undefined) return "·····";
	const filled = Math.min(5, Math.max(0, Math.round(rating)));
	return "★".repeat(filled) + "☆".repeat(5 - filled);
}

/** Human label for a 1-5 score, used by the rating dialog and the report. */
export const RATING_LABELS: Record<number, string> = {
	1: "很差（疼痛 / 漏尿 / 完全使不上力）",
	2: "偏差（找不到发力感）",
	3: "一般（勉强完成）",
	4: "不错（基本可控）",
	5: "很好（有力、全程撑住）",
};

export function ratingLabel(rating: number | undefined): string {
	if (rating === undefined) return "未评分";
	return RATING_LABELS[Math.round(rating)] ?? `${rating}`;
}

// ── report rendering ────────────────────────────────────────────────────────

/** Structural subset of pi's Theme, so this module needs no pi import. */
export interface ReportTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

const BAR_CELLS = 18;

/**
 * The `/kegel` → 训练记录 panel: today's volume, the streak, and one row per
 * day with a bar sized by contraction time. Pure - takes `now` explicitly.
 */
export function historyReport(theme: ReportTheme, history: HistoryEntry[], now: number, days: number): string[] {
	if (history.length === 0) {
		return [
			theme.fg("muted", "还没有记录。完整练完一次就会自动记一笔，并问你「这次感觉如何」。"),
			"",
			theme.fg("dim", "提示：手动结束（alt+e）不算完成，不会记入。"),
		];
	}

	const window = dayStats(history, now, days);
	const all = totals(history, now);
	const today = window[window.length - 1];
	const lines: string[] = [];

	const todayBits: string[] = [theme.fg("accent", `${today.sessions} 次`)];
	if (today.sessions > 0) {
		todayBits.push(theme.fg("muted", `${today.reps} 个收缩`));
		todayBits.push(theme.fg("muted", formatSpan(today.contractMs)));
		if (today.rating !== undefined) {
			todayBits.push(`${theme.fg("warning", stars(today.rating))} ${theme.fg("muted", today.rating.toFixed(1))}`);
		}
	}
	lines.push(`${theme.bold("今日")}  ${todayBits.join(theme.fg("dim", " · "))}`);
	if (today.sessions === 0) lines.push(theme.fg("dim", "        今天还没练，随时 /kegel 开始"));

	const streakText = all.streak > 0 ? theme.fg("success", `${all.streak} 天`) : theme.fg("dim", "0 天");
	const avg =
		all.rating === undefined
			? theme.fg("dim", "未评分")
			: `${theme.fg("warning", stars(all.rating))} ${theme.fg("muted", all.rating.toFixed(1))}`;
	lines.push(
		`${theme.bold("连续")}  ${streakText}` +
			theme.fg("dim", "   ") +
			theme.bold("累计") +
			`  ${theme.fg("muted", `${all.sessions} 次 · ${all.reps} 个收缩 · ${formatSpan(all.contractMs)}`)}` +
			theme.fg("dim", "   ") +
			theme.bold("平均") +
			`  ${avg}`,
	);

	lines.push("");
	lines.push(theme.fg("dim", `近 ${window.length} 天（柱长 = 收缩时长，最长 ${formatSpan(Math.max(...window.map((d) => d.contractMs)))}）`));

	const peak = Math.max(1, ...window.map((d) => d.contractMs));
	for (const day of window) {
		const label = day.date.slice(5); // MM-DD
		const isToday = day.date === today.date;
		const dateText = isToday ? theme.fg("accent", `${label}▸`) : theme.fg("dim", `${label} `);
		if (day.sessions === 0) {
			lines.push(`${dateText} ${theme.fg("dim", "·".repeat(BAR_CELLS))} ${theme.fg("dim", "—")}`);
			continue;
		}
		const filled = Math.max(1, Math.round((day.contractMs / peak) * BAR_CELLS));
		const bar = theme.fg(isToday ? "accent" : "success", "█".repeat(filled)) + theme.fg("dim", "░".repeat(BAR_CELLS - filled));
		const detail = `${day.sessions} 次 ${formatSpan(day.contractMs)}`.padEnd(11);
		lines.push(
			`${dateText} ${bar} ${theme.fg("muted", detail)}${day.rating === undefined ? theme.fg("dim", "·····") : theme.fg("warning", stars(day.rating))}`,
		);
	}

	const rated = [...history].filter((entry) => entry.rating !== undefined).reverse().slice(0, 5);
	if (rated.length > 0) {
		lines.push("");
		lines.push(theme.fg("dim", "最近的感受"));
		for (const entry of rated) {
			const when = `${dayKey(entry.at).slice(5)}`;
			const note = entry.note ? ` ${theme.fg("muted", entry.note)}` : "";
			lines.push(`${theme.fg("dim", when)} ${theme.fg("warning", stars(entry.rating))} ${theme.fg("dim", ratingLabel(entry.rating))}${note}`);
		}
	}
	return lines;
}
