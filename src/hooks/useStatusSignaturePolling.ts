"use client";

import { useEffect, useRef } from "react";
import { useConditionalPolling } from "@/hooks/useConditionalPolling";

type SignatureDecision =
  | boolean
  | void
  | {
      shouldContinue?: boolean;
      nextDelayMs?: number;
      resetAttempts?: boolean;
    };

export function useStatusSignaturePolling<TSnapshot>({
  enabled,
  initialSignature = null,
  getDelayMs,
  fetchSnapshot,
  getSignature,
  evaluate,
  maxAttempts,
  resumeImmediately = true,
  continueOnError = true,
}: {
  enabled: boolean;
  initialSignature?: string | null;
  getDelayMs: (ctx: { attempt: number }) => number;
  fetchSnapshot: (ctx: { attempt: number }) => Promise<TSnapshot | null>;
  getSignature: (snapshot: TSnapshot) => string;
  evaluate?: (
    snapshot: TSnapshot,
    ctx: {
      attempt: number;
      signature: string;
      previousSignature: string | null;
      signatureChanged: boolean;
      isInitial: boolean;
    }
  ) => SignatureDecision;
  maxAttempts?: number;
  resumeImmediately?: boolean;
  continueOnError?: boolean;
}) {
  const signatureRef = useRef<string | null>(initialSignature);

  useEffect(() => {
    signatureRef.current = initialSignature;
  }, [initialSignature]);

  useConditionalPolling({
    enabled,
    getDelayMs,
    maxAttempts,
    resumeImmediately,
    poll: async ({ attempt }) => {
      try {
        const snapshot = await fetchSnapshot({ attempt });
        if (!snapshot) return continueOnError;

        const signature = getSignature(snapshot);
        const previousSignature = signatureRef.current;
        const isInitial = previousSignature === null;
        const signatureChanged = !isInitial && previousSignature !== signature;
        signatureRef.current = signature;

        const decision = evaluate?.(snapshot, {
          attempt,
          signature,
          previousSignature,
          signatureChanged,
          isInitial,
        });

        if (typeof decision === "object" && decision !== null) {
          return {
            shouldContinue: decision.shouldContinue !== false,
            nextDelayMs: decision.nextDelayMs,
            resetAttempts: decision.resetAttempts ?? signatureChanged,
          };
        }

        return {
          shouldContinue: decision !== false,
          resetAttempts: signatureChanged,
        };
      } catch {
        return continueOnError;
      }
    },
  });
}
