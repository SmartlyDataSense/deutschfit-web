// Stub for the `server-only` package so unit tests can import server-only
// modules. In production builds, Next.js enforces server-only imports at the
// bundler boundary; vitest doesn't run the Next.js bundler, so this empty
// module satisfies the import without any runtime effect.
export {};
