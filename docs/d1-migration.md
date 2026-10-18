# D1 マイグレーション運用

D1 のマイグレーションは **Cloudflare 側の既存 Worker プロジェクト**で管理します。Capacitor アプリの起動時には実行しません。モバイルクライアントに D1 管理用の token や任意 SQL 実行 API を配布しないでください。

## プロジェクト内の配置

```text
worker/
  wrangler.toml          # または wrangler.jsonc
  migrations/
    0001_create_users.sql
    0002_add_user_index.sql
  src/
    index.ts
```

Wrangler の D1 binding 名（例: `DB`）、database ID、`migrations_dir` を既存設定で確認します。SQL は追加のみとし、適用済みファイルは変更せず新しい番号で次のファイルを作ります。サーバーコードとスキーマの前後互換を考慮し、列追加→データ移行→旧列削除のような段階的変更を行ってください。

```sh
# worker/ ディレクトリで実行。データベース名は自身の設定に置き換える。
npx wrangler d1 migrations list <DATABASE_NAME> --local
npx wrangler d1 migrations apply <DATABASE_NAME> --local
```

本番の適用はバックアップと変更レビュー、ステージングでの検証の後、デプロイ手順の中で `--remote` を付けて明示的に行います。`--local` と `--remote` を取り違えないでください。このライブラリは本番 DB への適用コマンドを自動実行しません。

```sh
npx wrangler d1 migrations list <DATABASE_NAME> --remote
npx wrangler d1 migrations apply <DATABASE_NAME> --remote
```

Wrangler が管理する適用履歴を使います。Capacitor 側に独自の `d1_migrations` テーブル、SQL ファイルのパーサー、起動時 migration runner は作りません。SQL を投稿して実行できる `/migrations/apply` エンドポイントも作りません。ロールバックが必要な場合は、バックアップからの復旧または新しい修正 migration を個別に計画します。

検証では、旧版アプリ/新版アプリ双方の API レスポンス互換性、認証に利用する D1 テーブル、失敗時のデプロイ停止を確認します。D1 からデータを消す操作や本番 migration の実行は、この文書の手順を参照するだけでは自動では行われません。
