export function normalizeLocale(value: string): string {
    return value.replace(/[^A-Za-z]/g, "_");
}

// - Breaking changes: https://github.com/mrmlnc/fast-glob/releases/tag/3.0.0
// - How to write patterns on Windows: https://github.com/mrmlnc/fast-glob
export function sanitizeFastGlobPattern(pattern: string): string {
    return pattern.replace(/\\/g, "/");
}
