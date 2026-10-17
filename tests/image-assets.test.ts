// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/rasterize", () => ({ svgToPng: vi.fn(async () => ({blob: new Blob([new Uint8Array([137,80,78,71])], {type:"image/png"}),width:100,height:50})) }));
import { prepareLocalSvg, readArticleImage } from "../src/image-assets";
import { svgToPng } from "../src/rasterize";

describe("local SVG conversion", () => {
  it("preserves local gradients and sizes a viewBox-only SVG", () => {
    const result=prepareLocalSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" style="fill:red"><defs><linearGradient id="paint"/></defs><rect width="100" height="50" fill="url(#paint)"/></svg>');
    expect(result).toMatchObject({width:100,height:50});
    expect(result.svg).toContain('url(#paint)');expect(result.svg).toContain('style="fill:red"');
  });
  it.each([
    '<script>alert(1)</script>',
    '<image href="https://example.com/a.png"/>',
    '<style>@import "https://example.com/a.css";</style>',
    '<rect fill="url(https://example.com/a.svg#paint)"/>',
    '<foreignObject><div>HTML</div></foreignObject>',
    '<rect onclick="alert(1)"/>',
  ])("rejects nonlocal or dynamic SVG content: %s", content => {
    expect(()=>prepareLocalSvg(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`)).toThrow(/SVG/);
  });
  it("converts an SVG attachment to PNG bytes and a matching name/type", async () => {
    const input='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>';
    const result=await readArticleImage({vault:{readBinary:async()=>new TextEncoder().encode(input).buffer}} as never,{id:"svg",kind:"vault",name:"中文.SVG",file:{name:"中文.SVG",path:"附件/中文.SVG"} as never});
    expect(result.type).toBe("image/png");expect(result.name).toBe("中文.png");
    expect([...new Uint8Array(result.data)]).toEqual([137,80,78,71]);
    expect(svgToPng).toHaveBeenCalledWith(expect.stringContaining("<svg"),100,50,"");
  });
  it.each([0,20*1024*1024+1])("rejects invalid local byte length %s before encoding",async size=>{
    await expect(readArticleImage({vault:{readBinary:async()=>new ArrayBuffer(size)}} as never,{id:"bad",kind:"vault",name:"bad.png",file:{name:"bad.png"} as never})).rejects.toThrow(/图片为空或超过/);
  });
});
