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
    const previewKeys = ['preview', 'page', 'body', 'content'];
    let wrapped = false;
    for (const key of previewKeys) {
      const comp = (options.components as any)[key];
      console.debug(DBG, 'check key', key, '=>', typeof comp);
      if (typeof comp === 'function') {
        (options.components as any)[key] = withVivlioTabs(comp);
        console.info(DBG, 'wrapped preview component at key', key);
        wrapped = true;
        break;
      }
    }
    if (!wrapped) {
      console.warn(DBG, 'no preview component key matched', Object.keys(options.components));
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
