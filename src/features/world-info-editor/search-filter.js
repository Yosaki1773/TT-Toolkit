import { actionButton, h } from '../../ui/dom.js';

// 管理列表与全屏目录共用搜索、筛选语义；只更新列表，不替换正在输入的控件。
export function renderSearchAndFilter(runtime, onChange) {
    const state = runtime.state;
    const searchInput = h('input', {
        type: 'text', value: state.searchQuery,
        placeholder: '搜索标题、关键词或正文…',
        attrs: { 'aria-label': '搜索世界书条目' },
    });
    const clearBtn = h('button', {
        type: 'button', className: 'wie-search-clear', text: '×',
        attrs: { 'aria-label': '清空搜索', title: '清空搜索' },
    });
    const update = () => {
        clearBtn.toggleAttribute('hidden', !searchInput.value);
        chips.forEach(button => button.classList.toggle('active', button.dataset.filter === runtime.state.filter));
        onChange();
    };
    searchInput.addEventListener('input', () => {
        runtime.setSearchQuery(searchInput.value);
        update();
    });
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.focus();
        runtime.setSearchQuery('');
        update();
    });
    clearBtn.toggleAttribute('hidden', !searchInput.value);
    const chips = [
        ['all', '全部'], ['constant', '常驻'], ['active', '已启用'],
        ['disabled', '已禁用'], ['depth', '@深度'], ['image', '含图片'],
    ].map(([key, label]) => {
        const button = actionButton(label, () => {
            runtime.setFilter(key);
            update();
        }, { className: `wie-chip${state.filter === key ? ' active' : ''}` });
        button.dataset.filter = key;
        return button;
    });
    return h('div', { className: 'wie-list-header' },
        h('div', { className: 'wie-search-box' },
            searchInput, clearBtn,
        ),
        h('div', { className: 'wie-filter-chips' }, chips),
    );
}
