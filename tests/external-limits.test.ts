import { describe, expect, it } from "vitest";
import { checkX, checkXhs, normalizeTopics, xhsBodyLength } from "../src/external/limits";

describe("platform limits", () => {
  it("counts topics inside the Xiaohongshu body limit", () => {
    expect(xhsBodyLength("你好", ["写作", "Obsidian"])).toBe(2 + (2 + 2) + (8 + 2));
  });

  it("blocks long titles and bodies and too many cards", () => {
    const checks = checkXhs({ title: "一".repeat(21), text: "字".repeat(1001), topics: [], cards: 19 });
    expect(checks.filter((check) => check.level === "error")).toHaveLength(3);
    expect(checkXhs({ title: "短标题", text: "正文", topics: ["话题"], cards: 6 })).toEqual([]);
  });

  it("cleans topics from tags", () => {
    expect(normalizeTopics(["#写作", "写作", "工具/Obsidian", " a b "], 3)).toEqual(["写作", "Obsidian", "ab"]);
  });

  it("warns when X has no title and blocks too many pictures", () => {
    expect(checkX({ title: "", media: 3 })[0]?.level).toBe("warning");
    expect(checkX({ title: "t", media: 26 })[0]?.level).toBe("error");
  });
});

import { truncateText, xhsTextBudget } from "../src/external/limits";

describe("Xiaohongshu copy limit", () => {
  it("leaves the body what the topics do not use", () => {
    expect(xhsTextBudget([])).toBe(1000);
    expect(xhsTextBudget(["写作", "Obsidian"])).toBe(1000 - 4 - 10);
  });

  it("keeps short text and cuts long text at a sentence end", () => {
    expect(truncateText("很短。", 1000)).toEqual({ text: "很短。", truncated: false });
    const long = `${"句子一二三四五。".repeat(200)}`;
    const cut = truncateText(long, 100);
    expect(cut.truncated).toBe(true);
    expect(Array.from(cut.text).length).toBeLessThanOrEqual(100);
    expect(cut.text.endsWith("。")).toBe(true);
  });

  it("marks a mid-sentence cut with an ellipsis and stays inside the limit", () => {
    const cut = truncateText("无标点".repeat(100), 50);
    expect(cut.text.endsWith("…")).toBe(true);
    expect(Array.from(cut.text).length).toBeLessThanOrEqual(50);
  });

  it("needs at least one card", () => {
    expect(checkXhs({ title: "标题", text: "正文", topics: [], cards: 0 }).some((check) => check.level === "error")).toBe(true);
  });
});
