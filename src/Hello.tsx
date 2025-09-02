// 簡素化: 既存テンプレのデモ処理を除去し何も変更しない関数群だけ残す
import type { Plugin } from 'unified';

export const helloGROWI = (Tag: React.FunctionComponent<any>): React.FunctionComponent<any> =>
  (props) => <Tag {...props}>{props.children}</Tag>;

export const remarkPlugin: Plugin = () => () => {};
export const rehypePlugin: Plugin = () => () => {};
