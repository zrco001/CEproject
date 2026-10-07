# 本地開發快速入門 — 開發者冒煙測試指南

> **資料來源說明：** 本指南所有指令與 URL 均取自儲存庫根目錄的 `README.md` 與 `.env.example`。本指南作者及 Codex 均未於此任務中實際啟動應用程式，所有執行時的結果均屬未驗證，請以實際環境為準。

---

## 前置需求

以下需求記載於 `README.md`：

| 需求    | 版本                                                   |
| ------- | ------------------------------------------------------ |
| Node.js | ≥ 22.12（建議 24，詳見 `.nvmrc`）                      |
| pnpm    | 10 — 透過 `corepack enable` 或 `npm i -g pnpm@10` 安裝 |
| Docker  | 用於啟動 PostgreSQL 16、MinIO 及 Mailpit 容器          |

---

## 設定步驟

請在儲存庫根目錄依序執行以下指令。

**1. 安裝相依套件**

```bash
pnpm install
```

**2. 建立本地環境設定檔**

```bash
cp .env.example .env
```

開啟 `.env`，將每個 `<placeholder>` 替換為實際值。需替換的佔位符如下：

| 變數                   | 佔位符                                                  |
| ---------------------- | ------------------------------------------------------- |
| `POSTGRES_PASSWORD`    | `<change-me-local-db-password>`                         |
| `DATABASE_URL`         | 含相同密碼佔位符                                        |
| `S3_ACCESS_KEY_ID`     | `<change-me-minio-user>`                                |
| `S3_SECRET_ACCESS_KEY` | `<change-me-minio-password>`（MinIO 要求至少 8 個字元） |

請勿提交 `.env` 或真實憑證。

**3. 啟動支援服務**

```bash
docker compose up -d
```

依 `README.md` 記載，此指令會啟動 PostgreSQL 16、MinIO（含 bucket 建立）及 Mailpit。

**4. 啟動開發伺服器**

```bash
pnpm dev
```

---

## 冒煙測試檢查清單

以下為完成步驟 4 後，確認 Web UI 與 API 是否正常運行的**操作程序**。此清單描述待執行的步驟，並非已驗證的測試結果；本指南不主張任何特定執行時行為。

### Web（Next.js）

- [ ] 在瀏覽器中開啟 `http://localhost:3000`。
- [ ] 頁面載入且無連線錯誤。

### API（NestJS）

- [ ] 在瀏覽器或以 `curl` 存取 `http://localhost:4000/api/v1/health`。
- [ ] 收到回應（回應內容的格式與結構請以 API 原始碼為準；`README.md` 未記載 health-check 的 payload 結構）。

### 支援服務（選用確認）

- [ ] MinIO 管理介面：`http://localhost:9001` — 記載於 `README.md`。
- [ ] Mailpit UI：`http://localhost:8025` — 記載於 `README.md`。

---

## 品質閘門（提交前）

以下指令記載於 `README.md` 與 `CLAUDE.md`：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# 一次執行以上全部：
pnpm check
```

> **注意：** CI 環境可能執行此處未列出的額外檢查，請以 `.github/` 工作流程為準。

---

## 容器映像檔建置（選用）

若需在開發服務旁同時建置並啟動 `api` 與 `web` Docker 映像檔：

```bash
docker compose --profile app up -d --build
```

此指令記載於 `README.md`，與 `pnpm dev` 開發流程相互獨立。

---

## 本指南範圍說明

本指南僅涵蓋本地啟動冒煙測試。以下主題請參閱其他文件：

- 資料庫 Migration — 請見 `CLAUDE.md` 與 `docs/ARCHITECTURE.md` ADR-34 的 Phase 2 Gate 需求。
- 驗證與金鑰設定。
- 正式環境部署。
- Turborepo 任務快取與遠端快取設定。
