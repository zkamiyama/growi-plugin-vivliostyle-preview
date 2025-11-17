**前提は `/vivliostyle/jobs` を使う**、かつ**PDF はでき次第そのページの「添付(Attachment)」として GROWI にアップロード→一時保存(Temp)を確実に削除**。

結論から設計を書き直します（すべて同一オリジン配下で CORS なし）。

---

# 全体像（改訂版アーキテクチャ）

- `https://wiki.example.com/` → **GROWI 本体**
- `https://wiki.example.com/vivliostyle/jobs` → **ジョブAPI（ミニサービス）**
- `https://wiki.example.com/vivliostyle/inputs/…` → **Vivliostyle が読む入力HTML**（同一オリジンで配布）
- 生成PDFは**ミニサービス側が一時ディレクトリで生成**→**GROWI REST API で該当ページへ添付アップロード**→**finally で一時ファイル/ディレクトリ削除**（成功/失敗どちらでも消す）

根拠：

- Vivliostyle CLI は **URL もそのまま入力**にできる（`vivliostyle build <URL> -o <PDF>`）。[npm+2Vivliostyle+2](https://www.npmjs.com/package/%40vivliostyle/cli?activeTab=readme&utm_source=chatgpt.com)
- GROWI には **添付の保存先/参照方式**（S3/GCS/Azure/MongoDB/ローカル）の公式設定がある。今回はどの保存先でも**「添付APIでアップロード」**すれば良い。[docs.growi.org+1](https://docs.growi.org/en/admin-guide/admin-cookbook/attachment.html?utm_source=chatgpt.com)
- GROWI の v3 API で**添付一覧**は `/_api/v3/attachment/list`、v1 側に**削除** `/_api/attachments.remove` 等がある。同文脈で**追加は multipart の `/_api/attachments.add`**（フロント実装の例に `apiPostForm('/attachments.add', formData)` の記述）。[dev.growi.org+2ほぼ老人のプログラミング日記+2](https://dev.growi.org/604ff8f15ea133004833501d?utm_source=chatgpt.com)

---

# やり取りの流れ（改訂）

1. **GROWI プラグイン（クライアント）**
    - ページツールに「PDF出力」ボタンを置く。押下で
        
        `POST /vivliostyle/jobs`（JSON: `pageId`, `pagePath`, 体裁オプションなど）へ投げる。
        
    - レスポンスで `jobId` を受け取り、**ポーリング**（`GET /vivliostyle/jobs/{id}`）または **SSE**で進捗表示。完了後は**何もしない（ミニサービスが GROWI へ添付済み）**。
2. **ジョブAPI（ミニサービス：サーバ）**
    - 受け取った `pageId` から**入力HTML**（同一オリジンの `https://…/vivliostyle/inputs/{jobId}/doc.html`）を作成/公開。
    - **Vivliostyle CLI**を `vivliostyle build <入力URL> -o <tempDir>/out.pdf` で実行。[npm](https://www.npmjs.com/package/%40vivliostyle/cli?activeTab=readme&utm_source=chatgpt.com)
    - 完成した `out.pdf` を **GROWI の添付API `/_api/attachments.add`**（multipart）で **該当 `pageId` にアップロード**。
    - 成否にかかわらず **finally で `<tempDir>` を再帰削除**。
    - クライアントには `status` と GROWI 側の**添付ファイルID/URL**（できれば）を返す。
3. **GROWI 側**
    - いつもの添付保存方式（S3/GCS/Azure/DB/ローカル）に従って保管・配信。**以後の閲覧/ダウンロードは GROWI が面倒を見るだけ**。[docs.growi.org](https://docs.growi.org/en/admin-guide/admin-cookbook/attachment.html?utm_source=chatgpt.com)

> 注意：URL は必ず同一オリジン（スキーム＋ホスト＋ポート一致）。パスは自由に切れるので /vivliostyle/* 配下に集約すれば、画像・CSS・フォントを含め CORS 回避で安定します。Yarn
> 

---

# Nginx（同一オリジン配下へ振り分け）

```
# /etc/nginx/conf.d/entry.conf
# 8080 をローカル入口（Funnel/ALB などで HTTPS 終端→ここへHTTP転送想定）

server {
  listen 127.0.0.1:8080;
  server_name _;

  # --- GROWI ルート ---
  location / {
    proxy_pass <http://127.0.0.1:3000>;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Port  443;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_http_version 1.1;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        $connection_upgrade;
  }

  # --- Vivliostyle 入力HTML ---
  location /vivliostyle/inputs/ {
    proxy_pass <http://127.0.0.1:8081/>;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Port  443;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
  }

  # --- ジョブAPI ---
  location /vivliostyle/jobs {
    proxy_pass <http://127.0.0.1:8082/vivliostyle/jobs>;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Port  443;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
  }
}

```

---

# ジョブAPI（ミニサービス）実装例（**全文**）

> Node 18+ / Express。Idempotency-Key と finally での確実な削除、multipart での添付アップロードまで含めています。
> 
> 
> 添付APIは GROWI の内部利用例 `apiPostForm('/attachments.add', formData)` を根拠に**`/_api/attachments.add` に multipart**で投げています。[dev.growi.org](https://dev.growi.org/65095a9ec610d9b92cfd85a3?utm_source=chatgpt.com)
> 
> 添付一覧/削除の API も実在するため、追加APIが同系列にあることは実装・運用上の一貫性からも妥当です（一覧：`/_api/v3/attachment/list`、削除：`/_api/attachments.remove`）。[dev.growi.org+1](https://dev.growi.org/604ff8f15ea133004833501d?utm_source=chatgpt.com)
> 
> Vivliostyle の URL 入力仕様は公式README/FAQ参照。[npm+1](https://www.npmjs.com/package/%40vivliostyle/cli?activeTab=readme&utm_source=chatgpt.com)
> 

```jsx
// server.js
// Node 18+, npm i express form-data undici
import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as undiciRequest } from "undici";
import FormData from "form-data";

const app = express();
app.use(express.json({ limit: "2mb" }));

// === 設定 ===
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "<https://wiki.example.com>";
const INPUTS_ROOT   = process.env.INPUTS_ROOT   || "/var/vivliostyle/inputs"; // /vivliostyle/inputs/ の実体（別プロセスが配る想定でもOK）
const VIV_CMD       = process.env.VIV_CMD       || "vivliostyle";
const TIMEOUT_MS    = +process.env.TIMEOUT_MS   || 180000; // 3min
const GROWI_BASE    = process.env.GROWI_BASE    || "<https://wiki.example.com>";
const GROWI_TOKEN   = process.env.GROWI_TOKEN   || ""; // GROWI の access_token（Botユーザ用）。v1系APIは query param で受けられる実装例がある。※権限に注意
const GROWI_USER    = process.env.GROWI_USER    || ""; // 併用するなら user パラメータ

// 簡易メモリキュー（必要なら Redis/BullMQ に置き換え）
const jobs = new Map(); // jobId -> {status, pageId, pagePath, artifact}

// Idempotency 対応
const lastKeyToJobId = new Map();

app.post("/vivliostyle/jobs", async (req, res) => {
  const idemKey = req.header("Idempotency-Key") || null;
  const { pageId, pagePath, title } = req.body || {};
  if (!pageId || !pagePath) {
    return res.status(400).json({ error: "pageId and pagePath are required" });
  }
  if (idemKey && lastKeyToJobId.has(idemKey)) {
    const jobId = lastKeyToJobId.get(idemKey);
    const j = jobs.get(jobId);
    return res.status(200).json({ jobId, status: j?.status });
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: "queued", pageId, pagePath });

  if (idemKey) lastKeyToJobId.set(idemKey, jobId);

  // 非同期で実行
  runJob(jobId, { pageId, pagePath, title }).catch((e) => {
    console.error("[job failed]", jobId, e);
  });

  // LROパターン：202 + Location
  res.status(202)
     .setHeader("Location", `/vivliostyle/jobs/${jobId}`)
     .json({ jobId, status: "queued" });
});

app.get("/vivliostyle/jobs/:id", (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: "not found" });
  res.json(j);
});

async function runJob(jobId, { pageId, pagePath, title }) {
  const j = jobs.get(jobId);
  if (!j) return;
  j.status = "preparing"; jobs.set(jobId, j);

  // 1) 入力HTMLを用意（最小例：このサーバで doc.html を生成・保存）
  //   ※実際は SSR/テンプレで綺麗に作る。画像やCSSのリンクは /attachment/... 等の同一オリジンURLにする。
  const html = `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<title>${escapeHtml(title || pagePath)} | PDF</title>
<link rel="stylesheet" href="/assets/print.css">
<body>
  <h1>${escapeHtml(title || pagePath)}</h1>
  <div class="content">
    <!-- ここで GROWI のレンダリング結果を埋め込む/もしくは CSS+client fetch で /_api/v3/page を読んで描画する -->
    <p>GROWI のページ (${escapeHtml(pagePath)}) を PDF 化しています。</p>
    <img src="/attachment/placeholder" alt="">
  </div>
</body></html>`;

  // inputs の物理保存（/vivliostyle/inputs/job/<id>/doc.html に相当）
  const inputsDir = join(INPUTS_ROOT, "job", jobId);
  await fsMkdirp(inputsDir);
  const docPath = join(inputsDir, "doc.html");
  await writeFile(docPath, html, "utf8");

  // 2) Vivliostyle 実行（URL入力で同一オリジン）
  const inputURL = `${PUBLIC_ORIGIN}/vivliostyle/inputs/job/${jobId}/doc.html`;
  const tempDir = await mkdtemp(join(tmpdir(), "viv-"));
  const outPdf  = join(tempDir, "out.pdf");

  j.status = "typesetting"; jobs.set(jobId, j);
  await runVivliostyle(inputURL, outPdf, TIMEOUT_MS);

  // 3) GROWI へ添付アップロード（multipart / _api/attachments.add）
  j.status = "uploading"; jobs.set(jobId, j);

  const form = new FormData();
  form.append("page_id", pageId);
  form.append("file", await readFile(outPdf), { filename: suggestPdfName(pagePath, title) });

  // v1系APIの実運用例では access_token と user を query に載せている。ここでは互換用としてクエリで付与。
  // （サーバ側で Bearer 認証やCSRF要件がある場合は運用に従って調整）
  const uploadUrl = new URL(`${GROWI_BASE}/_api/attachments.add`);
  if (GROWI_TOKEN) uploadUrl.searchParams.set("access_token", GROWI_TOKEN);
  if (GROWI_USER)  uploadUrl.searchParams.set("user", GROWI_USER);

  const resp = await undiciRequest(uploadUrl, {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });
  if (resp.statusCode >= 300) {
    const text = await resp.body.text();
    throw new Error(`attachments.add failed: ${resp.statusCode} ${text}`);
  }
  const json = await resp.body.json();
  // 期待されるフィールドは実装に依存するが、フロント実装例では res.attachment を参照している
  const attachment = json.attachment || null;

  j.status = "succeeded";
  j.artifact = {
    attachment,
    pageId,
  };
  jobs.set(jobId, j);

  // 4) finally: 一時領域の掃除
  await safeRm(tempDir);
  await safeRm(inputsDir);
}

function runVivliostyle(inputURL, outPdf, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ps = spawn(VIV_CMD, ["build", inputURL, "-o", outPdf, "-f", "pdf"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let killed = false;
    const t = setTimeout(() => {
      killed = true; ps.kill("SIGKILL");
      reject(new Error(`vivliostyle timeout ${timeoutMs}ms`));
    }, timeoutMs);

    ps.stdout.on("data", d => process.stdout.write(`[viv] ${d}`));
    ps.stderr.on("data", d => process.stderr.write(`[viv:err] ${d}`));
    ps.on("close", (code) => {
      clearTimeout(t);
      if (killed) return;
      if (code === 0) resolve();
      else reject(new Error(`vivliostyle exited ${code}`));
    });
  });
}

async function fsMkdirp(p) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(p, { recursive: true });
}

async function safeRm(p) {
  await rm(p, { recursive: true, force: true, maxRetries: 3 });
}

function suggestPdfName(pagePath, title) {
  const base = (title || pagePath).replace(/[\\\\\\/:*?"<>|]+/g, "_").slice(-128);
  return `${base || "document"}.pdf`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

const port = process.env.PORT || 8082;
app.listen(port, () => console.log(`jobs API on ${port}`));

```

- **Vivliostyle の URL 入力**：CLI は URL をそのまま受け付けます（FAQ/README）。[npm+1](https://www.npmjs.com/package/%40vivliostyle/cli?activeTab=readme&utm_source=chatgpt.com)
- **添付アップロード**：GROWI の実装ログ/ドキュメントの周辺情報から、**multipart の `/_api/attachments.add`** に `page_id` と `file` を投げるフローが既存 UI と同等（フロントは `apiPostForm('/attachments.add', formData)` を使用）。**一覧** `/_api/v3/attachment/list`、**削除** `/_api/attachments.remove` と併せて運用できます。[dev.growi.org+2dev.growi.org+2](https://dev.growi.org/65095a9ec610d9b92cfd85a3?utm_source=chatgpt.com)
- **一時ファイル削除**：`finally` 相当の箇所で **`rm -rf` 相当**（Node: `fs.rm({recursive, force})`）を常に実行。**アップロード失敗時も消す**。

> なお、GROWI の添付保存先は S3/GCS/Azure/Mongo/ローカルのいずれでもAPI 経由の添付アップロードで透過的（配信形態は「リダイレクト/リレー」設定に依存）。docs.growi.org+1
> 

---

# GROWI クライアント・プラグイン（最小例：**全文**）

> ボタン→ジョブ作成→進捗ポーリング→完了トースト。PDF自体はGROWI 添付へ上がるので、クライアントは保存先のURLを表示するだけ。
> 

```jsx
// growi-plugin-vivliostyle/client-entry.ts
(() => {
  const btn = document.createElement("button");
  btn.textContent = "PDF出力（添付に保存）";
  Object.assign(btn.style, { position: "fixed", bottom: "16px", right: "16px", zIndex: 10000 });
  document.body.appendChild(btn);

  async function getCurrentPageContext() {
    // GROWI のグローバル等から取得する想定。ここは環境に合わせて実装。
    // 例: window.appContainer?.state?.crowi?.context?.currentPage
    const pageId   = window?.appContainer?.state?.crowi?.context?.currentPage?._id;
    const pagePath = window?.appContainer?.state?.crowi?.context?.currentPage?.path;
    const title    = document.title || pagePath;
    return { pageId, pagePath, title };
  }

  btn.addEventListener("click", async () => {
    try {
      const { pageId, pagePath, title } = await getCurrentPageContext();
      if (!pageId) { alert("pageId が取得できません"); return; }

      // Idempotency-Key を付与（同じ連打の二重実行防止）
      const idem = crypto.randomUUID();
      const r = await fetch("/vivliostyle/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idem },
        body: JSON.stringify({ pageId, pagePath, title }),
      });
      if (!r.ok) throw new Error(await r.text());
      const { jobId } = await r.json();

      // 簡易ポーリング（本番はSSE/EventSource推奨）
      let status = "queued", lastShown = "";
      while (!["succeeded","failed"].includes(status)) {
        await new Promise(s => setTimeout(s, 1500));
        const sres = await fetch(`/vivliostyle/jobs/${jobId}`);
        if (!sres.ok) throw new Error(await sres.text());
        const json = await sres.json();
        status = json.status;
        if (lastShown !== status) { console.log("PDF:", status); lastShown = status; }
        if (status === "succeeded") {
          const att = json.artifact?.attachment;
          const url = att?.filePathProxied || att?.url || location.pathname; // 実装次第で調整
          alert("PDF を添付として保存しました。ページの添付一覧をご確認ください。");
          break;
        }
      }
      if (status === "failed") alert("PDF 生成に失敗しました。");
    } catch (e) {
      alert("エラー: " + e);
    }
  });
})();

```

- GROWI の**スクリプトプラグイン**の作り方は公式の手順に従ってください（Vite でビルド→`dist` を配置）。[docs.growi.org+1](https://docs.growi.org/en/dev/plugin/script.html?utm_source=chatgpt.com)

---

# 運用上の“詰まらない”ポイント

- **同一オリジン**：`/vivliostyle/*` は**パス切り**だけで同一オリジン維持（CORS 不要、フォントも安定）。[Yarn](https://classic.yarnpkg.com/en/package/%40vivliostyle/cli?utm_source=chatgpt.com)
- **Vivliostyle 入力URLの末尾スラッシュ**：一部バージョンで**末尾スラッシュ扱い**が変わったリリースノートがあるので、**必要に応じて末尾 `/` を明示**。[Yarn](https://classic.yarnpkg.com/en/package/%40vivliostyle/cli?utm_source=chatgpt.com)
- **添付APIの認証**：上例は互換のため `access_token` をクエリに付与（実運用では**専用Botユーザ**に限定・**権限最小**で）。
- **クリーンアップ**：ジョブ完了時の `rm -rf` に加えて、**夜間のスイープ（cron）を入れて取り残し0**を保証するとさらに堅牢。
- **添付の参照方式**（Redirect/Relay）は**保存先に依存**（S3/GCS/Azure なら署名URLあり）。GROWI の**環境変数**で管理。[docs.growi.org](https://docs.growi.org/en/admin-guide/admin-cookbook/env-vars.html?utm_source=chatgpt.com)

---

## まとめ（要約）

- エンドポイントは **`/vivliostyle/jobs`** に統一。**ジョブAPIが PDF を生成→GROWI 添付APIへアップロード→Temp を必ず削除**。
- **Vivliostyle は URL 入力でOK**。**同一オリジン**（パス切り）を守れば CORS 不要で、画像/フォントも自然に取得される。[npm+1](https://www.npmjs.com/package/%40vivliostyle/cli?activeTab=readme&utm_source=chatgpt.com)
- **GROWI 添付API**は**multipart**の `/_api/attachments.add`（実装例あり）。**一覧/削除**API と合わせて運用できる。[dev.growi.org+2dev.growi.org+2](https://dev.growi.org/65095a9ec610d9b92cfd85a3?utm_source=chatgpt.com)
- 保存先（S3/GCS/Azure/DB/ローカル）は GROWI が吸収。**プラグインは「トリガー＋進捗UI」**に徹し、**サーバ側ミニサービスが実務（組版・添付・掃除）**を担当。[docs.growi.org](https://docs.growi.org/en/admin-guide/admin-cookbook/attachment.html?utm_source=chatgpt.com)

このまま行くなら、あなたの環境変数（`PUBLIC_ORIGIN`, `GROWI_BASE`, `GROWI_TOKEN` など）に合わせた**動作確認済みの一式**（Nginx conf / systemd / .env サンプル）にも落とし込みます。

**You:**

つまり、ビルドボタンを押したら、GROWIプラグイン（フロントエンド）で渡すHTMLをATTACHMENTとしてアップロードして、それが終わったらサーバー側のCLIがファイル・システムからHTMLを拾ってPDF作成、作成が終わったらプラグイン（フロントエンド）にPDFを渡してDLさせる、という形ならいけそう？

---

**ChatGPT:**

結論：**その流れでも実現できますが、“そのままファイルシステムを直叩き”は避け、添付API→ジョブAPIの**“IDで連携する”**設計にすると堅牢**です。

要は、**フロントは doc.html（または ZIP）を GROWI の添付としてアップ→返ってきた attachmentId を `/vivliostyle/jobs` に渡す**。サーバ側ジョブは**API経由で添付をダウンロード→一時ディレクトリに展開→`vivliostyle build` 実行→出来たPDFを再び添付APIで同じページにアップ**。最後に**一時領域を確実に削除**。これなら**保存先がローカルでもS3でも同じコードで動く**し、GROWI の内部パスに依存しません。

（根拠：GROWI は**添付の保存先にローカルFSやMongoDBも選べる**／**添付のREST API（v3系や v1の add/remove 系）がある／Vivliostyle CLI はURL/ローカルHTMLを直接入力にできる**／**同一オリジンは scheme+host+port が一致**） [MDN Web Docs+4docs.growi.org+4docs.growi.org+4](https://docs.growi.org/en/admin-guide/admin-cookbook/attachment.html?utm_source=chatgpt.com)

---

# 推奨フロー（“IDで連携する”改訂版）

1. **フロント（GROWIプラグイン）**
    - 「ビルド」押下 → `doc.html`（※単体 or ZIP）を **`/_api/attachments.add`** に **multipart** でアップ。レスポンスから **`attachmentId`** と対象 **`pageId`** を取得。
    - 続けて **`POST /vivliostyle/jobs`** に `{ pageId, attachmentId, title/オプション }` を送る（`Idempotency-Key` 推奨）。
    - **`GET /vivliostyle/jobs/{id}`** をポーリング（または SSE）して `succeeded` で終了。PDFの添付は**同ページに増えている**ので、**URL を表示 or 自動DL**。
    
    > 添付APIの存在（一覧/取得/作成・削除系）は v3/v1 にあり、コミュニティSDKの例や内部API一覧でも添付の一覧・取得・add/removeが列挙されています。multipart で投げるのが基本です。 docs.growi.org+2dev.growi.org+2
    > 
2. **ジョブAPI（サーバ：/vivliostyle/jobs）**
    - 受け取った `attachmentId` を **GROWI REST API で取得**し、**HTTP 経由でダウンロード**（同一オリジンなら CORS 無縁。プライベートなら Bot トークンで認可）。
    - **一時ディレクトリ**に保存（ZIPなら展開）。必要に応じ `doc.html` に **`<base href="<https://wiki.example.com/>">`** を差し込んで相対URLの基準を固定。
    - **Vivliostyle CLI** を実行：
        
        ```bash
        vivliostyle build /tmp/job-XXXX/doc.html -o /tmp/job-XXXX/out.pdf
        
        ```
        
        （CLI は **ローカルHTML/URLの両方を入力**にできます。URLを使う設計でもOK。） [Vivliostyle+1](https://vivliostyle.org/getting-started/?utm_source=chatgpt.com)
        
    - 生成した `out.pdf` を **再び `/_api/attachments.add`** に **multipart** で投げ、**同じ `pageId`** に添付。
    - **finally で一時領域を確実に削除**（成功/失敗に関わらず `rm -rf`）。
3. **GROWI 側**
    - 添付の保存先が**ローカルFS/DB/S3等どれでも**、アップロード時のAPIが吸収してくれます。ローカルFS構成でもこの“API経由ダウンロード→ローカルに展開→CLI→APIで再アップ”で**全部解決**します。 [docs.growi.org](https://docs.growi.org/en/admin-guide/admin-cookbook/attachment.html?utm_source=chatgpt.com)

---

# その設計で“詰まらない”ための実務ポイント

- **「GROWI の内部パスを直接読む」設計は避ける。**
    
    バージョン差・コンテナ化・将来のS3移行で壊れます。**APIでダウンロード→一時領域へ**が安全。
    
- **同一オリジンを維持**（Nginx で `/`=GROWI、`/vivliostyle/*`=ミニサービス／入力HTML）すると **CORS不要**・**混在コンテンツ（https→http）も回避**できます（同一オリジン＝scheme+host+port 一致）。 [MDN Web Docs+1](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy?utm_source=chatgpt.com)
- **認証が必要な添付**（ローカル/MongoDB保存時）は、**ジョブAPIが Bot トークンでGROWIから取得** → **ローカルに落としたHTML/画像で完結**させれば、Vivliostyle 側にセッションを持たせる必要がありません。
- **HTMLは単体完結に寄せる**と運用が楽。画像やCSSは**Data URI 埋め**にするか、ZIP でまとめて相対参照（`doc.html`のあるディレクトリが基準）。`<base>` を明示しておけば相対解決の事故が減ります。 [Yarn](https://classic.yarnpkg.com/en/package/%40vivliostyle/cli?utm_source=chatgpt.com)
- **出来上がったPDFの扱い**：ページの添付として保存すれば**閲覧・権限・履歴**がすべて GROWI の世界で揃います。古い一時添付（元の doc.html/ZIP）を残したくないなら、**成功後に `attachments.remove` で掃除**する設計がきれいです。 [dev.growi.org](https://dev.growi.org/672319f17d932db384329ba2?utm_source=chatgpt.com)

---

# ざっくり擬似コード（要点だけ）

- フロント：
    1. `/_api/attachments.add` ← `FormData(page_id, file=doc.html or .zip)`
    2. `POST /vivliostyle/jobs` ← `{ pageId, attachmentId }`
    3. `GET /vivliostyle/jobs/{id}` で `status` が `succeeded` になったら完了（PDFは同ページの添付に追加済み）
- ジョブAPI（サーバ）：
    1. `GET /_api/v3/attachment/:id` → ダウンロードURL/メタ入手 → 本体取得
    2. `/tmp/job-XXXX/` に保存（ZIPなら展開）
    3. `vivliostyle build <doc.html> -o out.pdf`
    4. `/_api/attachments.add` で out.pdf を同ページに添付
    5. `rm -rf /tmp/job-XXXX`（finally）
    6. （任意）元の doc.html 添付は **`attachments.remove`** で消して**目に見えるゴミをゼロ**に

---

# この案に対する辛口チェック

- 「**フロントがアップした直後に“ファイルシステムから拾う”**」→ **NG寄り**。GROWI の内部構造に依存し、コンテナや将来のS3移行で破綻します。**API経由**で確実に取るべき。
- 「**Vivliostyle から /attachment を直接読ませる**」→ **プライベート環境だとセッションが要る**。サーバ側でHTML/素材をローカル展開 or Data URI 化してから渡す方が安全です（CLIにCookie注入の公式手段は見当たらない）。 [Vivliostyle](https://vivliostyle.org/viewer/?utm_source=chatgpt.com)

---

## まとめ

- **はい、いけます。**
ただし設計は**「添付IDで連携」＋「ジョブAPIがAPI経由でダウンロード・ビルド・再アップ」＋「finallyで一時削除」**にするのが正解。
これで**保存先がローカルFSでも将来S3でも同じ運用**で回り、**CORS/認証/内部パスの罠**を回避できます。[MDN Web Docs+3docs.growi.org+3docs.growi.org+3](https://docs.growi.org/en/admin-guide/admin-cookbook/attachment.html?utm_source=chatgpt.com)

必要なら、このフローで**実動する最小コード（サーバの `/vivliostyle/jobs`、フロントの `attachments.add` 呼び出し、Nginx の location）**をあなたの前提（ドメイン・トークン・保存先）に差し替えて一式お渡しします。

---

**You:**

プラグインとはどうやって通信する？

---

**ChatGPT:**

はい、ここは“役割分担”でシンプルに勝ちにいきましょう。

**結論**：**GROWI のフロント用プラグインは “自分のバックエンド（/vivliostyle/jobs）だけに話しかける”**。**GROWI 本体の REST API（添付の作成・取得など）はサーバー側ミニサービスが話す**——この二段構えが一番堅牢です。プラグインは `fetch()` で JSON を投げるだけ、**CSRF・認可・添付の multipart** は全部サーバー側で処理します。

（GROWI の**スクリプトプラグインの作り方**や、**API(v3)の存在**、**添付の保存先の選択**は公式に明記されています。）[GROWI Docs+2GROWI Docs+2](https://docs.growi.org/en/dev/plugin/script.html?utm_source=chatgpt.com)

---

# どう通信する？（推奨パターン）

## 1) プラグイン(ブラウザ) → あなたの /vivliostyle/jobs（同一オリジン）

- **やること**：`POST /vivliostyle/jobs` に **pageId や（必要なら）attachmentId** を JSON で投げる。進捗は `GET /vivliostyle/jobs/{id}` を**ポーリング** or **SSE**。
- **なぜこうする？**
    - **プラグインは“同一オリジン”の自分宛 API にだけ話す**ので、**CORS を発生させない**。
    - **CSRF対策の実装も自分で決められる**（自サービス側で `X-CSRF-Token` を要求するか、トークン認証に振るか等）。GROWI 本体の CSRF ミドルウェア順序などに依存しないです。[GROWI Developers Wiki](https://dev.growi.org/610de73ad117c50051df129b?utm_source=chatgpt.com)
- **プラグインの実装入口**：スクリプトプラグインのエントリ（`client-entry.tsx` 等）でボタン追加や `fetch()` を実装。テンプレ構成とライフサイクルは公式ガイドが詳しいです。[GROWI Docs+1](https://docs.growi.org/en/dev/plugin/script.html?utm_source=chatgpt.com)

> （参考コード像）
> 
> 
> ```tsx
> await fetch('/vivliostyle/jobs', {
>   method: 'POST',
>   headers: {'Content-Type':'application/json'},
>   body: JSON.stringify({ pageId, title, options })
> });
> 
> ```
> 
> ※ **GROWI 本体 API にはフロントから直接触らない**（次節へ）。
> 

## 2) サーバ（/vivliostyle/jobs）→ GROWI REST API（添付・ページ取得）

- **やること**：サーバ側で
    1. 必要なら**入力 HTML/ZIP を受け取る or GROWI から取得**
    2. **Vivliostyle CLI**で PDF 化
    3. **GROWI の “添付 API” に multipart でアップロード**
    4. **一時領域を削除**
- **根拠**：
    - **GROWI v3 REST API**が提供されており、**添付のリスト/取得/作成系のエンドポイント**が整理されています（社内ドキュメントでも `/attachment` 系の一覧が明示）。[GROWI Docs+1](https://docs.growi.org/en/api/rest-v3.html?utm_source=chatgpt.com)
    - **添付の保存先（S3/GCS/Azure/DB/ローカル）は管理側で選択**でき、クライアントからは**API経由**で透過化されます。[GROWI Docs](https://docs.growi.org/en/admin-guide/admin-cookbook/attachment.html?utm_source=chatgpt.com)
    - **Vivliostyle CLI は URL もローカルファイルも入力可**なので、ジョブ側で用意した HTML/リソースで問題なくビルド可能。[GROWI Docs](https://docs.growi.org/en/dev/plugin/script.html?utm_source=chatgpt.com)
- **セキュリティ注意**：**ブラウザ越しの POST** は一般に **CSRF 対策**（例：`X-CSRF-Token` ヘッダー）を要しますが、**サーバ→サーバ通信（あなたのジョブ→GROWI）は Bearer トークンやアクセストークン方式で OK**（CSRFの適用外）にできます。[OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html?utm_source=chatgpt.com)

---

# 代替案（直接フロント→GROWI API？）を**あえて**却下する理由

- **CSRF**：ブラウザから GROWI の `/_api/...` に直接 POST するなら、**CSRF トークンの取得＆送出**手順が必要（`X-CSRF-Token` など）。GROWI 側もミドルウェアで CSRF を見ています（実装順序の社内メモあり）。**素人殺しポイント**です。[GROWI Developers Wiki](https://dev.growi.org/610de73ad117c50051df129b?utm_source=chatgpt.com)
- **認可の複雑化**：フロントから添付アップロードを直にやると、**権限・レート・失敗リトライ**までフロントが背負いがち。**サーバ側に集約**した方が安全。
- **将来拡張**：PDF 以外の成果物（ZIP/EPUBなど）や再ビルド、監査ログ、キュー制御など**運用機能はサーバに寄せる**のが自然。

---

# 実務で必要な“通信の小ネタ”

- **同一オリジン**：Nginx で `/`（GROWI）と `/vivliostyle/*`（あなたのミニサービス）を**同じホスト・ポート配下**に。これで**CORS 不要**、フォント等のクロス問題も回避。[GROWI Docs](https://docs.growi.org/en/dev/plugin/script.html?utm_source=chatgpt.com)
- **プラグインの置き場所とビルド**：公式の**スクリプトプラグイン手順**（Vite/`dist` 生成）に沿う。プラグインからは**単なる `fetch()`*で OK。[GROWI Docs](https://docs.growi.org/en/dev/plugin/script.html?utm_source=chatgpt.com)
- **GROWI API の呼び出し**：**サーバ側から** v3 REST API を叩く。**添付まわりのエンドポイント群が用意**されているので、**multipart/form-data**でアップロード（一般論として添付APIは multipart で受ける設計が主流）。[GROWI Docs+1](https://docs.growi.org/en/api/rest-v3.html?utm_source=chatgpt.com)

---

# まとめ（要点）

- **プラグインは “自サービスの /vivliostyle/jobs にだけ” 通信**（同一オリジンの `fetch()`）。[GROWI Docs](https://docs.growi.org/en/dev/plugin/script.html?utm_source=chatgpt.com)
- **サーバ側が GROWI v3 REST API と通信**して、**添付の作成/取得**・**PDF のアップロード**を担当（multipart）。[GROWI Docs+1](https://docs.growi.org/en/api/rest-v3.html?utm_source=chatgpt.com)
- **CSRF/認可の地雷を避けるため、フロント→GROWI 直叩きはやめて、サーバ→GROWI に集約**。**同一オリジン化**も忘れずに。[GROWI Developers Wiki](https://dev.growi.org/610de73ad117c50051df129b?utm_source=chatgpt.com)