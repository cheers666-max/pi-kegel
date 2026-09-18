/**
 * Self-test for the pure modules: the Kegel state machine and the bloom renderer.
 * Run: node --experimental-strip-types core.test.ts
 */

import assert from "node:assert/strict";
import { bloomForPhase, renderBloom } from "./bloom.ts";
import {
	type HistoryEntry,
	appendEntry,
	dayKey,
	dayStats,
	formatSpan,
	parseHistory,
	rateSession,
	serializeEntry,
	stars,
	historyReport,
	streakOf,
	totals,
} from "./history.ts";
import {
	DEFAULT_CONFIG,
	KegelEngine,
	configFromPreset,
	estimateDuration,
	formatClock,
	presetIdFor,
	sanitize,
	type Phase,
} from "./core.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
	try {
		fn();
		passed += 1;
		console.log(`  ok  ${name}`);
	} catch (error) {
		console.error(`FAIL  ${name}`);
		console.error(error);
		process.exitCode = 1;
	}
}

/** Run the engine in 250ms steps, recording the phase timeline. */
function timeline(engine: KegelEngine, maxSteps = 100000): Array<{ phase: Phase; ms: number }> {
	const seen: Array<{ phase: Phase; ms: number }> = [];
	let steps = 0;
	while (engine.running && steps++ < maxSteps) {
		const before = engine.phase;
		const events = engine.advance(250);
		for (const event of events) seen.push({ phase: event.to, ms: engine.elapsedMs });
		if (engine.phase === before && events.length === 0 && !engine.running) break;
	}
	return seen;
}

test("10/10 default: contract then relax", () => {
	const engine = new KegelEngine({ contractSec: 10, relaxSec: 10, reps: 1, sets: 1, prepareSec: 0, setRestSec: 0 });
	const events = engine.start();
	assert.equal(engine.phase, "contract");
	assert.deepEqual(events, [{ from: "prepare", to: "contract" }]);

	const changes = timeline(engine);
	assert.deepEqual(
		changes.map((c) => c.phase),
		["relax", "done"],
	);
	// contract ended at ~10s, relax ended at ~20s
	assert.ok(Math.abs(changes[0].ms - 10000) <= 250, `contract ended at ${changes[0].ms}`);
	assert.ok(Math.abs(changes[1].ms - 20000) <= 250, `relax ended at ${changes[1].ms}`);
	assert.equal(engine.completedReps, 1);
	assert.ok(Math.abs(engine.totalContractMs - 10000) <= 250);
});

test("3 reps x 2 sets produces the expected phase order", () => {
	const engine = new KegelEngine({
		contractSec: 1,
		relaxSec: 1,
		reps: 3,
		sets: 2,
		setRestSec: 2,
		prepareSec: 0,
	});
	engine.start();
	const order = timeline(engine).map((c) => c.phase);
	assert.deepEqual(order, [
		"relax",
		"contract",
		"relax",
		"contract",
		"relax",
		"setRest",
		"contract",
		"relax",
		"contract",
		"relax",
		"contract",
		"relax",
		"done",
	]);
	assert.equal(engine.completedReps, 6);
	assert.equal(engine.set, 2);
});

test("endless reps never reaches done", () => {
	const engine = new KegelEngine({ contractSec: 1, relaxSec: 1, reps: 0, sets: 0, prepareSec: 0 });
	engine.start();
	for (let i = 0; i < 200; i += 1) engine.advance(500);
	assert.equal(engine.running, true);
	assert.ok(engine.completedReps > 20);
});

test("infinite sets with finite reps keeps cycling sets", () => {
	const engine = new KegelEngine({ contractSec: 1, relaxSec: 1, reps: 2, sets: 0, setRestSec: 1, prepareSec: 0 });
	engine.start();
	for (let i = 0; i < 400; i += 1) engine.advance(100);
	assert.equal(engine.running, true);
	assert.ok(engine.set >= 3, `set index ${engine.set}`);
});

test("prepare countdown happens before the first contraction", () => {
	const engine = new KegelEngine({ contractSec: 5, relaxSec: 5, reps: 1, sets: 1, prepareSec: 3, setRestSec: 0 });
	engine.start();
	assert.equal(engine.phase, "prepare");
	assert.equal(engine.secondsLeft, 3);
	const changes = timeline(engine);
	assert.equal(changes[0].phase, "contract");
	assert.ok(Math.abs(changes[0].ms - 3000) <= 250);
});

test("pause freezes the clock", () => {
	const engine = new KegelEngine({ contractSec: 10, relaxSec: 10, reps: 1, sets: 1, prepareSec: 0 });
	engine.start();
	engine.advance(4000);
	const remaining = engine.remainingMs;
	engine.pause();
	engine.advance(60000);
	assert.equal(engine.remainingMs, remaining);
	assert.equal(engine.totalContractMs, 4000);
	assert.equal(engine.paused, true);
	engine.resume();
	engine.advance(1000);
	assert.equal(engine.totalContractMs, 5000);
});

test("togglePause starts a fresh session from idle", () => {
	const engine = new KegelEngine({ prepareSec: 0 });
	assert.equal(engine.phase, "idle");
	const paused = engine.togglePause();
	assert.equal(paused, false);
	assert.equal(engine.phase, "contract");
	assert.equal(engine.togglePause(), true);
});

test("skip jumps to the next phase and counts the rep", () => {
	const engine = new KegelEngine({ contractSec: 10, relaxSec: 10, reps: 3, sets: 1, prepareSec: 0 });
	engine.start();
	engine.advance(1000);
	const events = engine.skip();
	assert.deepEqual(events, [{ from: "contract", to: "relax" }]);
	assert.equal(engine.completedReps, 1);
	assert.equal(engine.rep, 1);
	engine.skip();
	assert.equal(engine.phase, "contract");
	assert.equal(engine.rep, 2);
});

test("skip is a no-op when idle", () => {
	const engine = new KegelEngine();
	assert.deepEqual(engine.skip(), []);
});

test("no set-rest after the final set", () => {
	const engine = new KegelEngine({ contractSec: 1, relaxSec: 1, reps: 1, sets: 1, setRestSec: 30, prepareSec: 0 });
	engine.start();
	const order = timeline(engine).map((c) => c.phase);
	assert.deepEqual(order, ["relax", "done"]);
});

test("advance with a huge dt crosses several phases at once", () => {
	const engine = new KegelEngine({ contractSec: 10, relaxSec: 10, reps: 4, sets: 1, prepareSec: 0 });
	engine.start();
	const events = engine.advance(65000);
	assert.deepEqual(
		events.map((e) => e.to),
		["relax", "contract", "relax", "contract", "relax", "contract"],
	);
	assert.equal(engine.phase, "contract");
	assert.equal(engine.rep, 4);
	assert.equal(engine.completedReps, 3);
	assert.ok(Math.abs(engine.totalContractMs - 35000) < 1);
});

test("sanitize clamps nonsense input", () => {
	const config = sanitize({ contractSec: 0, relaxSec: -5, reps: 9999, sets: 1.4, prepareSec: 100, setRestSec: 999 });
	assert.equal(config.contractSec, 1);
	assert.equal(config.relaxSec, 1);
	assert.equal(config.reps, 200);
	assert.equal(config.sets, 1);
	assert.equal(config.prepareSec, 30);
	assert.equal(config.setRestSec, 300);
	assert.equal(config.pauseWhenIdle, true);
	assert.equal(config.visual, "bloom");
	assert.equal(config.bloomOn, "relax");
	assert.equal(config.cue, "system");
	assert.equal(config.volume, 0.7);
	assert.equal(config.tickLastSec, 3);
	assert.equal(typeof config.voice, "string");
	// The pre-0.2 `sound: boolean` spelling still migrates.
	assert.equal(sanitize({ sound: false } as never).cue, "off");
	assert.equal(sanitize({ sound: true } as never).cue, "system");
	assert.equal(sanitize({ cue: "voice", volume: 5 }).volume, 1, "volume clamps to 1");
	assert.equal(sanitize({ cue: "voice", volume: -2 }).volume, 0, "volume clamps to 0");
	assert.equal(sanitize({ cue: "nonsense" as never }).cue, "system");
	assert.equal(sanitize({ tickLastSec: 99 }).tickLastSec, 10, "tick window clamps");
	assert.equal(sanitize({ voice: "   " }).voice, DEFAULT_CONFIG.voice, "blank voice falls back");
	assert.ok(!("pinWidget" in config), "pinWidget should be gone");
});

// ── bloom renderer ──────────────────────────────────────────────────────────

/** Count the Braille dots in a rendered flower. */
function dotCount(lines: string[]): number {
	let dots = 0;
	for (const line of lines) {
		for (const char of line) {
			const code = char.codePointAt(0) ?? 0;
			if (code >= 0x2800 && code <= 0x28ff) dots += (code - 0x2800).toString(2).replace(/0/g, "").length;
		}
	}
	return dots;
}

test("renderBloom honours the requested box", () => {
	const lines = renderBloom({ width: 16, height: 8, bloom: 1 });
	assert.equal(lines.length, 8);
	for (const line of lines) assert.equal([...line].length, 16, JSON.stringify(line));
});

test("bloom opens and closes", () => {
	const size = { width: 16, height: 8 };
	const seed = dotCount(renderBloom({ ...size, bloom: 0 }));
	const half = dotCount(renderBloom({ ...size, bloom: 0.5 }));
	const full = dotCount(renderBloom({ ...size, bloom: 1 }));
	assert.ok(seed > 0, `seed should stay visible, got ${seed}`);
	assert.ok(seed < half && half < full, `expected ${seed} < ${half} < ${full}`);
	assert.ok(full > 80, `full bloom should be substantial, got ${full}`);
});

test("renderBloom is deterministic and survives tiny boxes", () => {
	assert.deepEqual(renderBloom({ width: 12, height: 5, bloom: 0.7 }), renderBloom({ width: 12, height: 5, bloom: 0.7 }));
	assert.deepEqual(renderBloom({ width: 1, height: 0, bloom: 1 }), []);
	assert.equal(renderBloom({ width: 4, height: 2, bloom: 1 }).length, 2);
});

test("colorize receives the prominence rank", () => {
	const ranks = new Set<number>();
	renderBloom({ width: 16, height: 8, bloom: 1, colorize: (rank, glyph) => (ranks.add(rank), glyph) });
	assert.ok(ranks.has(0), "core rank 0 should appear");
	assert.ok(ranks.has(1), "outer ring rank 1 should appear");
	for (const rank of ranks) assert.ok(rank >= 0 && rank <= 3, `unexpected rank ${rank}`);
});

test("bloomForPhase: 收缩聚拢 / 放松绽开（默认）", () => {
	// Squeeze gathers the flower into a bud and holds it there.
	assert.ok(bloomForPhase("contract", 0, 10) > 0.9, "contract starts open");
	assert.ok(bloomForPhase("contract", 1800, 10) < 0.45, "contract gathers down");
	assert.ok(bloomForPhase("contract", 9000, 10) < 0.45, "contract holds the bud");
	// Release blooms it open and keeps it breathing.
	assert.ok(bloomForPhase("relax", 0, 10) < 0.45, "relax starts gathered");
	assert.ok(bloomForPhase("relax", 1600, 10) > 0.9, "relax blooms open");
	assert.ok(bloomForPhase("relax", 9000, 10) > 0.9, "relax holds open");
	// Idle phases sit near open, because a contraction comes next.
	for (const phase of ["prepare", "setRest", "idle"]) {
		const value = bloomForPhase(phase, 500, 10);
		assert.ok(value > 0.7 && value < 1, `${phase} should idle near open, got ${value}`);
	}
	assert.equal(bloomForPhase("done", 0, 0), 1);
});

test("bloomForPhase: 收缩绽开（反向）", () => {
	assert.ok(bloomForPhase("contract", 0, 10, "contract") < 0.45, "contract starts gathered");
	assert.ok(bloomForPhase("contract", 1600, 10, "contract") > 0.9, "contract blooms");
	assert.ok(bloomForPhase("relax", 1800, 10, "contract") < 0.45, "relax gathers");
	// Idle phases now sit near the bud, because a blooming contraction comes next.
	for (const phase of ["prepare", "setRest", "idle"]) {
		const value = bloomForPhase(phase, 500, 10, "contract");
		assert.ok(value < 0.5, `${phase} should idle near the bud, got ${value}`);
	}
});

test("bloomForPhase: 相位交界不跳变", () => {
	// A phase must hand over to the next without the flower popping.
	const endOf = (phase: string, seconds: number, bloomOn: "relax" | "contract") =>
		bloomForPhase(phase, seconds * 1000 - 1, seconds, bloomOn);
	const startOf = (phase: string, seconds: number, bloomOn: "relax" | "contract") =>
		bloomForPhase(phase, 0, seconds, bloomOn);
	const pairs: Array<[string, number, string, number]> = [
		["prepare", 3, "contract", 10],
		["contract", 10, "relax", 10],
		["relax", 10, "contract", 10],
		["relax", 10, "setRest", 30],
		["setRest", 30, "contract", 10],
	];
	for (const bloomOn of ["relax", "contract"] as const) {
		for (const [from, fromSec, to, toSec] of pairs) {
			const gap = Math.abs(endOf(from, fromSec, bloomOn) - startOf(to, toSec, bloomOn));
			assert.ok(gap < 0.25, `${bloomOn}: ${from} -> ${to} jumps by ${gap.toFixed(2)}`);
		}
	}
});

test("bloomForPhase never leaves 0..1", () => {
	for (const phase of ["idle", "prepare", "contract", "relax", "setRest", "done"]) {
		for (const bloomOn of ["relax", "contract"] as const) {
			for (let ms = 0; ms <= 15000; ms += 137) {
				for (const seconds of [1, 5, 10, 15, 30]) {
					const value = bloomForPhase(phase, ms, seconds, bloomOn);
					assert.ok(value >= 0 && value <= 1, `${phase}@${ms}ms/${seconds}s/${bloomOn} -> ${value}`);
				}
			}
		}
	}
});

test("preset round-trips", () => {
	const workout = configFromPreset("standard");
	assert.ok(workout);
	const engine = new KegelEngine(workout);
	assert.equal(engine.config.contractSec, 10);
	assert.equal(engine.config.relaxSec, 10);
	assert.equal(presetIdFor(engine.config), "standard");
	const duration = estimateDuration(engine.config);
	assert.equal(duration, 543000, `duration ${duration}`);
	assert.equal(estimateDuration({ ...engine.config, reps: 0 }), undefined);
});

test("formatClock", () => {
	assert.equal(formatClock(0), "0:00");
	assert.equal(formatClock(9000), "0:09");
	assert.equal(formatClock(65000), "1:05");
	assert.equal(formatClock(600000), "10:00");
});

console.log(`\n${passed} test(s) passed${process.exitCode ? " (with failures)" : ""}`);

// ── training log ────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const noon = (offsetDays: number) => {
	const d = new Date(2026, 2, 10, 12, 0, 0); // local noon, DST-safe
	return d.getTime() + offsetDays * DAY;
};
const entryAt = (offsetDays: number, patch: Partial<HistoryEntry> = {}): HistoryEntry => ({
	at: noon(offsetDays),
	reps: 24,
	sets: 3,
	contractSec: 10,
	relaxSec: 10,
	contractMs: 240_000,
	durationMs: 600_000,
	end: "done",
	...patch,
});

test("history: dayKey uses local time, not UTC", () => {
	assert.equal(dayKey(new Date(2026, 2, 10, 12, 0, 0).getTime()), "2026-03-10");
	assert.equal(dayKey(new Date(2026, 0, 5, 0, 30, 0).getTime()), "2026-01-05", "just past local midnight");
});

test("history: parseHistory tolerates blank lines, garbage and a torn tail", () => {
	const text = [serializeEntry(entryAt(0)), "", "not json", '{"at":"nope"}', serializeEntry(entryAt(-1)).trim()].join("\n");
	const parsed = parseHistory(text);
	assert.equal(parsed.length, 2, "two valid entries survive");
	assert.ok(parsed[0].at < parsed[1].at, "sorted oldest first");
	assert.equal(parseHistory("").length, 0);
});

test("history: parseHistory clamps ratings and drops empty notes", () => {
	const ok = parseHistory(serializeEntry(entryAt(0, { rating: 9 })));
	assert.equal(ok[0].rating, 5, "rating clamps to 5");
	const low = parseHistory(serializeEntry(entryAt(0, { rating: 0 })));
	assert.equal(low[0].rating, undefined, "0 means unrated");
	const blank = parseHistory(`${JSON.stringify({ ...entryAt(0), note: "   " })}\n`);
	assert.equal(blank[0].note, undefined, "whitespace note is dropped");
});

test("history: appendEntry keeps the newest entries only", () => {
	let log: HistoryEntry[] = [];
	for (let i = 0; i < 5; i++) log = appendEntry(log, entryAt(i), 3);
	assert.equal(log.length, 3);
	assert.deepEqual(
		log.map((e) => e.at),
		[noon(2), noon(3), noon(4)],
	);
});

test("history: rateSession updates one entry and leaves the rest alone", () => {
	const log = [entryAt(-2), entryAt(-1), entryAt(0)];
	const rated = rateSession(log, noon(-1), 5, "今天状态好");
	assert.equal(rated[1].rating, 5);
	assert.equal(rated[1].note, "今天状态好");
	assert.equal(rated[0].rating, undefined);
	assert.equal(rated[2].rating, undefined);
	// clearing
	const cleared = rateSession(rated, noon(-1), undefined, "");
	assert.equal(cleared[1].rating, undefined);
	assert.equal(cleared[1].note, undefined);
});

test("history: dayStats fills the gaps and averages the day's ratings", () => {
	const log = [
		entryAt(-3, { contractMs: 60_000, rating: 2 }),
		entryAt(-1, { contractMs: 120_000, rating: 4 }),
		entryAt(-1, { contractMs: 60_000, rating: 5 }),
	];
	const days = dayStats(log, noon(0), 5);
	assert.equal(days.length, 5);
	assert.deepEqual(
		days.map((d) => d.date),
		["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"],
	);
	assert.equal(days[1].sessions, 1, "2026-03-07 has one session");
	assert.equal(days[1].contractMs, 60_000);
	assert.equal(days[3].sessions, 2, "2026-03-09 merges two sessions");
	assert.equal(days[3].contractMs, 180_000);
	assert.equal(days[3].rating, 4.5, "mean of 4 and 5");
	assert.equal(days[0].sessions, 0, "empty day is zero-filled, not skipped");
	assert.equal(days[0].rating, undefined);
});

test("history: streak counts back from today and survives an empty today", () => {
	assert.equal(streakOf([], noon(0)), 0);
	assert.equal(streakOf([entryAt(-1)], noon(0)), 1, "yesterday's streak is still alive today");
	assert.equal(streakOf([entryAt(0)], noon(0)), 1);
	assert.equal(streakOf([entryAt(-2), entryAt(-1), entryAt(0)], noon(0)), 3);
	assert.equal(streakOf([entryAt(-2), entryAt(0)], noon(0)), 1, "a gap resets at the gap");
	assert.equal(streakOf([entryAt(-5), entryAt(-4)], noon(0)), 0, "long-dead streak");
});

test("history: totals aggregates volume and the mean rating", () => {
	const log = [entryAt(-1, { rating: 3 }), entryAt(0, { reps: 16, contractMs: 60_000, rating: 5 }), entryAt(0)];
	const t = totals(log, noon(0));
	assert.equal(t.sessions, 3);
	assert.equal(t.reps, 64);
	assert.equal(t.contractMs, 540_000);
	assert.equal(t.activeDays, 2);
	assert.equal(t.ratedCount, 2);
	assert.equal(t.rating, 4, "mean of 3 and 5");
	assert.equal(t.streak, 2);
	assert.equal(totals([], noon(0)).rating, undefined, "no ratings -> undefined");
});

test("history: span and star formatting", () => {
	assert.equal(formatSpan(0), "0:00");
	assert.equal(formatSpan(240_000), "4:00");
	assert.equal(formatSpan(59_400), "0:59");
	assert.equal(stars(undefined), "·····");
	assert.equal(stars(5), "★★★★★");
	assert.equal(stars(3.4), "★★★☆☆");
	assert.equal(stars(1), "★☆☆☆☆");
});

test("history: report renders today, streak and a per-day bar", () => {
	const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
	const log = [
		entryAt(-1, { contractMs: 60_000, rating: 3 }),
		entryAt(0, { contractMs: 120_000, rating: 5 }),
		entryAt(0, { contractMs: 120_000 }),
	];
	const lines = historyReport(theme, log, noon(0), 4);
	const text = lines.join("\n");
	assert.ok(text.includes("今日"), "has a today line");
	assert.ok(/今日\s+2 次/.test(text), `today shows 2 sessions — got: ${lines[0]}`);
	assert.ok(text.includes("连续") && text.includes("2 天"), "streak of 2 days");
	assert.ok(text.includes("★★★★★"), "shows the rating stars");
	const chart = lines.slice(0, lines.findIndex((l) => l.includes("最近的感受")));
	assert.equal(chart.filter((l) => /^\d\d-\d\d/.test(l)).length, 4, "one row per day in the window");
	assert.ok(text.includes("最近的感受"), "recent ratings section present");
	assert.ok(historyReport(theme, [], noon(0), 4).join(" ").includes("还没有记录"), "empty-state copy");
});

test("history: report never emits an empty day bar", () => {
	const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
	const lines = historyReport(theme, [entryAt(0)], noon(0), 3);
	const empty = lines.filter((l) => /^\d\d-\d\d/.test(l) && !l.includes("█"));
	assert.equal(empty.length, 2, "two empty days, drawn as dots");
});
