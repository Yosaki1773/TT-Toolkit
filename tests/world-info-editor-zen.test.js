import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWorldInfoEditorPage } from '../src/features/world-info-editor/WorldInfoEditorPage.js';
import { WorldInfoEditorRuntime } from '../src/features/world-info-editor/runtime.js';
import { createNewEntry } from '../src/features/world-info-editor/schema.js';

const cleanups = [];
afterEach(() => {
    cleanups.splice(0).forEach(dispose => dispose());
    document.querySelector('dialog.ttk-confirm')?.remove();
});

async function openEditor(count = 3) {
    const store = { entries: {
        1: { ...createNewEntry(1, '圣殿骑士'), content: '骑士团的誓言', key: ['誓约'], constant: true },
        2: { ...createNewEntry(2, '皇家图书馆'), content: '图书馆的藏书', disable: true },
        3: { ...createNewEntry(3, '深渊之门'), content: '门后的世界', position: 4 },
    } };
    for (let uid = 4; uid <= count; uid++) store.entries[uid] = createNewEntry(uid, `条目 ${uid}`);
    const host = {
        listWorldInfoNames: () => ['Lore'],
        activeWorldInfoBindings: () => [],
        loadWorldInfoFresh: vi.fn(async () => structuredClone(store)),
        saveWorldInfo: vi.fn(async (name, data) => { store.entries = structuredClone(data.entries); }),
        globalGet: vi.fn(async () => undefined),
        globalSet: vi.fn(async () => undefined),
        globalDelete: vi.fn(async () => undefined),
    };
    const target = document.body.appendChild(document.createElement('div'));
    const runtime = new WorldInfoEditorRuntime(host);
    const unmount = mountWorldInfoEditorPage(target, { runtime, enabled: true, setEnabled: vi.fn() });
    cleanups.push(() => { unmount(); target.remove(); });
    await vi.waitFor(() => expect(target.querySelectorAll('.wie-card')).toHaveLength(count));
    [...target.querySelectorAll('button')].find(button => button.textContent.includes('全屏写作')).click();
    return { target, runtime, host, store, zen: () => target.querySelector('.wie-zen-overlay') };
}

const row = (zen, uid) => zen.querySelector(`.wie-zen-entry[data-uid="${uid}"]`);
const chip = (zen, label) => [...zen.querySelectorAll('.wie-chip')].find(button => button.textContent === label);

describe('fullscreen world info directory', () => {
    it('shows only entry titles and enabled states, and switches the right-hand content without leaving fullscreen', async () => {
        const { zen, runtime } = await openEditor();
        expect(zen().querySelectorAll('.wie-zen-entry')).toHaveLength(3);
        expect(row(zen(), 1).textContent).toBe('圣殿骑士已启用');
        expect(row(zen(), 2).textContent).toBe('皇家图书馆已禁用');
        expect(row(zen(), 1).getAttribute('aria-current')).toBe('true');
        expect(zen().querySelector('.wie-card-keys')).toBeNull();
        expect(zen().querySelector('.wie-zen-textarea').value).toBe('骑士团的誓言');
        row(zen(), 2).focus();
        row(zen(), 2).click();
        await vi.waitFor(() => expect(zen().querySelector('.wie-zen-textarea').value).toBe('图书馆的藏书'));
        expect(runtime.state.selectedUid).toBe(2);
        expect(row(zen(), 2).getAttribute('aria-current')).toBe('true');
    });

    it('shares search and all filters with management, keeping the search input and editor intact while filtering', async () => {
        const { target, zen, runtime } = await openEditor();
        expect(target.querySelectorAll('.wie-search-box input')).toHaveLength(2);
        expect(target.querySelector('.wie-search-icon')).toBeNull();
        const search = zen().querySelector('.wie-search-box input');
        const textarea = zen().querySelector('.wie-zen-textarea');
        textarea.setSelectionRange(1, 3);
        search.focus();
        search.value = '誓约';
        search.dispatchEvent(new Event('input'));
        expect(zen().querySelectorAll('.wie-zen-entry')).toHaveLength(1);
        expect(runtime.state.searchQuery).toBe('誓约');
        expect(zen().querySelector('.wie-search-box input')).toBe(search);
        expect(document.activeElement).toBe(search);
        zen().querySelector('.wie-search-clear').click();
        expect(search.value).toBe('');
        expect(zen().querySelectorAll('.wie-zen-entry')).toHaveLength(3);
        for (const [label, uids] of [['常驻', ['1']], ['已禁用', ['2']], ['已启用', ['1', '3']], ['@深度', ['3']], ['含图片', []], ['全部', ['1', '2', '3']]]) {
            const button = chip(zen(), label);
            button.focus();
            button.click();
            expect([...zen().querySelectorAll('.wie-zen-entry')].map(item => item.dataset.uid)).toEqual(uids);
            expect(chip(zen(), label).classList.contains('active')).toBe(true);
            expect(zen().querySelector('.wie-zen-textarea')).toBe(textarea);
            expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([1, 3]);
        }
        search.focus();
        search.value = '图书馆';
        search.dispatchEvent(new Event('input'));
        chip(zen(), '已禁用').click();
        [...zen().querySelectorAll('.wie-zen-header button')].find(button => button.textContent === '完成').click();
        expect(target.querySelector('.wie-search-box input').value).toBe('图书馆');
        expect(target.querySelector('.wie-chip.active').textContent).toBe('已禁用');
        expect(target.querySelectorAll('.wie-card')).toHaveLength(1);
    });

    it('sorts both sidebars by descending estimated tokens without writing entry order, and restores the default order', async () => {
        const { target, zen, runtime, host, store } = await openEditor();
        store.entries[1].content = '短';
        store.entries[2].content = '长正文'.repeat(100);
        store.entries[3].content = '中正文'.repeat(30);
        await runtime.refreshWorlds();
        const textarea = zen().querySelector('.wie-zen-textarea');
        textarea.setSelectionRange(0, 1);
        const sort = zen().querySelector('.wie-sort-select');
        expect(sort).not.toBeNull();
        sort.focus();
        sort.value = 'tokens';
        sort.dispatchEvent(new Event('change'));
        expect(runtime.state.sort).toBe('tokens');
        expect([...zen().querySelectorAll('.wie-zen-entry')].map(item => item.dataset.uid)).toEqual(['2', '3', '1']);
        expect([...target.querySelectorAll('.wie-card')].map(item => item.dataset.uid)).toEqual(['2', '3', '1']);
        expect(runtime.state.selectedUid).toBe(1);
        expect(zen().querySelector('.wie-zen-textarea')).toBe(textarea);
        expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([0, 1]);
        expect(host.saveWorldInfo).not.toHaveBeenCalled();
        expect(Object.values(runtime.state.worldData.entries).map(entry => entry.order)).toEqual([100, 100, 100]);

        chip(zen(), '已启用').click();
        expect([...zen().querySelectorAll('.wie-zen-entry')].map(item => item.dataset.uid)).toEqual(['3', '1']);
        const search = zen().querySelector('.wie-search-box input');
        search.value = '圣殿';
        search.dispatchEvent(new Event('input'));
        expect(zen().querySelectorAll('.wie-zen-entry')).toHaveLength(1);
        [...zen().querySelectorAll('.wie-zen-header button')].find(button => button.textContent === '完成').click();
        expect(target.querySelector('.wie-list-pane .wie-sort-select').value).toBe('tokens');
        target.querySelector('.wie-list-pane .wie-search-clear').click();
        [...target.querySelectorAll('.wie-list-pane .wie-chip')].find(button => button.textContent === '全部').click();
        const managementSort = target.querySelector('.wie-list-pane .wie-sort-select');
        managementSort.focus();
        managementSort.value = 'order';
        managementSort.dispatchEvent(new Event('change'));
        expect([...target.querySelectorAll('.wie-card')].map(item => item.dataset.uid)).toEqual(['1', '2', '3']);
        expect(host.saveWorldInfo).not.toHaveBeenCalled();
    });

    it('updates token sorting from runtime notifications without replacing a focused fullscreen editor', async () => {
        const { zen, runtime, store } = await openEditor();
        store.entries[3].content = '最长正文'.repeat(40);
        await runtime.refreshWorlds();
        const textarea = zen().querySelector('.wie-zen-textarea');
        textarea.focus();
        textarea.setSelectionRange(1, 3);
        runtime.setSort('tokens');
        expect(zen().querySelector('.wie-sort-select').value).toBe('tokens');
        expect(zen().querySelector('.wie-zen-entry').dataset.uid).toBe('3');
        expect(zen().querySelector('.wie-zen-textarea')).toBe(textarea);
        expect(document.activeElement).toBe(textarea);
        expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([1, 3]);
    });

    it('saves the edited body before selecting another directory entry', async () => {
        const { zen, host, store } = await openEditor();
        const textarea = zen().querySelector('.wie-zen-textarea');
        textarea.focus();
        textarea.value = '修改后的正文 user';
        textarea.dispatchEvent(new Event('input'));
        row(zen(), 2).focus();
        row(zen(), 2).click();
        await vi.waitFor(() => expect(zen().querySelector('.wie-zen-textarea').value).toBe('图书馆的藏书'));
        expect(host.saveWorldInfo).toHaveBeenCalledTimes(1);
        expect(store.entries[1].content).toBe('修改后的正文 user');
    });

    it('keeps the draft and selected entry when navigation saving fails and the discard prompt is cancelled', async () => {
        const { zen, host, runtime } = await openEditor();
        host.saveWorldInfo.mockRejectedValue(new Error('示例保存失败'));
        const textarea = zen().querySelector('.wie-zen-textarea');
        textarea.focus();
        textarea.value = '不可丢失的草稿';
        textarea.dispatchEvent(new Event('input'));
        row(zen(), 2).focus();
        row(zen(), 2).click();
        await vi.waitFor(() => expect(document.querySelector('dialog.ttk-confirm[open]')).not.toBeNull());
        document.querySelector('dialog.ttk-confirm button').click();
        await vi.waitFor(() => expect(zen().querySelector('.wie-zen-error')?.textContent).toContain('示例保存失败'));
        expect(runtime.state.selectedUid).toBe(1);
        expect(runtime.state.dirty).toBe(true);
        expect(zen().querySelector('.wie-zen-textarea').value).toBe('不可丢失的草稿');
    });

    it('preserves directory scroll through entry changes and subsequent save notifications', async () => {
        const { zen, runtime } = await openEditor(40);
        zen().querySelector('.wie-zen-entry-list').scrollTop = 1200;
        row(zen(), 35).focus();
        row(zen(), 35).click();
        await vi.waitFor(() => expect(runtime.state.selectedUid).toBe(35));
        expect(zen().querySelector('.wie-zen-entry-list').scrollTop).toBe(1200);
        runtime.notify();
        expect(zen().querySelector('.wie-zen-entry-list').scrollTop).toBe(1200);
    });

    it('reveals the current late entry when opening the mobile directory, without moving the editor or focus', async () => {
        const { zen, runtime } = await openEditor(40);
        await runtime.selectEntry(35);
        const list = zen().querySelector('.wie-zen-entry-list');
        const selected = row(zen(), 35);
        const textarea = zen().querySelector('.wie-zen-textarea');
        textarea.scrollTop = 70;
        textarea.setSelectionRange(0, 0);
        // happy-dom 不计算布局，模拟 300px 的目录视口与第 35 行的实际位置。
        vi.spyOn(list, 'getBoundingClientRect').mockImplementation(() => ({ top: 100, bottom: 400 }));
        vi.spyOn(selected, 'getBoundingClientRect').mockImplementation(() => ({
            top: 1732 - list.scrollTop, bottom: 1776 - list.scrollTop,
        }));
        const toggle = zen().querySelector('.wie-zen-directory-toggle');
        toggle.focus();
        toggle.click();
        expect(list.scrollTop).toBe(1376);
        expect(selected.getBoundingClientRect().bottom).toBe(400);
        expect(document.activeElement).toBe(toggle);
        expect(textarea.scrollTop).toBe(70);
        expect(zen().querySelector('.wie-zen-textarea')).toBe(textarea);
        // 上次位置位于当前条目下方时，也要向上带回当前行。
        list.scrollTop = 2000;
        toggle.click();
        toggle.click();
        expect(list.scrollTop).toBe(1632);
        expect(selected.getBoundingClientRect().top).toBe(100);
    });

    it('does not overwrite remembered directory scroll with zero during hidden redraws', async () => {
        const { target, zen, runtime } = await openEditor(40);
        const style = document.createElement('style');
        style.textContent = '.wie-zen-sidebar { display: none; } .wie-zen-directory-open .wie-zen-sidebar { display: flex; }';
        document.head.append(style);
        cleanups.push(() => style.remove());
        zen().querySelector('.wie-zen-directory-toggle').click();
        zen().querySelector('.wie-zen-entry-list').scrollTop = 1200;
        row(zen(), 35).click();
        await vi.waitFor(() => expect(runtime.state.selectedUid).toBe(35));
        expect(zen().querySelector('.wie-zen-directory-toggle').getAttribute('aria-expanded')).toBe('false');
        // 浏览器会把 display:none 下恢复的 scrollTop 钳制为 0；再触发一次页面重绘。
        zen().querySelector('.wie-zen-entry-list').scrollTop = 0;
        target.querySelector('.wie-accordion-btn').click();
        zen().querySelector('.wie-zen-directory-toggle').click();
        expect(zen().querySelector('.wie-zen-entry-list').scrollTop).toBe(1200);
    });

    it('keeps the remembered scroll if the active entry is already visible or filtered out', async () => {
        const { zen } = await openEditor(40);
        const list = zen().querySelector('.wie-zen-entry-list');
        vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 400 });
        vi.spyOn(row(zen(), 1), 'getBoundingClientRect').mockReturnValue({ top: 150, bottom: 194 });
        zen().querySelector('.wie-zen-directory-toggle').click();
        list.scrollTop = 180;
        zen().querySelector('.wie-zen-directory-toggle').click();
        list.scrollTop = 0;
        zen().querySelector('.wie-zen-directory-toggle').click();
        expect(list.scrollTop).toBe(180);
        const search = zen().querySelector('.wie-search-box input');
        search.value = '不存在的条目';
        search.dispatchEvent(new Event('input'));
        expect(list.querySelector('.active')).toBeNull();
        zen().querySelector('.wie-zen-directory-toggle').click();
        expect(() => zen().querySelector('.wie-zen-directory-toggle').click()).not.toThrow();
        expect(search.value).toBe('不存在的条目');
    });

    it('updates visible fullscreen save feedback without interrupting text input', async () => {
        const { zen, runtime } = await openEditor();
        const textarea = zen().querySelector('.wie-zen-textarea');
        textarea.focus();
        textarea.value = '写作中的正文';
        textarea.setSelectionRange(2, 4);
        textarea.dispatchEvent(new Event('input'));
        expect(zen().querySelector('.wie-zen-status').textContent).toContain('未保存修改');
        await runtime.saveCurrentDraft({ isAuto: true });
        expect(zen().querySelector('.wie-zen-status').textContent).toContain('已自动保存');
        expect(zen().querySelector('.wie-zen-textarea')).toBe(textarea);
        expect(document.activeElement).toBe(textarea);
        expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([2, 4]);
    });
});
