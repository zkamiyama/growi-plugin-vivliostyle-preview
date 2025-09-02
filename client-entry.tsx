import * as React from 'react';
import config from './package.json';
import { helloGROWI, remarkPlugin, rehypePlugin } from './src/Hello';
import { withVivlioTabs } from './src/VivlioTabs';
import { Options, Func, ViewOptions } from './types/utils';

declare const growiFacade : {
  markdownRenderer?: {
    optionsGenerators: {
      customGenerateViewOptions: (path: string, options: Options, toc: Func) => ViewOptions,
      generateViewOptions: (path: string, options: Options, toc: Func) => ViewOptions,
      generatePreviewOptions: (path: string, options: Options, toc: Func) => ViewOptions,
      customGeneratePreviewOptions: (path: string, options: Options, toc: Func) => ViewOptions,
    },
  },
  react: typeof React,
};

const DBG = '[VIVLIO]';

// Heuristics to find the main preview component
const isLikelyPreviewComponent = (key: string, component: any): boolean => {
  if (typeof component !== 'function') {
    return false;
  }
  // Prioritize components with typical names
  if (['Page', 'Content', 'Preview', 'Body'].includes(key)) {
    return true;
  }
  // Fallback for components that seem to be containers (judging by name)
  if (key.match(/^[A-Z]/) && !['a', 'p', 'h1', 'h2', 'h3', 'h4', 'code', 'table'].includes(key)) {
    return true;
  }
  return false;
};

const addPlugin = (options: ViewOptions) => {
  try {
    if (!options || !options.components) {
      console.debug(DBG, 'options/components missing, skip');
      return options;
    }

    // a タグ加工
    if (options.components.a) {
      console.debug(DBG, 'wrap <a> component');
      options.components.a = helloGROWI(options.components.a);
    } else {
      console.debug(DBG, 'no <a> component found');
    }

    let wrapped = false;
    const componentKeys = Object.keys(options.components);
    // Find and wrap the most likely preview component
    const targetKey = componentKeys.find(key => isLikelyPreviewComponent(key, (options.components as any)[key]));

    if (targetKey) {
      const comp = (options.components as any)[targetKey];
      (options.components as any)[targetKey] = withVivlioTabs(comp);
      console.info(DBG, `Wrapped component at key: '${targetKey}'`);
      wrapped = true;
    }

    if (!wrapped) {
      console.warn(DBG, 'No suitable preview component found to wrap. Available component keys:', componentKeys);
      (window as any).__VIVLIO_COMPONENT_KEYS__ = componentKeys;

      // DOM fallback using MutationObserver for robustness
      const fallbackObserver = new MutationObserver((mutations, observer) => {
        const target = document.querySelector('.page-content, .wiki');
        // Wait for the target to exist and have children
        if (target && target.hasChildNodes() && !target.querySelector('.vivlio-tabs-wrapper')) {
          console.info(DBG, 'fallback: target found, applying DOM tab wrapper.');

          try {
            const wrapper = document.createElement('div');
            wrapper.className = 'vivlio-tabs-wrapper vivlio-tabs-wrapper--fallback';
            const bar = document.createElement('div');
            bar.className = 'vivlio-tabs-bar';
            const btnMd = document.createElement('button'); btnMd.textContent = 'Markdown'; btnMd.className = 'active';
            const btnViv = document.createElement('button'); btnViv.textContent = 'Vivliostyle';
            bar.append(btnMd, btnViv);

            const content = document.createElement('div'); content.className = 'vivlio-tabs-content';
            const panelMd = document.createElement('div'); panelMd.className = 'vivlio-panel-md';
            const panelViv = document.createElement('div'); panelViv.className = 'vivlio-panel-viv'; panelViv.style.display = 'none';
            const iframe = document.createElement('iframe'); iframe.style.cssText = 'width:100%;height:600px;border:1px solid #ccc;background:#fff;';
            panelViv.appendChild(iframe);

            // Move children from original target to the new markdown panel
            while (target.firstChild) {
              panelMd.appendChild(target.firstChild);
            }

            content.append(panelMd, panelViv);
            wrapper.append(bar, content);
            target.appendChild(wrapper);

            const switchTab = (mode: 'md' | 'viv') => {
              if (mode === 'md') {
                btnMd.classList.add('active');
                btnViv.classList.remove('active');
                panelMd.style.display = 'block';
                panelViv.style.display = 'none';
              } else {
                btnViv.classList.add('active');
                btnMd.classList.remove('active');
                panelMd.style.display = 'none';
                panelViv.style.display = 'block';
                try {
                  const html = panelMd.innerHTML || '';
                  const doc = iframe.contentDocument;
                  if (doc) {
                    doc.open();
                    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
                    doc.close();
                  }
                } catch (e) {
                  console.error(DBG, 'fallback vivlio write error', e);
                }
              }
            };

            btnMd.onclick = () => { console.debug(DBG, 'fallback click markdown'); switchTab('md'); };
            btnViv.onclick = () => { console.debug(DBG, 'fallback click vivlio'); switchTab('viv'); };

            // Disconnect observer once the job is done
            observer.disconnect();
            console.info(DBG, 'fallback: observer disconnected.');

          } catch (err) {
            console.error(DBG, 'fallback error', err);
          }
        }
      });

      // Start observing the body for child list modifications
      fallbackObserver.observe(document.body, { childList: true, subtree: true });
      console.info(DBG, 'fallback: MutationObserver started.');

      // Failsafe timeout to stop the observer
      setTimeout(() => {
        fallbackObserver.disconnect();
        console.info(DBG, 'fallback: observer disconnected by failsafe timeout.');
      }, 5000);
    }

    if (options.remarkPlugins) {
      options.remarkPlugins.push(remarkPlugin as any);
    }
    if (options.rehypePlugins) {
      options.rehypePlugins.push(rehypePlugin as any);
    }
  } catch (e) {
    console.error(DBG, 'addPlugin error', e);
  }
  return options;
};

const activate = (): void => {
  if ((window as any).__VIVLIO_ACTIVE__) { console.debug(DBG, 'activate: already active'); return; }
  if (growiFacade == null) { console.warn(DBG, 'activate: growiFacade missing'); return; }
  if (growiFacade.markdownRenderer == null) { console.warn(DBG, 'activate: markdownRenderer missing'); return; }
  const { optionsGenerators } = growiFacade.markdownRenderer;
  if (!optionsGenerators) { console.warn(DBG, 'activate: optionsGenerators missing'); return; }

  (window as any).__VIVLIO_ORIGINALS__ = {
    customGenerateViewOptions: optionsGenerators.customGenerateViewOptions,
    customGeneratePreviewOptions: optionsGenerators.customGeneratePreviewOptions,
  };
  console.debug(DBG, 'stored originals');

  optionsGenerators.customGenerateViewOptions = (...args: [string, Options, Func]) => {
    console.debug(DBG, 'customGenerateViewOptions invoked', args[0]);
    const o = (window as any).__VIVLIO_ORIGINALS__.customGenerateViewOptions;
    const options = o ? o(...args) : optionsGenerators.generateViewOptions(...args);
    console.debug(DBG, 'view options obtained, injecting');
    return addPlugin(options);
  };
  optionsGenerators.customGeneratePreviewOptions = (...args: [string, Options, Func]) => {
    console.debug(DBG, 'customGeneratePreviewOptions invoked', args[0]);
    const o = (window as any).__VIVLIO_ORIGINALS__.customGeneratePreviewOptions;
    const options = o ? o(...args) : optionsGenerators.generatePreviewOptions(...args);
    console.debug(DBG, 'preview options obtained, injecting');
    return addPlugin(options);
  };
  (window as any).__VIVLIO_ACTIVE__ = true;
  console.info(DBG, 'activate completed');
};

const deactivate = (): void => {
  if (!(window as any).__VIVLIO_ACTIVE__) { console.debug(DBG, 'deactivate: not active'); return; }
  if (growiFacade == null || growiFacade.markdownRenderer == null) { console.warn(DBG, 'deactivate: facade missing'); return; }
  const { optionsGenerators } = growiFacade.markdownRenderer;
  const originals = (window as any).__VIVLIO_ORIGINALS__ || {};
  if (originals.customGenerateViewOptions) optionsGenerators.customGenerateViewOptions = originals.customGenerateViewOptions;
  if (originals.customGeneratePreviewOptions) optionsGenerators.customGeneratePreviewOptions = originals.customGeneratePreviewOptions;
  delete (window as any).__VIVLIO_ACTIVE__;
  console.info(DBG, 'deactivated and originals restored');
};

if ((window as any).pluginActivators == null) {
  (window as any).pluginActivators = {};
}
console.debug(DBG, 'register pluginActivators key', config.name);
(window as any).pluginActivators[config.name] = { activate, deactivate };
console.info(DBG, 'registration complete');

export {};
