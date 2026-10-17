import { TARGET_LABEL, type PublishTargetId } from "./bridge/protocol";

export type PublishChoice = "wechat" | PublishTargetId;

const CHOICES: { id: PublishChoice; label: string }[] = [
  { id: "wechat", label: "公众号" },
  { id: "x", label: TARGET_LABEL.x },
  { id: "zhihu", label: TARGET_LABEL.zhihu },
  { id: "xhs", label: TARGET_LABEL.xhs },
];

/** One row at the top of every publish window: where this note goes. Picking another platform swaps the window. */
export function renderPlatformSwitch(parent: HTMLElement, current: PublishChoice, onPick: (choice: PublishChoice) => void): HTMLElement {
  const row = parent.createDiv({ cls: "qiaomu-platform-switch", attr: { role: "group" } });
  row.createSpan({ cls: "qiaomu-platform-switch-label", text: "发到" });
  for (const choice of CHOICES) {
    const button = row.createEl("button", { cls: "qiaomu-platform-chip", text: choice.label, attr: { type: "button", "aria-pressed": String(choice.id === current) } });
    if (choice.id === current) button.addClass("is-active");
    else button.addEventListener("click", () => onPick(choice.id));
  }
  return row;
}
