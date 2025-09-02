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

const addPlugin = (options: ViewOptions) => {
  try {
    // a タグ加工は残しつつ preview 用コンポーネントをタブ化
    if (options.components?.a) {
      options.components.a = helloGROWI(options.components.a);
    }
    // 代表的な preview コンポーネント候補キー (GROWI 側実装に依存するため複数チェック)
    const previewKeys = ['preview', 'page', 'body', 'content'];
    for (const key of previewKeys) {
      const comp = (options.components as any)[key];
      if (typeof comp === 'function') {
        (options.components as any)[key] = withVivlioTabs(comp);
        break; // 1つラップすれば十分
      }
    }
    options.remarkPlugins.push(remarkPlugin as any);
    options.rehypePlugins.push(rehypePlugin as any);
  } catch (e) {
    // swallow
  }
  return options;
};

const activate = (): void => {
  if ((window as any).__VIVLIO_ACTIVE__) return;
  if (growiFacade == null || growiFacade.markdownRenderer == null) return;
  const { optionsGenerators } = growiFacade.markdownRenderer;

  (window as any).__VIVLIO_ORIGINALS__ = {
    customGenerateViewOptions: optionsGenerators.customGenerateViewOptions,
    customGeneratePreviewOptions: optionsGenerators.customGeneratePreviewOptions,
  };

  optionsGenerators.customGenerateViewOptions = (...args: [string, Options, Func]) => {
    const o = (window as any).__VIVLIO_ORIGINALS__.customGenerateViewOptions;
    const options = o ? o(...args) : optionsGenerators.generateViewOptions(...args);
    return addPlugin(options);
  };
  optionsGenerators.customGeneratePreviewOptions = (...args: [string, Options, Func]) => {
    const o = (window as any).__VIVLIO_ORIGINALS__.customGeneratePreviewOptions;
    const options = o ? o(...args) : optionsGenerators.generatePreviewOptions(...args);
    return addPlugin(options);
  };
  (window as any).__VIVLIO_ACTIVE__ = true;
};

const deactivate = (): void => {
  if (!(window as any).__VIVLIO_ACTIVE__) return;
  if (growiFacade == null || growiFacade.markdownRenderer == null) return;
  const { optionsGenerators } = growiFacade.markdownRenderer;
  const originals = (window as any).__VIVLIO_ORIGINALS__ || {};
  if (originals.customGenerateViewOptions) optionsGenerators.customGenerateViewOptions = originals.customGenerateViewOptions;
  if (originals.customGeneratePreviewOptions) optionsGenerators.customGeneratePreviewOptions = originals.customGeneratePreviewOptions;
  delete (window as any).__VIVLIO_ACTIVE__;
};

if ((window as any).pluginActivators == null) {
  (window as any).pluginActivators = {};
}
(window as any).pluginActivators[config.name] = { activate, deactivate };

export {};
