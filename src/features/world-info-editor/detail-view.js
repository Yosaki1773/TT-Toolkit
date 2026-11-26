import { actionButton, h } from '../../ui/dom.js';
import { confirmDanger } from '../../ui/confirm.js';
import { renderMacroBar } from './macro-bar.js';
import { renderSearchAndFilter } from './search-filter.js';

// 详情头部、窄容器保存条镜像与全屏写作浮层。
export function createDetailView({ runtime, view, target, render, runNavigating, saveManually, onListChange }) {
    let sidebarWorldData = null;
    let sidebarFilter = null;
    let sidebarSort = null;
    function statusLabel(state) {
        if (state.saveStatus === 'unsaved')
            return { text: '未保存修改', className: 'unsaved' };
        if (state.saveStatus === 'saving')
            return { text: '正在保存...', className: 'saving' };
        if (state.saveStatus === 'saved_auto')
            return { text: `已自动保存 (${state.lastSavedTime || '刚刚'})`, className: 'saved' };
        if (state.saveStatus === 'saved_manual')
            return {
                text: `已保存 (${state.lastSavedTime || '刚刚'})${state.lastConversionCount > 0 ? ` · 已转换 ${state.lastConversionCount} 处 user` : ''}`,
                className: 'saved',
            };
        if (state.saveStatus === 'error')
            return { text: '保存失败', className: 'error' };
        return { text: '已同步', className: 'saved' };
    }

    // 窄容器下详情头部被隐藏，把保存状态镜像到窄容器顶部栏，保证手机上也能看到并发起保存。
    function syncMobileSaveChip(statusEl) {
        const chip = target.querySelector('.wie-mobile-save');
        if (!chip)
            return;
        const source = statusEl ?? target.querySelector('.wie-status-indicator');
        const label = chip.querySelector('.wie-mobile-save-label');
        if (label && source) label.textContent = source.lastElementChild?.textContent ?? '';
        chip.title = source?.title ?? '';
        chip.className = `wie-mobile-save${source?.classList.contains('wie-status-action') ? ' wie-status-action' : ''}`;
    }

    function renderDetailHeader(draft) {
        const state = runtime.state;
        const { text: statusText, className: statusClass } = statusLabel(state);

        const statusEl = h('span', { className: `wie-status-indicator ${statusClass}`, attrs: { role: 'status' } },
            h('span', { text: '●' }),
            h('span', { text: statusText }),
        );
        // 自动保存与手动保存的结果不同（手动保存会按设置转换 user 宏）；
        // 状态可点：未保存或失败时直接重试一次手动保存。
        if (state.saveStatus === 'unsaved' || state.saveStatus === 'error') {
            statusEl.classList.add('wie-status-action');
            statusEl.title = '点击立即保存';
            statusEl.addEventListener('click', () => { void saveManually(); });
        }
        else {
            statusEl.title = '自动保存不会改写正文；手动保存按设置转换 user 宏。';
        }
        syncMobileSaveChip(statusEl);

        const duplicateBtn = actionButton('📋 复制', () => {
            void runNavigating(async () => {
                await runtime.duplicateEntry(draft.uid);
            });
        }, { className: 'secondary' });

        const deleteBtn = actionButton('🗑️ 删除', () => {
            void runNavigating(async () => {
                const confirmed = await confirmDanger(target.ownerDocument, {
                    title: `确认删除条目 #${draft.uid}`,
                    message: `确定要永久删除条目「${draft.comment || '未命名'}」吗？`,
                    confirmLabel: '删除条目',
                });
                if (confirmed) {
                    await runtime.deleteEntry(draft.uid);
                    view.mobileSubView = 'list';
                }
            });
        }, { className: 'danger-button' });

        const saveBtn = actionButton('💾 保存条目', () => {
            void saveManually();
        }, { className: 'primary', title: '手动保存；开启选项时同时把独立成词的 user 转成 {{user}}。' });

        return h('div', { className: 'wie-detail-header' },
            h('div', { className: 'wie-detail-title-group' },
                h('div', {},
                    h('div', { className: 'wie-detail-h1' },
                        h('span', { text: `#${draft.uid}` }),
                        h('span', { className: 'wie-detail-name', text: draft.comment || '(未命名条目)' }),
                        draft.constant ? h('span', { className: 'wie-badge wie-badge-constant', text: '常驻' }) : null,
                    ),
                    h('div', { className: 'wie-detail-meta' }, statusEl),
                ),
            ),
            h('div', { className: 'wie-top-actions' }, duplicateBtn, deleteBtn, saveBtn),
        );
    }

    function refreshZenSidebar(list = target.querySelector('.wie-zen-entry-list')) {
        if (!list) return;
        const scrollTop = list.scrollTop;
        const entries = runtime.getFilteredEntries();
        list.replaceChildren(...(entries.length ? entries.map(entry => {
            const selected = runtime.state.selectedUid === entry.uid;
            const row = h('button', {
                type: 'button', disabled: entry.broken,
                className: `wie-zen-entry${selected ? ' active' : ''}${entry.disable ? ' disabled' : ''}`,
                dataset: { uid: String(entry.uid) },
                attrs: { 'aria-current': String(selected), title: entry.comment || '(未命名条目)' },
            },
                h('span', { className: 'wie-zen-entry-title', text: entry.comment || '(未命名条目)' }),
                h('span', { className: 'wie-zen-entry-status', text: entry.broken ? '不可编辑' : entry.disable ? '已禁用' : '已启用' }),
            );
            row.addEventListener('click', () => {
                void runNavigating(async () => {
                    await runtime.selectEntry(entry.uid);
                    view.mobileSubView = 'edit';
                    view.zenSidebarOpen = false;
                });
            });
            return row;
        }) : [h('div', { className: 'wie-empty-hint', text: '未找到匹配的条目。' })]));
        list.scrollTop = scrollTop;
        sidebarWorldData = runtime.state.worldData;
        sidebarFilter = runtime.state.filter;
        sidebarSort = runtime.state.sort;
    }

    function syncZenStatus() {
        const overlay = target.querySelector('.wie-zen-overlay');
        if (!overlay) return;
        const { currentDraft, error } = runtime.state;
        const title = overlay.querySelector('.wie-zen-title');
        if (title && currentDraft) title.textContent = `全屏写作: #${currentDraft.uid} ${currentDraft.comment || ''}`;
        const status = overlay.querySelector('.wie-zen-status');
        const label = statusLabel(runtime.state);
        status.textContent = label.text;
        status.className = `wie-zen-status ${label.className}`;
        const warning = overlay.querySelector('.wie-zen-error');
        warning.hidden = !error;
        warning.textContent = error ?? '';
        const sort = overlay.querySelector('.wie-sort-select');
        sort.value = runtime.state.sort;
        if (sidebarWorldData !== runtime.state.worldData || sidebarFilter !== runtime.state.filter || sidebarSort !== runtime.state.sort)
            refreshZenSidebar();
    }

    function renderZenOverlay(draft, scheduleScroll) {
        const overlay = h('div', { className: `wie-zen-overlay${view.zenSidebarOpen ? ' wie-zen-directory-open' : ''}` });
        const textarea = h('textarea', {
            className: 'wie-zen-textarea',
            value: draft.content,
            placeholder: '在此沉浸输入设定正文...',
            attrs: { 'aria-label': '全屏条目正文内容' },
        });
        textarea.addEventListener('input', () => {
            runtime.updateDraftField('content', textarea.value);
            scheduleScroll(textarea, { delay: 60 });
        });
        textarea.addEventListener('focus', () => {
            scheduleScroll(textarea);
        });

        const directoryToggle = actionButton('目录', () => {
            // display:none 下的滚动位置不可恢复：收起前记住，展开后再应用。
            if (view.zenSidebarOpen) view.zenListScrollTop = list.scrollTop;
            view.zenSidebarOpen = !view.zenSidebarOpen;
            overlay.classList.toggle('wie-zen-directory-open', view.zenSidebarOpen);
            directoryToggle.setAttribute('aria-expanded', String(view.zenSidebarOpen));
            if (view.zenSidebarOpen) {
                list.scrollTop = view.zenListScrollTop;
                const selected = list.querySelector('.wie-zen-entry.active');
                if (selected) {
                    const bounds = list.getBoundingClientRect();
                    const rect = selected.getBoundingClientRect();
                    if (rect.top < bounds.top) list.scrollTop += rect.top - bounds.top;
                    else if (rect.bottom > bounds.bottom) list.scrollTop += rect.bottom - bounds.bottom;
                }
                view.zenListScrollTop = list.scrollTop;
            }
        }, { className: 'secondary wie-zen-directory-toggle' });
        directoryToggle.setAttribute('aria-expanded', String(Boolean(view.zenSidebarOpen)));
        const label = statusLabel(runtime.state);
        const header = h('div', { className: 'wie-zen-header' },
            actionButton('✕ 关闭', () => {
                view.zenMode = false;
                render();
            }, { className: 'secondary' }),
            directoryToggle,
            h('div', { className: 'wie-zen-heading' },
                h('span', { className: 'wie-zen-title', text: `全屏写作: #${draft.uid} ${draft.comment || ''}` }),
                h('span', { className: `wie-zen-status ${label.className}`, text: label.text, attrs: { role: 'status' } }),
            ),
            actionButton('完成', () => {
                view.zenMode = false;
                render();
            }, { className: 'primary' }),
        );
        const list = h('div', { className: 'wie-zen-entry-list' });
        refreshZenSidebar(list);
        const sidebar = h('aside', { className: 'wie-zen-sidebar', attrs: { 'aria-label': '全屏世界书条目目录' } },
            h('strong', { className: 'wie-zen-directory-label', text: '条目目录' }),
            renderSearchAndFilter(runtime, onListChange),
            list,
        );
        const warning = h('div', { className: 'wie-zen-error wie-error-bar', text: runtime.state.error ?? '', attrs: { role: 'alert' } });
        warning.hidden = !runtime.state.error;
        // 宏栏放在右侧正文上方：目录与文本区独立滚动，不挤占软键盘余量。
        overlay.append(header, warning, h('div', { className: 'wie-zen-body' },
            sidebar,
            h('div', { className: 'wie-zen-editor' }, renderMacroBar(textarea), textarea),
        ));
        return overlay;
    }

    return { renderDetailHeader, renderZenOverlay, syncMobileSaveChip, refreshZenSidebar, syncZenStatus };
}
