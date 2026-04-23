export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntil<T>({
  task,
  isDone,
  getError,
  intervalMs,
  maxAttempts,
  timeoutMessage,
}: {
  task: () => Promise<T>;
  isDone: (value: T) => boolean;
  getError?: (value: T) => string | null | undefined;
  intervalMs: number;
  maxAttempts: number;
  timeoutMessage: string;
}) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    await sleep(intervalMs);
    const value = await task();
    const error = getError?.(value);
    if (error) {
      throw new Error(error);
    }
    if (isDone(value)) {
      return value;
    }
  }

  throw new Error(timeoutMessage);
}
