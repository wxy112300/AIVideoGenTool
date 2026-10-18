import { historyTagKey, normalizeHistoryTags } from "../core/history-filter";
import { escape, icon, renderIcons, text } from "./ui";

export function tagInput(root: HTMLElement, initial: string[], suggestions: string[]): { values(): string[] } {
  let tags = normalizeHistoryTags(initial);
  root.innerHTML = `<div class="tag-tokens"></div><input class="tag-entry" maxlength="80" aria-label="${escape(text("tags"))}" placeholder="${escape(text("tagInput"))}" autocomplete="off"><div class="tag-suggestions" aria-label="${escape(text("suggestions"))}"></div>`;
  const tokens = root.querySelector<HTMLElement>(".tag-tokens")!;
  const input = root.querySelector<HTMLInputElement>("input")!;
  const choices = root.querySelector<HTMLElement>(".tag-suggestions")!;
  const add = (value: string) => {
    tags = normalizeHistoryTags([...tags, value]).slice(0, 64);
    input.value = ""; render();
  };
  const renderChoices = () => {
    const query = historyTagKey(input.value);
    choices.replaceChildren(...suggestions.filter((value) => !tags.some((tag) => historyTagKey(tag) === historyTagKey(value)) && historyTagKey(value).includes(query)).slice(0, 10).map((value) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = value;
      button.addEventListener("click", () => { add(value); input.focus(); }); return button;
    }));
  };
  const render = () => {
    tokens.innerHTML = tags.map((tag, index) => `<button type="button" class="tag-token" data-remove="${index}" aria-label="${escape(`${text("remove")} ${tag}`)}">${escape(tag)}${icon("x")}</button>`).join("");
    tokens.querySelectorAll<HTMLButtonElement>("button").forEach((button) => button.addEventListener("click", () => {
      tags.splice(Number(button.dataset.remove), 1); render(); input.focus();
    }));
    renderIcons(tokens); renderChoices();
  };
  input.addEventListener("input", renderChoices);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); if (input.value.trim()) add(input.value); }
    if (event.key === "Backspace" && !input.value && tags.length) { tags.pop(); render(); }
  });
  render();
  return { values: () => normalizeHistoryTags([...tags, ...(input.value.trim() ? [input.value] : [])]) };
}
