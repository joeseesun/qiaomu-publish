const names = new WeakMap<HTMLElement, HTMLElement>();
let counter = 0;

/**
 * Names a control without the plain ARIA label attribute: Obsidian turns that attribute into its own hover
 * tooltip, which covered the preview. A visually hidden label referenced by id gives assistive tech the same name.
 */
export function setName(el: HTMLElement, name: string): void {
  let label = names.get(el);
  if (label && !label.parentNode) {
    if (/^(input|select|textarea)$/i.test(el.tagName)) el.before(label);
    else el.append(label);
  }
  if (!label) {
    label = el.ownerDocument.createElement("span");
    label.className = "qiaomu-wechat-sr-only";
    label.id = `qiaomu-name-${++counter}`;
    if (/^(input|select|textarea)$/i.test(el.tagName)) el.before(label);
    else el.append(label);
    el.setAttribute("aria-labelledby", label.id);
    names.set(el, label);
  }
  label.textContent = name;
}
