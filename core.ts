/**
 * Kegel trainer core - pure state machine, no TUI dependency.
 *
 * A rep = contract phase + relax phase.
 * A set = `reps` reps (+ optional set-rest before the next set).
 */

export type Phase = "idle" | "prepare" | "contract" | "relax" | "setRest" | "done";

export interface KegelConfig {
	/** Seconds to hold the contraction. */
	contractSec: number;
	/** Seconds to fully relax between reps. */
	relaxSec: number;
	/** Reps per set. 0 = endless. */
	reps: number;
	/** Number of sets. 0 = endless. */
	sets: number;
	/** Seconds of rest between sets. */
	setRestSec: number;
	/** Countdown before the first contraction. */
	prepareSec: number;
	/**
	 * How phase changes are announced: OS alert sounds, spoken Chinese cues, or
	 * nothing at all.
	 */
	cue: "system" | "voice" | "off";
	/** Playback volume for system sounds, 0..1. */
	volume: number;
	/**
	 * Tick once per second for the last N seconds of a phase, so you know a
	 * boundary is coming without looking. 0 disables it.
	 */
	tickLastSec: number;
	/** Voice used for `cue: "voice"` (macOS `say` voice name). */
	voice: string;
	/** Start a session automatically when the agent starts working. */
	autoStart: boolean;
	/** Stop the session automatically when the agent settles. */
	autoStop: boolean;
	/**
	 * Freeze the clock while the agent is idle instead of burning through phases
	 * unattended. Only applies to sessions that auto-started.
	 */
	pauseWhenIdle: boolean;
	/** Widget visual: the Braille flower, or the compact progress bar. */
	visual: "bloom" | "bar";
	/** Which phase blooms the flower open. The other one gathers it into a bud. */
	bloomOn: "relax" | "contract";
	/** Append finished sessions to the training log. */
	log: boolean;
	/** Ask "how did that feel?" (1-5) after a session runs to completion. */
	askRating: boolean;
	/** How many days the training-log report shows. */
	historyDays: number;
}

export const DEFAULT_CONFIG: KegelConfig = {
	contractSec: 10,
	relaxSec: 10,
	reps: 8,
	sets: 3,
	setRestSec: 30,
	prepareSec: 3,
	cue: "system",
	volume: 0.7,
	tickLastSec: 3,
	voice: "Tingting",
	autoStart: true,
	autoStop: false,
	pauseWhenIdle: true,
	visual: "bloom",
	bloomOn: "relax",
	log: true,
	askRating: true,
	historyDays: 14,
};

export interface Preset {
	id: string;
	name: string;
	detail: string;
	workout: Pick<KegelConfig, "contractSec" | "relaxSec" | "reps" | "sets" | "setRestSec">;
}

export const PRESETS: Preset[] = [
	{
		id: "standard",
		name: "标准 10/10",
		detail: "收缩 10s · 放松 10s · 8 次 × 3 组（约 9 分钟）",
		workout: { contractSec: 10, relaxSec: 10, reps: 8, sets: 3, setRestSec: 30 },
	},
	{
		id: "beginner",
		name: "入门 5/5",
		detail: "收缩 5s · 放松 5s · 8 次 × 2 组（约 3 分钟）",
		workout: { contractSec: 5, relaxSec: 5, reps: 8, sets: 2, setRestSec: 30 },
	},
	{
		id: "endurance",
		name: "耐力 10/5",
		detail: "收缩 10s · 放松 5s · 10 次 × 3 组（约 8 分钟）",
		workout: { contractSec: 10, relaxSec: 5, reps: 10, sets: 3, setRestSec: 30 },
	},
	{
		id: "strength",
		name: "力量 15/10",
		detail: "收缩 15s · 放松 10s · 6 次 × 2 组（约 6 分钟）",
		workout: { contractSec: 15, relaxSec: 10, reps: 6, sets: 2, setRestSec: 40 },
	},
	{
		id: "quick",
		name: "快肌 1/1",
		detail: "快速收缩 1s · 放松 1s · 20 次 × 3 组（约 3 分钟）",
		workout: { contractSec: 1, relaxSec: 1, reps: 20, sets: 3, setRestSec: 30 },
	},
	{
		id: "endless",
		name: "无限循环 10/10",
		detail: "收缩 10s · 放松 10s · 一直循环（手动结束）",
		workout: { contractSec: 10, relaxSec: 10, reps: 0, sets: 0, setRestSec: 30 },
	},
];

export const PHASE_LABEL: Record<Phase, string> = {
	idle: "待机",
	prepare: "准备",
	contract: "收缩",
	relax: "放松",
	setRest: "组间休息",
	done: "完成",
};

export const PHASE_HINT: Record<Phase, string> = {
	idle: "",
	prepare: "坐直，找到盆底肌的位置",
	contract: "向上提紧，保持",
	relax: "完全松开，别憋气",
	setRest: "深呼吸，放松全身",
	done: "训练完成，辛苦了",
};

export interface PhaseChange {
	from: Phase;
	to: Phase;
}

/** Clamp user input into something the engine can always terminate on. */
export function sanitize(config: Partial<KegelConfig>): KegelConfig {
	const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
		const num = typeof value === "number" ? value : Number(value);
		if (!Number.isFinite(num)) return fallback;
		return Math.min(max, Math.max(min, Math.round(num)));
	};
	const clampFloat = (value: unknown, min: number, max: number, fallback: number): number => {
		const num = typeof value === "number" ? value : Number(value);
		if (!Number.isFinite(num)) return fallback;
		return Math.min(max, Math.max(min, num));
	};
	return {
		contractSec: clampInt(config.contractSec, 1, 120, DEFAULT_CONFIG.contractSec),
		relaxSec: clampInt(config.relaxSec, 1, 120, DEFAULT_CONFIG.relaxSec),
		reps: clampInt(config.reps, 0, 200, DEFAULT_CONFIG.reps),
		sets: clampInt(config.sets, 0, 50, DEFAULT_CONFIG.sets),
		setRestSec: clampInt(config.setRestSec, 0, 300, DEFAULT_CONFIG.setRestSec),
		prepareSec: clampInt(config.prepareSec, 0, 30, DEFAULT_CONFIG.prepareSec),
		// `sound: boolean` was the pre-0.2 spelling; keep old config files working.
		cue:
			config.cue === "off" || config.cue === "voice" || config.cue === "system"
				? config.cue
				: (config as { sound?: boolean }).sound === false
					? "off"
					: DEFAULT_CONFIG.cue,
		volume: clampFloat(config.volume, 0, 1, DEFAULT_CONFIG.volume),
		tickLastSec: clampInt(config.tickLastSec, 0, 10, DEFAULT_CONFIG.tickLastSec),
		voice: typeof config.voice === "string" && config.voice.trim() ? config.voice.trim() : DEFAULT_CONFIG.voice,
		autoStart: config.autoStart ?? DEFAULT_CONFIG.autoStart,
		autoStop: config.autoStop ?? DEFAULT_CONFIG.autoStop,
		pauseWhenIdle: config.pauseWhenIdle ?? DEFAULT_CONFIG.pauseWhenIdle,
		visual: config.visual === "bar" ? "bar" : "bloom",
		bloomOn: config.bloomOn === "contract" ? "contract" : "relax",
		log: config.log ?? DEFAULT_CONFIG.log,
		askRating: config.askRating ?? DEFAULT_CONFIG.askRating,
		historyDays: clampInt(config.historyDays, 3, 60, DEFAULT_CONFIG.historyDays),
	};
}

export function configFromPreset(presetId: string): Partial<KegelConfig> | undefined {
	const preset = PRESETS.find((item) => item.id === presetId);
	return preset ? { ...preset.workout } : undefined;
}

export function presetIdFor(config: KegelConfig): string | undefined {
	return PRESETS.find(
		(preset) =>
			preset.workout.contractSec === config.contractSec &&
			preset.workout.relaxSec === config.relaxSec &&
			preset.workout.reps === config.reps &&
			preset.workout.sets === config.sets &&
			preset.workout.setRestSec === config.setRestSec,
	)?.id;
}

export function formatClock(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPlan(config: KegelConfig): string {
	const reps = config.reps === 0 ? "∞" : String(config.reps);
	const sets = config.sets === 0 ? "∞" : String(config.sets);
	return `${config.contractSec}s/${config.relaxSec}s · ${reps} 次 × ${sets} 组`;
}

/** Rough duration estimate in ms. Returns undefined for endless plans. */
export function estimateDuration(config: KegelConfig): number | undefined {
	if (config.reps === 0 || config.sets === 0) return undefined;
	const seconds = (config.contractSec + config.relaxSec) * config.reps * config.sets;
	const breaks = Math.max(0, config.sets - 1) * config.setRestSec;
	return (seconds + breaks + config.prepareSec) * 1000;
}

export class KegelEngine {
	config: KegelConfig;
	phase: Phase = "idle";
	paused = false;
	remainingMs = 0;
	phaseTotalMs = 0;
	/** 1-based index of the current rep inside the current set. */
	rep = 1;
	/** 1-based index of the current set. */
	set = 1;
	completedReps = 0;
	totalContractMs = 0;
	elapsedMs = 0;

	constructor(config: Partial<KegelConfig> = {}) {
		this.config = sanitize({ ...DEFAULT_CONFIG, ...config });
	}

	get running(): boolean {
		return this.phase !== "idle" && this.phase !== "done";
	}

	get finished(): boolean {
		return this.phase === "done";
	}

	get phaseProgress(): number {
		if (this.phaseTotalMs <= 0) return 1;
		return Math.min(1, Math.max(0, 1 - this.remainingMs / this.phaseTotalMs));
	}

	get secondsLeft(): number {
		return Math.max(0, Math.ceil(this.remainingMs / 1000));
	}

	applyConfig(patch: Partial<KegelConfig>): void {
		this.config = sanitize({ ...this.config, ...patch });
	}

	start(): PhaseChange[] {
		this.paused = false;
		this.rep = 1;
		this.set = 1;
		this.completedReps = 0;
		this.totalContractMs = 0;
		this.elapsedMs = 0;
		this.enter("prepare");
		const events: PhaseChange[] = [];
		if (this.remainingMs <= 0) this.step(events);
		return events;
	}

	stop(): void {
		this.phase = "idle";
		this.paused = false;
		this.remainingMs = 0;
		this.phaseTotalMs = 0;
	}

	pause(): void {
		if (this.running) this.paused = true;
	}

	resume(): void {
		this.paused = false;
	}

	togglePause(): boolean {
		if (!this.running) {
			this.start();
			return false;
		}
		this.paused = !this.paused;
		return this.paused;
	}

	/** Drop the remainder of the current phase and jump to the next one. */
	skip(): PhaseChange[] {
		if (!this.running) return [];
		this.remainingMs = 0;
		const events: PhaseChange[] = [];
		this.step(events);
		return events;
	}

	/** Advance the clock. Returns the phase transitions that happened. */
	advance(dtMs: number): PhaseChange[] {
		const events: PhaseChange[] = [];
		if (!this.running || this.paused) return events;

		let budget = Math.max(0, dtMs);
		let guard = 0;
		while (budget > 0 && this.running && guard++ < 4096) {
			const step = Math.min(budget, this.remainingMs);
			this.remainingMs -= step;
			budget -= step;
			this.elapsedMs += step;
			if (this.phase === "contract") this.totalContractMs += step;
			if (this.remainingMs <= 0) this.step(events);
		}
		return events;
	}

	private enter(phase: Phase): void {
		this.phase = phase;
		this.phaseTotalMs = this.phaseSeconds(phase) * 1000;
		this.remainingMs = this.phaseTotalMs;
	}

	private phaseSeconds(phase: Phase): number {
		switch (phase) {
			case "prepare":
				return this.config.prepareSec;
			case "contract":
				return this.config.contractSec;
			case "relax":
				return this.config.relaxSec;
			case "setRest":
				return this.config.setRestSec;
			default:
				return 0;
		}
	}

	/** Move to the next phase, cascading through zero-length phases. */
	private step(events: PhaseChange[]): void {
		let guard = 0;
		while (guard++ < 64) {
			const from = this.phase;
			const to = this.nextPhase(from);
			if (from === "contract" && to === "relax") this.completedReps += 1;
			if (from === "relax" && to === "contract") this.rep += 1;
			if (from === "relax" && to === "setRest") {
				this.set += 1;
				this.rep = 1;
			}
			this.enter(to);
			events.push({ from, to });
			// Zero-length phases (prepare / setRest disabled) are resolved immediately.
			if (to === "done" || this.remainingMs > 0) return;
		}
		// Safety valve: never spin forever on a degenerate config.
		events.push({ from: this.phase, to: "done" });
		this.enter("done");
	}

	private nextPhase(from: Phase): Phase {
		switch (from) {
			case "prepare":
				return "contract";
			case "contract":
				return "relax";
			case "relax": {
				const setDone = this.config.reps > 0 && this.rep >= this.config.reps;
				if (!setDone) return "contract";
				const lastSet = this.config.sets > 0 && this.set >= this.config.sets;
				return lastSet ? "done" : "setRest";
			}
			case "setRest":
				return "contract";
			default:
				return "done";
		}
	}
}
