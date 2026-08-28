/**
 * Give one row a hard wall clock, so a stuck lane fails as a row instead of
 * taking the run down with it.
 *
 * The losing promise is NOT cancelled — `verifyRow` owns its own fetch aborts
 * and there is nothing here to hand a signal to. It is abandoned, and the
 * function may finish with it still in flight. That is deliberate: the cost of
 * an orphaned fetch is one wasted page read, and the cost of waiting for it is
 * the whole run's output. A budget breach is recorded as a failure with its own
 * message, so it reads as a bounded row rather than a mystery in the log.
 */
export async function withRowBudget<T>(rowId: string, budgetMs: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`row ${rowId}: budget exceeded (${budgetMs}ms) — abandoned so the run could finish`)),
      budgetMs,
    )
  })
  try {
    return await Promise.race([work, budget])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

