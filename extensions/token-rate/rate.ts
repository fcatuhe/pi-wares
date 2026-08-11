export const WINDOW_SAMPLES = 5;

export interface Sample {
	tokens: number;
	seconds: number;
}

export function record(samples: readonly Sample[], sample: Sample): Sample[] {
	const usable = sample.tokens > 0 && sample.seconds > 0 && Number.isFinite(sample.seconds);
	if (!usable) return [...samples];
	return [...samples, sample].slice(-WINDOW_SAMPLES);
}

export function tokensPerSecond(samples: readonly Sample[]): number | undefined {
	const tokens = samples.reduce((total, s) => total + s.tokens, 0);
	const seconds = samples.reduce((total, s) => total + s.seconds, 0);
	if (tokens <= 0 || seconds <= 0) return undefined;
	return tokens / seconds;
}

export function format(samples: readonly Sample[]): string | undefined {
	const tps = tokensPerSecond(samples);
	return tps === undefined ? undefined : `${Math.round(tps)} tok/s`;
}
