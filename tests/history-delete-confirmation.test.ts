import { describe, expect, it } from "vitest";
import { historyDeleteConfirmationMessage, historyDeleteImpactFromError } from "../src/core/history-delete-confirmation";

describe("History linked deletion transport", () => {
  it("round-trips Unicode and special characters through Electron's Error.message wrapper", () => {
    const impact = { referenceToken: "a".repeat(64), references: [{ id: "history:asset:version", label: '续写 <&> " # % · clip.mp4' }] };
    expect(historyDeleteImpactFromError(new Error(`Error invoking remote method 'history:delete': Error: ${historyDeleteConfirmationMessage(impact)}`))).toEqual(impact);
  });
  it.each(["ordinary unlink failure", "HISTORY_DELETE_CONFIRMATION_REQUIRED:%ZZ", 'HISTORY_DELETE_CONFIRMATION_REQUIRED:%7B%7D'])("does not turn %s into an approval request", message => {
    expect(historyDeleteImpactFromError(new Error(message))).toBeNull();
  });
});
