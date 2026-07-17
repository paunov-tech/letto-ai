export async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.from(items || []);
  const results = new Array(source.length);
  let cursor = 0;
  async function worker() {
    while (cursor < source.length) {
      const index = cursor++;
      results[index] = await mapper(source[index], index);
    }
  }
  const workers = Array.from(
    { length: Math.min(source.length, Math.max(1, Number(limit) || 1)) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
