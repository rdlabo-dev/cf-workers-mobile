# D1 を使う Workers の Capacitor 移行

このライブラリの目標は Workers の fetch handler を Capacitor でも最小限の変更で動かすことです。ただし D1 はサーバーの権限付き binding です。端末から D1 を直接実行する互換 binding、任意 SQL を受け付ける D1 proxy、Cloudflare API token をアプリに埋め込む方式は提供しません。D1 を使う処理は Cloudflare 側に残し、**認証・認可済みの業務 REST API** として公開します。オフラインで D1 データを操作する機能も、この方式では提供しません。

## 境界

| 実行場所              | 担当                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| Cloudflare Worker     | D1 binding、認証・認可、入力検証、業務処理、マイグレーション済みのスキーマ |
| Capacitor 内の Worker | UI 向けのローカル処理と、必要に応じて業務 API への HTTP 呼び出し           |
| Capacitor UI          | ログイン状態の取得、ユーザー権限での API 呼び出し                          |

既存 Worker の D1 利用箇所をサーバー専用に分離し、HTTP の入出力（パス・メソッド・レスポンス型）を契約にします。D1 の `prepare()` / `batch()` / `exec()` を HTTP で公開しないでください。Cloudflare 側は従来どおり `env.DB` を使用します。端末側の `env.DB` は存在しません。`cloudflare:workers` の named `env` も D1 を自動取得しません。未設定 binding の参照はエラーです。共通コードがある場合も D1 を使うモジュールを Capacitor のバンドルから外してください。

`capacitorWorkers({ baseURL })` の URL とパスの境界に一致する fetch は**ローカルに横取り**されます。リモート API はその境界の外（推奨: 別 origin）に置き、絶対 HTTPS URL を使ってください。例えば `baseURL: "https://local.invalid/api/"` と `https://api.example.com/v1/` の組み合わせなら `/api/` はローカル、`https://api.example.com/v1/` はネットワークです。`baseURL` に本番 API の origin と同じパスを指定して、本番 API への通信を期待してはいけません。

## Workers 側の REST 契約

既存の D1 クエリを、認証済みユーザー単位の業務操作に変換します。例えば `GET /v1/users/me` と `PATCH /v1/users/me`。ID やグループ ID を受け取る API では、毎回サーバー側で所属と権限を確認します。クライアント指定の `userId` やロールを信用しないでください。

```ts
// Cloudflare にデプロイする Worker。Capacitor のバンドルには含めない。
type Env = { DB: D1Database };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/v1/users/me")
      return new Response("Not found", { status: 404 });

    // verifySession はアプリ固有: Cookie または ID token を検証し、
    // サーバー側で失効と有効期限を確認してから userId を返す。
    const userId = await verifySession(request, env);
    if (!userId) return new Response("Unauthorized", { status: 401 });
    const user = await env.DB.prepare(
      "SELECT id, display_name FROM users WHERE id = ?",
    )
      .bind(userId)
      .first();
    return user
      ? Response.json(user)
      : new Response("Not found", { status: 404 });
  },
};
```

`verifySession` は疑似コードです。ユーザーごとの D1 セッション管理、Cookie 検証、Firebase ID token 検証など、**既存のサーバー側認証**に置き換えてください。ユーザーログインが無いアプリでも、公開可能な読み取り API 以外の権限操作には別の認可主体（例: 招待、端末登録、サービス経由の委任）が必要です。「ログインが無い」ことを秘密の共通 API キーを配布する理由にしないでください。

## Capacitor 側からの呼び出し

`@rdlabo/capacitor-workers/auth` の `createSecureClient` は送信先を単一 HTTPS API root に制限する薄い fetch ヘルパーです。認証方式、ログイン、token 更新、保管、401 処理はアプリに委ねます。Cloudflare 管理 API の token は渡さず、**ユーザーごと**の token のみ取得してください。自動 401 リトライはしません（POST の二重送信を防ぐため）。リダイレクトは `manual` です。

```ts
import { createSecureClient } from "@rdlabo/capacitor-workers/auth";

const api = createSecureClient({
  baseURL: "https://api.example.com/v1/",
  authProvider: {
    getToken: async () => currentUser?.getIdToken() ?? undefined,
  },
});
const response = await api.fetch("users/me");
if (response.status === 401) {
  // アプリのログイン画面または明示的な token 更新へ。書き込みは自動再試行しない。
}
```

`authProvider` を省略すれば公開 API に使えます。Cookie セッションなら `credentials: "include"` を指定できますが、ブラウザとネイティブ transport で Cookie jar / `Set-Cookie` / SameSite の挙動は同一とは限りません。**Cookie 認証が Capacitor の各プラットフォームで動くと仮定せず**、ログインから再起動・失効まで実機で検証してください。ブラウザでクロスオリジン Cookie を使う場合は CORS と Cookie 属性も設定します。Cookie を JavaScript で読み取って Authorization ヘッダーへコピーしないでください。

Firebase Authentication 等の外部認証はユーザーの ID token を取得して送るだけでは完結しません。Cloudflare Worker 側で署名、issuer、audience、有効期限などを検証し、D1 のレコードへのアクセスを認可してください。token を bundle、ログ、URL、`env` の公開設定に保存しないでください。ローカル Worker の `env` に認証済み API client を差し込むことも可能ですが、これはサーバー権限にはなりません。ユーザー資格情報の取得元とライフサイクルはアプリ側で管理します。

UI からの外部 fetch は実行モードによって WebView のブラウザ fetch になり、CORS 制限を受けます。ローカル Worker 内からの outbound fetch にはネイティブ transport が使われる経路があり、そちらはブラウザ CORS による保護を提供しません。`createSecureClient` は transport を切り替えません。認証方式ごとに、実際に呼び出す場所と iOS/Android 両方の通信経路を確認してください。CORS、API URL の秘匿、クライアント内の token 保存だけをアクセス制御と見なさず、Workers 側で認証・認可、入力制限、レート制限、監査を行います。

## 切り出し手順

1. Workers 内の D1 呼び出し・認証処理・秘密情報を棚卸しし、Capacitor に含めないサーバー専用モジュールへ分ける。
2. UI が必要とする操作ごとに REST エンドポイントを定義し、ユーザー/テナント境界を Workers 側で検証する。
3. 認証方式を選ぶ（公開、Cookie セッション、外部 ID token など）。ログイン・失効・CSRF（Cookie 使用時）・リプレイ耐性を確認する。
4. Capacitor 内の D1 呼び出しを HTTPS 業務 API 呼び出しに置き換える。オフライン時のエラー表示を設計する。
5. [D1 マイグレーション手順](d1-migration.md)に従って Cloudflare 側のスキーマを先に適用する。
6. 権限外アクセス、認証期限切れ、通信失敗、更新競合、ブラウザと iOS/Android の実通信をテストする。

この変更は **D1 を使うコードまで無変更で移すものではありません**。移行の最小変更範囲は、D1 を含まない fetch handler と UI の HTTP 契約です。
