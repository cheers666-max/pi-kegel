#!/usr/bin/env node
/**
 * Frame generator for the README assets.
 *
 * This renders the **real** `widget.ts` (no copied markup) with a mock theme
 * that emits ANSI SGR codes, so the demo GIF can never drift from shipping
 * code. Output: `tools/frames.json`, consumed by `tools/make-assets.py`.
 *
 * Usage:  node tools/render-frames.mjs [--config '<json>'] [--cols 100] [--rows 42]
 */
import { mkdirSync, existsSync, symlinkSync, realpathSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
// node resolves bare imports by walking *up from the importing file*, so the
// shim has to sit in a real `node_modules` next to widget.ts, i.e. the repo root.
const CACHE = join(ROOT, "node_modules");

/**
 * `widget.ts` imports `@earendil-works/pi-tui`. A pi extension runs inside pi,
 * so that package always exists somewhere - we just have to point node at it.
 */
function ensurePiTui() {
	const target = join(CACHE, "@earendil-works", "pi-tui");
	if (existsSync(target)) return;

	const candidates = [];
	if (process.env.PI_GLOBAL_ROOT) candidates.push(process.env.PI_GLOBAL_ROOT);
	// `npm root -g`, then the layout implied by the `pi` binary itself.
	for (const cmd of ["npm root -g", "which pi"]) {
		const out = execSyncQuiet(cmd);
		if (!out || out.includes("\n")) continue;
		if (cmd === "npm root -g") candidates.push(join(out, "@earendil-works", "pi-coding-agent"));
		else candidates.push(join(dirname(dirname(out)), "lib", "node_modules", "@earendil-works", "pi-coding-agent"));
	}
	candidates.push(
		"/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent",
		"/usr/local/lib/node_modules/@earendil-works/pi-coding-agent",
	);

	for (const c of candidates) {
		const p = join(c, "node_modules", "@earendil-works", "pi-tui");
		if (existsSync(p)) {
			mkdirSync(dirname(target), { recursive: true });
			symlinkSync(realpathSync(p), target, "dir");
			return;
		}
	}
	console.error(
		"找不到 @earendil-works/pi-tui。\n" +
			"这个脚本用真实 widget.ts 渲染，所以需要装过 pi。\n" +
			"用 PI_GLOBAL_ROOT=/path/to/node_modules 指定，或把该包放好再跑。",
	);
	process.exit(1);
}

function execSyncQuiet(cmd) {
	try {
		return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return "";
	}
}

const arg = (name, dflt) => {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? dflt : process.argv[i + 1];
};

ensurePiTui();

const { KegelEngine, estimateDuration } = await import(join(ROOT, "core.ts"));
const { KegelWidget } = await import(join(ROOT, "widget.ts"));
const { historyReport } = await import(join(ROOT, "history.ts"));

// ── mock theme: maps semantic names to the 256-colour palette used below ──────
const PALETTE = {
	accent: "\x1b[38;5;44m", // cyan-ish, matches the default pi theme
	text: "\x1b[38;5;253m",
	muted: "\x1b[38;5;245m",
	dim: "\x1b[38;5;240m",
	success: "\x1b[38;5;114m",
	warning: "\x1b[38;5;215m",
};
const RESET = "\x1b[0m";
const theme = {
	name: "demo",
	fg: (color, text) => `${PALETTE[color] ?? PALETTE.text}${text}${RESET}`,
	bold: (text) => `\x1b[1m${text}\x1b[22m`,
};

// ── the workout the GIF shows ─────────────────────────────────────────────────
// Deliberately short so one loop fits a README. The default prescription
// (10s/10s x8 x3) would make a two-minute GIF.
const CONFIG = arg("config", null)
	? JSON.parse(arg("config", "{}"))
	: { prepareSec: 3, contractSec: 5, relaxSec: 5, reps: 2, sets: 1, setRestSec: 5 };

const COLS = Number(arg("cols", 100));
const ROWS = Number(arg("rows", 42));
const STEP_MS = Number(arg("step", 400));

const engine = new KegelEngine(CONFIG);
const widget = new KegelWidget(
	engine,
	() => theme,
	() => true, // pretend the agent is busy, so the header matches a real run
	() => ROWS,
	() => "bloom",
);

engine.start();

const frames = [];
let elapsed = 0;
const total = estimateDuration(engine.config) ?? 20_000;
while (elapsed <= total) {
	const lines = widget.render(COLS);
	frames.push({
		ms: elapsed,
		phase: engine.phase,
		label: `${engine.config.contractSec}s 收缩 / ${engine.config.relaxSec}s 放松`,
		lines,
	});
	engine.advance(STEP_MS);
	elapsed += STEP_MS;
}
// final resting frame
frames.push({ ms: total, phase: engine.phase, label: "完成", lines: widget.render(COLS) });

// ── the /kegel -> 训练记录 panel, with a plausible two-week log ─────────────
// `at` values are relative to now so the screenshot always shows a live streak.
const DAY = 86_400_000;
const dayStart = new Date();
dayStart.setHours(12, 0, 0, 0);
const ago = (days, hour = 0) => dayStart.getTime() - days * DAY + hour * 3_600_000;

/** days back, reps, rating, note */
const SAMPLE = [
	[13, 0, undefined], [12, 1, 3], [11, 0, undefined], [10, 1, 4], [9, 1, 4],
	[8, 2, 4], [7, 1, 3], [6, 0, undefined], [5, 1, 5], [4, 2, 4],
	[3, 1, 5], [2, 2, 5], [1, 1, 4], [0, 2, 5],
];
const sampleLog = [];
for (const [days, sessions, rating] of SAMPLE) {
	for (let i = 0; i < sessions; i++) {
		sampleLog.push({
			at: ago(days, i * 2),
			reps: 24,
			sets: 3,
			contractSec: 10,
			relaxSec: 10,
			contractMs: 24 * 10_000,
			durationMs: 12 * 60_000,
			end: "done",
			// vary the second session of a day a little, so the report shows a range
			...(rating === undefined ? {} : { rating: Math.max(1, rating - (i > 0 ? 1 : 0)) }),
			...(days === 1 ? { note: "昨晚睡得好，明显更稳" } : {}),
		});
	}
}
const report = historyReport(theme, sampleLog, Date.now(), 14);

mkdirSync(HERE, { recursive: true });
writeFileSync(
	join(HERE, "frames.json"),
	JSON.stringify({ cols: COLS, rows: ROWS, stepMs: STEP_MS, config: CONFIG, frames, report }, null, 1),
);

const phases = frames.reduce((acc, f) => ({ ...acc, [f.phase]: (acc[f.phase] ?? 0) + 1 }), {});
console.log(
	`${frames.length} 帧 → tools/frames.json  (${(total / 1000).toFixed(1)}s, ${Object.entries(phases)
		.map(([k, v]) => `${k}:${v}`)
		.join(" ")})`,
);
