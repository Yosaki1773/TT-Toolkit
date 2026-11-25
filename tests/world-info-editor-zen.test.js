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
