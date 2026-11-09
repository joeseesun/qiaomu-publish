import { describe, expect, it } from "vitest";
import { checkWeiboArticle, checkWeiboPost, checkX, checkXhs, normalizeTopics, xhsBodyLength } from "../src/external/limits";

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

describe("Weibo headline article limits", () => {
  it("passes a short title and no summary", () => {
    expect(checkWeiboArticle({ title: "短标题" })).toEqual([]);
  });

  it("blocks a missing title", () => {
    expect(checkWeiboArticle({ title: "" })[0]?.level).toBe("error");
  });

  it("blocks a title over 32 characters", () => {
    const long = "字".repeat(33);
    expect(checkWeiboArticle({ title: long })[0]?.level).toBe("error");
  });

  it("accepts a title exactly 32 characters", () => {
    expect(checkWeiboArticle({ title: "字".repeat(32) })).toEqual([]);
  });

  it("blocks a summary over 44 characters", () => {
    const long = "字".repeat(45);
    expect(checkWeiboArticle({ title: "标题", summary: long })[0]?.level).toBe("error");
  });

  it("accepts a summary exactly 44 characters", () => {
    expect(checkWeiboArticle({ title: "标题", summary: "字".repeat(44) })).toEqual([]);
  });

  it("skips summary check when summary is absent", () => {
    expect(checkWeiboArticle({ title: "标题" })).toEqual([]);
  });
});

describe("Weibo regular post limits", () => {
  it("passes text and images", () => {
    expect(checkWeiboPost({ text: "短正文", topics: [], images: 3 })).toEqual([]);
  });

  it("blocks empty text and no images", () => {
    expect(checkWeiboPost({ text: "", topics: [], images: 0 })[0]?.level).toBe("error");
  });

  it("counts topics toward the 2000-char limit", () => {
    const text = "字".repeat(1990);
    const topics = ["话题"];
    // 1990 + (2 + 2) = 1994, under 2000
    expect(checkWeiboPost({ text, topics, images: 0 })).toEqual([]);
  });

  it("blocks text plus topics over 2000 chars", () => {
    const text = "字".repeat(2000);
    const topics = ["话题"];
    // 2000 + 4 = 2004, over 2000
    expect(checkWeiboPost({ text, topics, images: 0 })[0]?.level).toBe("error");
  });

  it("blocks more than 9 images", () => {
    expect(checkWeiboPost({ text: "正文", topics: [], images: 10 })[0]?.level).toBe("error");
  });

  it("accepts exactly 9 images", () => {
    expect(checkWeiboPost({ text: "正文", topics: [], images: 9 })).toEqual([]);
  });
});

it('counts exactly the text sent by the Clipper Weibo composer', () => {
  const text = 'a'.repeat(1992), topics = ['one', 'two'];
  const composed = `${text.trim()}\n${topics.map(topic => `#${topic}#`).join(' ')}`;
  expect(composed.length).toBeGreaterThan(2000);
  expect(checkWeiboPost({ text, topics, images: 0 }).some(check => check.level === 'error')).toBe(true);
  expect(checkWeiboPost({ text: 'a'.repeat(1990), topics: ['abcdefgh'], images: 0 }).some(check => check.level === 'error')).toBe(true);
});
