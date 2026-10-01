import { ErrorResponse } from "@bitwarden/common/models/response/error.response";

import { isRateLimitError, retryOnRateLimit } from "./retry-on-rate-limit";

describe("retryOnRateLimit", () => {
  const rateLimited = () => new ErrorResponse(null, 429);
  let sleep: jest.Mock<Promise<void>, [number]>;

  beforeEach(() => {
    sleep = jest.fn().mockResolvedValue(undefined);
  });

  it("returns the result without waiting when the first attempt succeeds", async () => {
    const request = jest.fn().mockResolvedValue("ok");

    await expect(retryOnRateLimit(request, { maxRetries: 5, sleep })).resolves.toBe("ok");

    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries 429s with backoff and returns once a retry succeeds", async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValue("ok");

    await expect(retryOnRateLimit(request, { maxRetries: 5, sleep })).resolves.toBe("ok");

    expect(request).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 4000, 8000]);
  });

  it("waits for Retry-After instead of the backoff when it's available", async () => {
    const request = jest.fn().mockRejectedValueOnce(rateLimited()).mockResolvedValue("ok");

    await retryOnRateLimit(request, { maxRetries: 5, sleep, retryAfterMs: () => 1234 });

    expect(sleep).toHaveBeenCalledWith(1234);
  });

  it("falls back to the backoff when Retry-After isn't available", async () => {
    const request = jest.fn().mockRejectedValueOnce(rateLimited()).mockResolvedValue("ok");

    await retryOnRateLimit(request, { maxRetries: 5, sleep, retryAfterMs: () => undefined });

    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("gives up after 5 retries and rethrows the 429", async () => {
    const error = rateLimited();
    const request = jest.fn().mockRejectedValue(error);

    await expect(retryOnRateLimit(request, { maxRetries: 5, sleep })).rejects.toBe(error);

    expect(request).toHaveBeenCalledTimes(6);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 4000, 8000, 16000, 30000]);
  });

  it("repeats the last backoff when there are more retries than backoff entries", async () => {
    const request = jest.fn().mockRejectedValue(rateLimited());

    await expect(
      retryOnRateLimit(request, { maxRetries: 3, sleep, backoffMs: [10, 20] }),
    ).rejects.toBeInstanceOf(ErrorResponse);

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([10, 20, 20]);
  });

  it.each([
    ["a 400", new ErrorResponse(null, 400)],
    ["a 500", new ErrorResponse(null, 500)],
    ["a non-HTTP error", new Error("network")],
  ])("never retries %s", async (_, error) => {
    const request = jest.fn().mockRejectedValue(error);

    await expect(retryOnRateLimit(request, { maxRetries: 5, sleep })).rejects.toBe(error);

    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("isRateLimitError", () => {
  it("is true only for a 429 ErrorResponse", () => {
    expect(isRateLimitError(new ErrorResponse(null, 429))).toBe(true);
    expect(isRateLimitError(new ErrorResponse(null, 400))).toBe(false);
    expect(isRateLimitError({ statusCode: 429 })).toBe(false);
  });
});
