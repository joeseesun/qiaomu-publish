// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
vi.mock('obsidian', () => ({ Component: class {}, Modal: class {}, Notice: class {}, Setting: class {}, setIcon() {}, TFile: class {}, getLinkpath: (s: string) => s }));
import { ExternalPublishModal } from '../src/external-publish-modal';

function el(tag = 'div', opts: any = {}): any {
 const node: any = document.createElement(tag);
 node.textContent = opts.text ?? ''; node.className = opts.cls ?? '';
 node.createEl = (tag: string, opts: any) => node.appendChild(el(tag, opts));
 node.createDiv = (opts: any) => node.createEl('div', opts);
 node.createSpan = (opts: any) => node.createEl('span', opts);
 node.addClass = (cls: string) => node.classList.add(cls);
 node.removeClass = (cls: string) => node.classList.remove(cls);
 for (const [key, value] of Object.entries(opts.attr ?? {})) node.setAttribute(key, value);
 return node;
}
it('keeps Markdown images when editing a Weibo article and when restoring its original text', async () => {
 const original = 'Before\n![[photo.png]]\n![chart](chart.png)\nAfter';
 const view: any = Object.assign(Object.create(ExternalPublishModal.prototype), {
  target: 'weibo-article', markdown: null, app: { vault: { cachedRead: async () => original } },
  file: {}, statusEl: { setText() {} }, publishButton: {}, discardBase: vi.fn(), schedule: vi.fn(), markdownTimer: null,
 });
 const form = el(); view.renderMarkdown(form); await Promise.resolve();
 expect(view.markdownArea.value).toBe(original);
 view.markdownArea.value += '\nOne more line';
 view.markdownArea.dispatchEvent(new Event('input'));
 expect(view.markdown).toContain('![[photo.png]]');
 expect(view.markdown).toContain('![chart](chart.png)');
 window.clearTimeout(view.markdownTimer);
 form.querySelector('button').click(); await Promise.resolve();
 expect(view.markdownArea.value).toBe(original);
});

it('a text-only selection does not attach unrelated images from the rest of the note', () => {
 const view: any = Object.assign(Object.create(ExternalPublishModal.prototype), {
  weiboSelection: 'Only this paragraph', weiboTextEdited: false, weiboTopicsEdited: false, weiboCopyAdopted: false,
  textArea: {}, renderWeiboTopics() {}, enforceWeiboPostLimit() {},
 });
 view.adoptWeiboPostCopy({ note: { frontmatter: {}, images: [{ id: 'private', name: 'private.png' }] }, plainText: 'Full note' });
 expect(view.weiboText).toBe('Only this paragraph');
 expect(view.weiboImageIds).toEqual([]);
});
