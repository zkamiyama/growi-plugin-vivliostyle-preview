(mirror note) このファイルは plugin-publish/AGENTS.md が別管理のため dev 側にも複製しています。

参照元と内容同期: plugin-publish/AGENTS.md を参照してください。

追記計画: Vivliostyle 真っ白時間短縮のため以下段階描画を実装中/予定。
1. Markdown → HTML 即時 (既存 preview を活用)
2. Vivliostyle iframe 起動後 Ready 前でも fallbackHtml に HTML 流し込み表示
3. Ready 到達後 viewer.load() でページネーション版へシームレス切替 (フェード)
4. 失敗時 fallbackHtml 維持 + リトライボタン (未実装)

現状: fallbackHtml ロジックは存在するが逆方向(エラー)用途中心。次ステップで成功パスでも一時表示を明示的に有効化する。
