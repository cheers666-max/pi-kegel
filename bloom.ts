/**
 * Braille "bloom" renderer - an Apple-Mindfulness-style flower that opens and
 * closes with the breath cycle.
 *
 * Each character cell is a 2x4 Braille dot matrix, so a W x H cell canvas is a
 * 2W x 4H dot grid. A cell is about 1:2 (w:h), so one dot step measures 0.5 x 0.5
 * in "cell units" on both axes - that is what keeps the flower round.
 *
 * The flower is drawn as concentric petal outlines (a small filled core plus
 * three scalloped rings) rather than a solid fill: outlines stay legible at
 * terminal resolution and read as layered petals.
 *
 * Deliberately no rotation: an 8-petal shape has 45-degree symmetry, but the
 * Braille grid does not, so rotating samples the curve differently each frame and
 * the flower visibly wobbles. Scaling alone carries the breathing motion.
 */

/** Braille dot bit for sub-cell column x (0|1) and row y (0..3). */
const DOT_BITS: readonly (readonly [number, number])[] = [
	[0x01, 0x08],
	[0x02, 0x10],
	[0x04, 0x20],
	[0x40, 0x80],
];

const BRAILLE_BASE = 0x2800;

const PETALS = 8;
/** Valleys reach this fraction of the petal-tip radius. Lower = deeper notches. */
const PINCH = 0.45;
/** Filled centre, then scalloped outlines as fractions of the current boundary. */
const CORE = 0.16;
const RINGS = [1.0, 0.65, 0.4];
/** Outline thickness in cell units; kept physical so petals stay crisp when small. */
const LINE_WIDTH = 0.5;
/** Prominence rank per layer, lowest wins: core, outer ring, then inner rings. */
const RANK_CORE = 0;
const RANK_OUTER = 1;
const RANK_MID = 2;
const RANK_INNER = 3;
export const MAX_RANK = RANK_INNER;

/** Smallest / largest bloom radius as a fraction of the box. */
const MIN_SCALE = 0.12;

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/** Boundary radius multiplier for an angle: `pinch + (1-pinch)|cos(petals/2 · θ)|`. */
function shapeAt(theta: number): number {
	return PINCH + (1 - PINCH) * Math.abs(Math.cos((PETALS / 2) * theta));
}

export interface BloomOptions {
	/** Width in character cells. */
	width: number;
	/** Height in character cells. */
	height: number;
	/** 0 = closed seed, 1 = fully open flower. */
	bloom: number;
	/** Colorize a Braille glyph by prominence rank (0 = core, MAX_RANK = faintest). */
	colorize?: (rank: number, glyph: string) => string;
}

/** Render the flower as `height` strings of exactly `width` characters. */
export function renderBloom(options: BloomOptions): string[] {
	const { width, height, bloom, colorize } = options;
	if (width < 2 || height < 1) return [];

	const physW = width;
	const physH = height * 2;
	const cx = physW / 2;
	const cy = physH / 2;
	const rMax = (Math.min(physW / 2, physH / 2) || 0) * 0.96;
	const scale = MIN_SCALE + (1 - MIN_SCALE) * clamp01(bloom);

	const lines: string[] = [];
	for (let cellY = 0; cellY < height; cellY += 1) {
		let line = "";
		for (let cellX = 0; cellX < width; cellX += 1) {
			let bits = 0;
			let rank = MAX_RANK + 1;
			for (let dy = 0; dy < 4; dy += 1) {
				for (let dx = 0; dx < 2; dx += 1) {
					const px = (cellX * 2 + dx + 0.5) * 0.5;
					const py = (cellY * 4 + dy + 0.5) * 0.5;
					const vx = px - cx;
					const vy = py - cy;
					const r = Math.sqrt(vx * vx + vy * vy);
					if (r > rMax) continue;
					const boundary = scale * shapeAt(Math.atan2(vy, vx)) * rMax;
					if (boundary <= 0) continue;

					let dotRank = MAX_RANK + 1;
					if (r / boundary <= CORE) {
						dotRank = RANK_CORE;
					} else {
						for (let i = 0; i < RINGS.length; i += 1) {
							if (Math.abs(r - (RINGS[i] as number) * boundary) <= LINE_WIDTH) {
								dotRank = i === 0 ? RANK_OUTER : i === 1 ? RANK_MID : RANK_INNER;
								break;
							}
						}
					}
					if (dotRank > MAX_RANK) continue;
					bits |= (DOT_BITS[dy] as readonly [number, number])[dx] as number;
					if (dotRank < rank) rank = dotRank;
				}
			}
			if (bits === 0) {
				line += " ";
				continue;
			}
			const glyph = String.fromCharCode(BRAILLE_BASE + bits);
			line += colorize ? colorize(rank, glyph) : glyph;
		}
		lines.push(line);
	}
	return lines;
}

/** Which phase means "open flower". */
export type BloomOn = "relax" | "contract";

/** Flower radius while fully bloomed / while gathered into a tight bud. */
const OPEN_LEVEL = 0.985;
/** Gathered state: small and tucked in, but still legibly a flower (not a dot). */
const BUD_LEVEL = 0.3;

/**
 * Map a breath phase onto a bloom amount.
 *
 * The cycle is built around one rule: the flower is gathered while you squeeze
 * and open while you release. That keeps every phase boundary continuous - a
 * gather phase always follows something that ended open, and an opening phase
 * always follows a gathered bud - so the petals never pop between frames.
 *
 * `bloomOn` picks which phase opens: `"relax"` (squeeze gathers, release blooms)
 * or `"contract"` (the reverse, like a Breathe-style inhale).
 *
 * Open/close durations scale with the phase length, so a 1s quick-flick rep reads.
 */
export function bloomForPhase(
	phase: string,
	elapsedMs: number,
	phaseSeconds: number,
	bloomOn: BloomOn = "relax",
): number {
	const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
	const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
	const ms = Math.max(1, phaseSeconds * 1000);
	const openMs = Math.min(1600, Math.max(350, ms * 0.18));
	const closeMs = Math.min(1800, Math.max(300, ms * 0.25));

	if (phase === bloomOn) {
		// Release phase: open fairly quickly, then hold with a faint shimmer.
		const opened = easeOut(elapsedMs / openMs);
		const shimmer = opened >= 1 ? 0.03 * Math.sin(elapsedMs / 850) : 0;
		return clamp01(BUD_LEVEL + (OPEN_LEVEL - BUD_LEVEL) * opened + shimmer);
	}

	if (phase === "contract" || phase === "relax") {
		// Squeeze phase: gather down into a tight bud and hold it there.
		const stillOpen = 1 - easeOut(elapsedMs / closeMs);
		return clamp01(BUD_LEVEL + (OPEN_LEVEL - BUD_LEVEL) * stillOpen);
	}

	// Idle phases (prepare / set-rest / idle) breathe around the level the next
	// contraction starts from, so they hand over without a visible jump.
	if (phase === "done") return 1;
	const level = bloomOn === "relax" ? 0.9 : 0.34;
	const period = phase === "setRest" ? 1500 : 1300;
	return clamp01(level + 0.06 * Math.sin(elapsedMs / period - Math.PI / 2));
}
