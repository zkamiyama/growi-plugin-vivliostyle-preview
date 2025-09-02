describe('dev entry activation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // reset global flags
    (window as any).__VIVLIO_PREVIEW_ACTIVE__ = undefined;
    (window as any).__VIVLIO_PREVIEW__ = undefined;
    (window as any).pluginActivators = {};
    jest.resetModules();
  });

  test('registers activator on window', () => {
    require('../src/entry');
    expect((window as any).pluginActivators['growi-plugin-vivliostyle-preview-dev']).toBeTruthy();
  });

  test('activate sets active flag and exposes scheduleRender', () => {
    require('../src/entry');
    const act = (window as any).pluginActivators['growi-plugin-vivliostyle-preview-dev'];
    act.activate();
    expect((window as any).__VIVLIO_PREVIEW_ACTIVE__).toBe(true);
    expect(typeof (window as any).__VIVLIO_PREVIEW__.scheduleRender).toBe('function');
  });

  test('initializes tabs and toggles view mode', () => {
    document.body.innerHTML = `<div class="page-editor-preview-container"><div class="page-editor-preview-body"><div class="some-preview">Preview HTML</div></div></div>`;
    require('../src/entry');
    const act = (window as any).pluginActivators['growi-plugin-vivliostyle-preview-dev'];
    act.activate();
    const tabs = document.querySelector('.vivlio-tabs');
    expect(tabs).toBeTruthy();
    const vivlioBtn = Array.from(tabs!.querySelectorAll('button')).find(b=>/vivlio/i.test(b.textContent||''))!;
    vivlioBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const vivlioPanel = document.querySelector('.vivlio-panel') as HTMLElement;
    expect(vivlioPanel && vivlioPanel.style.display).toBe('block');
  });
});
