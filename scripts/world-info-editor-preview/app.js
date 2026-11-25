import { ShellController } from '/scripts/extensions/third-party/TT-Toolkit/src/shell/controller.js';
import { resolveFeatures } from '/scripts/extensions/third-party/TT-Toolkit/src/kernel/features.js';
import { featureRegistrations } from '/scripts/extensions/third-party/TT-Toolkit/src/features/registry.js';
import { defaultShellSettings } from '/scripts/extensions/third-party/TT-Toolkit/src/kernel/settings.js';
import { createNewEntry } from '/scripts/extensions/third-party/TT-Toolkit/src/features/world-info-editor/schema.js';

const entries = {};
for (let uid = 1; uid <= 80; uid++) {
    entries[uid] = {
        ...createNewEntry(uid, `示例条目 ${String(uid).padStart(2, '0')}`),
        content: `这是第 ${uid} 条隔离验证用的世界书正文。\n\n这里描述虚构城镇、图书馆和旅人的设定。所有示例只存于内存，用于检查列表滚动和正文框的拖拽高度，不涉及真实世界书数据。\n\n切换条目时左侧列表应停留原处；手动改变正文框高度后，展开设置和切换条目不应恢复默认高度。`,
        key: [`示例词${uid}`, '旅人'],
        keysecondary: [],
        constant: uid % 7 === 0,
        order: 100 + uid,
    };
}
const worldStore = { '隔离验证世界书': { entries } };
const settings = defaultShellSettings();
settings.lastRoute = 'world-info-editor';
settings.workspace.size = 'maximized';
settings.theme = 'slate';
const globals = new Map([['shell-settings-v1', settings]]);
window.qa = { writes: 0, worldStore, ready: false };

// 替身只覆盖功能实际使用的宿主边界；保存和设置都不离开当前页面的内存。
const host = {
    listWorldInfoNames: () => Object.keys(worldStore),
    activeWorldInfoBindings: () => [{ name: '隔离验证世界书', source: 'chat' }],
    loadWorldInfoFresh: async name => structuredClone(worldStore[name]),
    saveWorldInfo: async (name, data) => { worldStore[name] = structuredClone(data); window.qa.writes++; },
    globalGet: async key => globals.has(key) ? structuredClone(globals.get(key)) : undefined,
    globalSet: async (key, value) => { globals.set(key, structuredClone(value)); },
    globalDelete: async key => { globals.delete(key); },
};
const log = { info() {}, debug() {}, warn() {}, error() {} };
const logger = { scoped: () => log };
const features = resolveFeatures({ host, logger }, featureRegistrations.filter(item => item.id === 'world-info-editor'));
const shell = new ShellController(host, features, logger, '隔离验证 · 内存示例');

try {
    await shell.initialize();
    window.qa.shell = shell;
    window.qa.ready = true;
    const openButton = document.getElementById('open-preview');
    openButton.disabled = false;
    openButton.addEventListener('click', () => shell.openWorkbench());
    document.getElementById('preview-status').textContent = '已加载。所有修改仅影响内存示例，刷新页面即可重置。';
    shell.openWorkbench();
} catch (error) {
    console.error('[TT-Toolkit preview] Initialization failed', error);
    document.getElementById('preview-status').textContent = `隔离工作台加载失败：${error.message}`;
}
