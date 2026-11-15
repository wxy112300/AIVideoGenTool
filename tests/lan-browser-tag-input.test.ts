// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { tagInput } from "../src/web/tag-input";

afterEach(() => document.body.replaceChildren());

it("keeps Chinese candidate confirmation in the editor until a separate Enter adds the tag", () => {
  const root = document.createElement("div"); document.body.append(root);
  const tags = tagInput(root, ["existing"], []);
  const input = root.querySelector("input")!;
  input.value = "夜景";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
  expect(input.value).toBe("夜景"); expect(root.querySelectorAll(".tag-token")).toHaveLength(1);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true }));
  expect(input.value).toBe("夜景"); expect(root.querySelectorAll(".tag-token")).toHaveLength(1);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(input.value).toBe(""); expect(tags.values()).toEqual(["existing", "夜景"]);
});

it("does not remove an existing tag during composition, but retains ordinary Backspace removal", () => {
  const root = document.createElement("div"); document.body.append(root);
  const tags = tagInput(root, ["existing"], []);
  const input = root.querySelector("input")!;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", isComposing: true }));
  expect(tags.values()).toEqual(["existing"]);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
  expect(tags.values()).toEqual([]);
});
