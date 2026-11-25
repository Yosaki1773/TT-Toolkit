import { describe, expect, it, vi } from 'vitest';
import { createDetailForm } from '../src/features/world-info-editor/detail-form.js';
import { createNewEntry } from '../src/features/world-info-editor/schema.js';

function createEditor() {
    const target = document.createElement('div');
    const runtime = { state: { currentDraft: createNewEntry(1) }, revision: 0 };
    const render = () => target.replaceChildren(renderForm(runtime.state.currentDraft));
    const renderForm = createDetailForm({
        runtime,
        view: { mobileTab: 'basic', accordionOpen: false },
        render,
        saveManually: vi.fn(),
        scheduleScroll: vi.fn(),
        renderTagEditor: () => document.createElement('div'),
        run: vi.fn(),
    });
    render();
    return { target, runtime, render };
}

describe('WorldInfoEditor detail form textarea sizing', () => {
    it('preserves the latest manually resized height through redraws and entry changes without fixing the width', () => {
        const { target, runtime, render } = createEditor();
        const original = target.querySelector('.wie-textarea');
        // 原生拖拽调整会写入内联尺寸；DOM 测试用同样的样式变化模拟。
        original.style.height = '420px';
        original.style.width = '520px';
        target.querySelector('.wie-accordion-btn').click();

        const redrawn = target.querySelector('.wie-textarea');
        expect(redrawn).not.toBe(original);
        expect(redrawn.style.height).toBe('420px');
        expect(redrawn.style.width).toBe('');

        runtime.state.currentDraft = { ...createNewEntry(2), content: '另一条目的正文' };
        render();
        const next = target.querySelector('.wie-textarea');
        expect(next.value).toBe('另一条目的正文');
        expect(next.style.height).toBe('420px');

        next.style.height = '260px';
        render();
        render();
        expect(target.querySelector('.wie-textarea').style.height).toBe('260px');
    });

    it('leaves the CSS default height intact until resized and keeps independent editor instances separate', () => {
        const first = createEditor();
        expect(first.target.querySelector('.wie-textarea').style.height).toBe('');
        first.render();
        expect(first.target.querySelector('.wie-textarea').style.height).toBe('');
        first.target.querySelector('.wie-textarea').style.height = '420px';
        first.render();
        expect(first.target.querySelector('.wie-textarea').style.height).toBe('420px');

        const second = createEditor();
        expect(second.target.querySelector('.wie-textarea').style.height).toBe('');
    });
});
