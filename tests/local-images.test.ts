// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const host = vi.hoisted(() => ({ html: "", files: [] as Array<{path: string; name: string}>, embeds: [] as Array<{link: string}>, resolve: (_link: string, _source: string): unknown => null }));
vi.mock("obsidian", () => ({
  TFile: class { constructor(public path: string) {} get name() { return this.path.split("/").pop()!; } },
  getLinkpath: (link: string) => link.split("#")[0],
  MarkdownRenderer: { render: async (_app: unknown, _md: string, root: HTMLElement) => { root.innerHTML = host.html; } },
}));
import { TFile } from "obsidian";
import { renderNoteForWechat } from "../src/render-note";
import { publishDraft, preflight, type DraftMeta } from "../src/publisher";
import { embedWechatImages } from "../src/copy-html";
import { finalizeWechatImages } from "../src/export-html";

const file = (path: string) => new (TFile as unknown as new (path: string) => TFile)(path);
const resource = (f: {path: string}) => `app://vault/QA/${encodeURI(f.path)}?123`;
function app() { return {vault: {cachedRead: async () => "text",getResourcePath:resource,getFiles:()=>host.files,readBinary:vi.fn(async()=>new TextEncoder().encode("image").buffer)},metadataCache:{getFileCache:()=>({embeds:host.embeds}),getFirstLinkpathDest:(l:string,s:string)=>host.resolve(l,s)}}; }
const meta: DraftMeta={accountId:"qa",title:"Article",author:"",digest:"",sourceUrl:"",cover:"",coverText:"",openComment:false};
beforeEach(()=>{
  host.html="";host.files=[];host.embeds=[];host.resolve=()=>null;
  Object.defineProperty(HTMLElement.prototype,"createDiv",{configurable:true,value:function(){const e=document.createElement("div");this.append(e);return e;}});
  Object.defineProperty(HTMLElement.prototype,"setCssStyles",{configurable:true,value:function(styles:Record<string,string>){Object.assign(this.style,styles);}});
});
afterEach(()=>vi.restoreAllMocks());

// These DOM shapes were captured from Obsidian 1.13.7, including missing cache entries.
describe("local image identity",()=>{
  it.each(["reference","html","file-url"])("resolves a %s image from its actual resource URL without embeds metadata",async()=>{
    const image=file("文章/附件/中文 配图.png");host.files=[image];host.html=`<p><img alt="中文" src="${resource(image)}"></p>`;
    const note=await renderNoteForWechat(app() as never,file("文章/note.md"),{} as never);
    expect(note.images).toMatchObject([{kind:"vault",file:{path:image.path}}]);expect(note.html).toContain("<img");expect(note.warnings).toEqual([]);
  });
  it("uses the nested note's actual resource instead of an outer same-name attachment",async()=>{
    const outer=file("文章/附件/同名.png"),inner=file("子笔记/附件/同名.png");host.files=[outer,inner];host.resolve=()=>outer;
    host.html=`<span class="internal-embed image-embed is-loaded" src="附件/同名.png"><img src="${resource(inner)}"></span>`;
    const note=await renderNoteForWechat(app() as never,file("文章/note.md"),{} as never);
    expect(note.images).toMatchObject([{kind:"vault",file:{path:inner.path}}]);
  });
  it("keeps ordinary embeds on the cheap path without enumerating the vault",async()=>{
    const image=file("附件/a.png");host.resolve=()=>image;host.html=`<span class="internal-embed image-embed is-loaded" src="a.png"><img src="${resource(image)}"></span>`;
    const a=app();a.vault.getFiles=()=>{throw Error("unnecessary vault scan")};
    expect((await renderNoteForWechat(a as never,file("note.md"),{} as never)).images).toHaveLength(1);
  });
  it("does not create a partial draft when a local rendered image cannot be resolved",async()=>{
    const good=file("good.png");host.files=[good];
    host.html=`<p>Article</p><img src="${resource(good)}"><img alt="missing" src="app://vault/not-in-vault.png">`;
    const a=app(),f=file("note.md"),note=await renderNoteForWechat(a as never,f,{} as never);
    const client={uploadImage:vi.fn(async()=>({url:"https://mmbiz.qpic.cn/ok/0",media_id:"cover"})),createDraft:vi.fn(async()=>({media_id:"draft"}))};
    await expect(publishDraft({app:a as never,client:client as never,note,file:f,meta,wechatHtml:note.html})).rejects.toThrow(/图片/);
    expect(client.uploadImage).not.toHaveBeenCalled();expect(client.createDraft).not.toHaveBeenCalled();
  });
  it("marks a missing wikilink as a blocking error even if the host rendered no img",async()=>{
    host.html='<span class="internal-embed image-embed" src="不存在.png"></span>';
    const note=await renderNoteForWechat(app() as never,file("note.md"),{} as never);
    expect(preflight(meta,note.html,true,note.warnings,note.imageErrors)).toContainEqual(expect.objectContaining({level:"error",message:expect.stringContaining("不存在.png")}));
    await expect(embedWechatImages(app() as never,note.html,note.images,false,note.imageErrors)).rejects.toThrow("不存在.png");
  });
  it("blocks copying unknown local image sources instead of writing broken HTML",async()=>{
    await expect(embedWechatImages(app() as never,'<img src="file:///outside-vault.png">',[])).rejects.toThrow(/图片/);
  });
  it("rejects unresolved image markers at finalization",()=>{
    expect(()=>finalizeWechatImages('<img src="app://vault/missing.png" data-qm-image="missing">',new Map())).toThrow(/图片/);
  });
  it("uploads duplicate local images once and replaces every occurrence",async()=>{
    const image=file("a.png");const a=app();host.resolve=()=>image;
    const uploadImage=vi.fn(async(_account:string,kind:string)=>kind==='content'?{url:'https://mmbiz.qpic.cn/shared/0'}:{media_id:'cover'});
    const createDraft=vi.fn(async()=>({media_id:'draft'}));
    const note={title:'Article',html:'',images:[{id:'a',kind:'vault' as const,name:'a.png',file:image},{id:'b',kind:'vault' as const,name:'a.png',file:image}],warnings:[],frontmatter:{},dispose(){}};
    await publishDraft({app:a as never,client:{uploadImage,createDraft} as never,note,file:file('note.md'),meta,wechatHtml:'<img src="app://a" data-qm-image="a"><img src="app://a" data-qm-image="b">'});
    expect(uploadImage.mock.calls.filter(c=>c[1]==='content')).toHaveLength(1);
    expect(JSON.stringify(createDraft.mock.calls)).toContain('shared/0');
  });
});
