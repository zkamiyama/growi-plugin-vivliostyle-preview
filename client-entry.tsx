import React from 'react';
import config from './package.json';
import { helloGROWI, remarkPlugin, rehypePlugin } from './src/Hello';
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
    const { a } = options.components;
    options.components.a = helloGROWI(a);
    options.remarkPlugins.push(remarkPlugin as any);
    options.rehypePlugins.push(rehypePlugin as any);
  } catch (e) {
    // ignore
  }
  return options;
};

const activate = (): void => {
  if (growiFacade == null || growiFacade.markdownRenderer == null) return;
  const { optionsGenerators } = growiFacade.markdownRenderer;

  const originalCustomViewOptions = optionsGenerators.customGenerateViewOptions;
  optionsGenerators.customGenerateViewOptions = (...args: [string, Options, Func]) => {
    const options = originalCustomViewOptions ? originalCustomViewOptions(...args) : optionsGenerators.generateViewOptions(...args);
    return addPlugin(options);
  };

  const originalGeneratePreviewOptions = optionsGenerators.customGeneratePreviewOptions;
  optionsGenerators.customGeneratePreviewOptions = (...args: [string, Options, Func]) => {
    const options = originalGeneratePreviewOptions ? originalGeneratePreviewOptions(...args) : optionsGenerators.generatePreviewOptions(...args);
    return addPlugin(options);
  };
};

const deactivate = (): void => {};

if ((window as any).pluginActivators == null) {
  (window as any).pluginActivators = {};
}
(window as any).pluginActivators[config.name] = { activate, deactivate };

export {};
