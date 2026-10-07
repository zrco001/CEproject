# Phase 1 Ordinary Acceptance Plan — 普通驗收缺口盤點

**基礎提交**：`main` @ `132ca23e6da017d9d716afe7428d67e9c327a97b`（PR #7 合併後）

**Architecture**：`docs/ARCHITECTURE.md`（Architecture Approved v0.3；blob `73aafe2ae0ca175117de08bb37e52b465c42b0ea`，本次未變更）

**範圍**：對照 §11.1 Phase 1 Acceptance Checklist（P1-01～P1-14）與既有
`PHASE-1-METRIC-ACCEPTANCE.md`，整理以下三類項目：已有證據的項目、尚未驗證的項目，以及目前 skeleton 無法驗證的項目。另針對普通 UI、路由與 mobile 操作提出最小手動驗收清單。

**本文件不做的事**：

- 不新增財務定義、計算規則或 tenant 邏輯。
- 不修改程式碼、Architecture、workflow、套件或 lockfile。
- Financial runtime、tenant、安全與 DB 項目只記錄為「待驗證」，不宣稱通過。

---

## 狀態標記

| 標記             | 意義                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **已驗證（CI）** | 有對應的自動化測試或檢查，且 `main` @ `132ca23` 的 CI run [37607229692](https://github.com/zrco001/CEproject/actions/runs/37607229692) 結論為 success。這是 CI 執行紀錄，不是本次重新執行的結果 |
| **未執行**       | 已定義驗收步驟，但尚未實際執行。需要人工在瀏覽器或實機操作                                                                                                                                      |
| **無法驗證**     | Phase 1 skeleton 沒有對應功能（例如表單、資料、權限），等相關 Phase 實作後才能驗收                                                                                                              |
| **待驗證**       | 屬於 financial runtime、tenant、安全或 DB 範圍；需要 DB、隔離環境或另經批准的流程。本文件只記錄，不實作                                                                                         |
| **分支差異**     | 修正存在於未合併的分支，`main` 上尚未具備；需由人決定處理方式                                                                                                                                   |

---

## A. P1-01～P1-14 證據對照（§11.1）

| #     | 項目                      | 現有證據（檔案 / 測試）                                                                                                                                                                                                                           | 狀態                                                                     | 缺口 / 備註                                                                                                                                                                                                                                                                                                            |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 | Monorepo                  | `pnpm-workspace.yaml`、`turbo.json`；CI `verify` job 執行 `pnpm install --frozen-lockfile`                                                                                                                                                        | 已驗證（CI）                                                             | —                                                                                                                                                                                                                                                                                                                      |
| P1-02 | TypeScript strict         | `packages/config/tsconfig/base.json`；CI `pnpm typecheck`                                                                                                                                                                                         | 已驗證（CI）                                                             | —                                                                                                                                                                                                                                                                                                                      |
| P1-03 | ESLint / boundaries       | `packages/config/eslint/*.js`；`packages/config/test/nest-rules.test.js`（7 項：跨 module internals、common→module、composition root、raw SQL、`$queryRawUnsafe`、`any`）                                                                         | 已驗證（CI）                                                             | Web preset 只有規則設定，沒有 fixture 迴歸測試                                                                                                                                                                                                                                                                         |
| P1-04 | Prettier                  | CI `pnpm format:check`                                                                                                                                                                                                                            | 已驗證（CI）                                                             | —                                                                                                                                                                                                                                                                                                                      |
| P1-05 | Vitest                    | shared / api / web / config 測試；CI `pnpm test`                                                                                                                                                                                                  | 已驗證（CI）                                                             | —                                                                                                                                                                                                                                                                                                                      |
| P1-06 | Money                     | `packages/shared/src/money/money.test.ts`                                                                                                                                                                                                         | 已驗證（CI）；**分支差異**                                               | `main` 上的 `Rate.of()` 仍接受最多 6 位小數、整數位數不限，與 NUMERIC(7,4) 不一致。修正與測試只存在於未合併的 `claude/phase-1-review-fixes`（`40e73be`）                                                                                                                                                               |
| P1-07 | BusinessDate              | `packages/shared/src/date/business-date.test.ts`（Asia/Taipei 00:00–08:00 邊界、DST、月份範圍）                                                                                                                                                   | 已驗證（CI）                                                             | —                                                                                                                                                                                                                                                                                                                      |
| P1-08 | State machine definitions | `packages/shared/src/domain/state-machine/machines.test.ts`                                                                                                                                                                                       | 已驗證（CI）                                                             | 只驗證定義本身；runtime 的 guard 條件屬後續 Phase，見 D 節                                                                                                                                                                                                                                                             |
| P1-09 | Metric status definitions | `packages/shared/src/domain/metric-status.test.ts`；`docs/reviews/PHASE-1-METRIC-ACCEPTANCE.md`                                                                                                                                                   | 已驗證（CI；metadata 範圍）                                              | 只驗證 metadata；runtime query、golden、tenant 列為待驗證，見 D 節                                                                                                                                                                                                                                                     |
| P1-10 | NestJS skeleton           | `apps/api/test/app.e2e.test.ts`（health 200 + request id、request id 回傳／替換、helmet、未知路由的錯誤格式、domain error、隱藏內部錯誤、CORS）；`error-response.test.ts`、`logger.options.test.ts`、`zod-validation.pipe.test.ts`、`env.test.ts` | 已驗證（CI）                                                             | 本機 Windows 上 API 測試可能受 SWC 快取 DACL 影響，見 `PHASE-1-METRIC-ACCEPTANCE.md`                                                                                                                                                                                                                                   |
| P1-11 | Next.js shell             | `apps/web/src/components/shell/navigation.test.ts`（9 項）、`app-shell.test.tsx`（4 項）；CI `pnpm build`                                                                                                                                         | 部分已驗證（CI）；**視覺與裝置操作未執行**                               | jsdom 不套用 CSS media query，所以斷點切換、觸控尺寸、safe-area、橫向捲動都沒有自動化證據。PR #6 調整的 sidebar CTA 尺寸也沒有對應測試。見 B 節                                                                                                                                                                        |
| P1-12 | Docker                    | `docker-compose.yml`、`apps/api/Dockerfile`、`apps/web/Dockerfile`；CI `docker` job：兩個 image build + `docker compose config`                                                                                                                   | Image build 與 compose 語法：已驗證（CI）。**Runtime：未驗證；分支差異** | `main` 的 compose 仍使用 `minio/minio:latest` 與 `minio/mc:latest`。這兩個 image 目前無法匿名拉取，`docker compose up` 預期會在 MinIO 失敗。Runtime smoke test 與 image 替換只存在於未合併的 `claude/phase-1-review-fixes`（CI run [37519987062](https://github.com/zrco001/CEproject/actions/runs/37519987062) 成功） |
| P1-13 | CI                        | `.github/workflows/ci.yml`（target、ai-loop-tests、verify、docker）                                                                                                                                                                               | 已驗證（CI）                                                             | `main` 的 workflow 仍使用 Node 20 runtime 的 actions（checkout v4、setup-node v4、pnpm/action-setup v4、setup-buildx v3），GitHub 會顯示 deprecation warning                                                                                                                                                           |
| P1-14 | Gate                      | CI run 37607229692 的 lint / typecheck / test / build 成功                                                                                                                                                                                        | 已驗證（CI）                                                             | 本文件撰寫時未在本機重新執行完整 gate，見 E 節                                                                                                                                                                                                                                                                         |

---

## B. 普通 UI、路由與 mobile 最小手動驗收清單

**前置**：

- `pnpm install` → `pnpm build` → `pnpm --filter @ceproject/web start`（port 3000）。
- 不需要 DB、API、secrets 或 Docker。B 節所有項目都只操作 Web shell。
- 使用 Chrome DevTools Device Toolbar，另加一台實機 iOS Safari（B-06）。

**建議 viewport**：320×568、375×812、768×1024、1024×768、1440×900。

**全部狀態**：未執行。

| #    | 項目               | 操作                                                                                                 | 預期結果                                                                                                                                 | 依據                                                       | 需求                   |
| ---- | ------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------- |
| B-01 | Bottom Nav 顯示    | 在 375 寬開啟 `/`                                                                                    | 底部依序顯示 首頁／工程／新增／帳務／我的；中央「新增」為圓形主按鈕；不顯示 sidebar                                                      | 規格 §四、§9.1；`bottom-nav.tsx`                           | 人工瀏覽器             |
| B-02 | 觸控尺寸           | DevTools 量測 bottom nav 項目、中央 CTA、Quick Add 列、sidebar「新增」                               | 一般可點擊區 ≥ 48px；中央 CTA 與 sidebar CTA ≥ 56px；Quick Add 每列高度 ≥ 56px                                                           | §9.4；`button.tsx`、PR #6                                  | 人工瀏覽器             |
| B-03 | 無橫向捲動         | 在 320 與 375 寬逐一開啟 `/`、`/projects`、`/finance`、`/me`、`/expenses/new`、`/settings/employees` | 頁面不出現水平捲動條；左右滑動不位移                                                                                                     | 規格 §三                                                   | 人工瀏覽器             |
| B-04 | Quick Add 開關     | 點中央「新增」→ 依序以關閉鈕、遮罩、Esc 關閉；再開啟並點「新增支出」                                 | Sheet 從底部出現，有拖曳把手；三種方式都能關閉；選擇項目後 sheet 關閉，並導向 `/expenses/new` placeholder                                | §9.1；`app-shell.test.tsx` 已在 jsdom 驗證開啟與選擇後關閉 | 人工瀏覽器             |
| B-05 | Quick Add 文案     | 開啟 Quick Add 檢視所有項目                                                                          | 共 8 項，順序與 `navigation.test.ts` 一致；有「新增收款」與「其他收入 / 收入認列」；沒有「新增收入」                                     | v0.2 命名；`navigation.test.ts`                            | 人工瀏覽器（目視確認） |
| B-06 | Safe-area          | 在有 Home Indicator 的 iPhone 上，用 Safari 開啟首頁並捲到底                                         | Bottom nav 不被 Home Indicator 遮住；最後一段內容不被 bottom nav 蓋住                                                                    | §9.4；`viewportFit: 'cover'`                               | **實機 iOS Safari**    |
| B-07 | Active 狀態        | 直接開啟 `/finance/receipts/new`、`/projects`、`/settings/employees`                                 | 依序由「帳務」、「工程」、「我的」標示 active（醒目色，`aria-current="page"`）；其他 tab 不標示                                          | `matchesPath`；`app-shell.test.tsx`                        | 人工瀏覽器             |
| B-08 | Icon rail          | 在 768 與 1023 寬開啟 `/finance/expenses`                                                            | 左側為窄 rail，顯示群組圖示與文字標籤（不依賴 hover）；「帳務」標示 active；不顯示 bottom nav；「新增」開啟置中 dialog                   | §9.1                                                       | 人工瀏覽器             |
| B-09 | 完整 Sidebar       | 在 1024 與 1440 寬開啟 `/`                                                                           | 群組依序為 Dashboard、工程管理、帳務、估驗請款、廠商、業主、報表、文件、系統設定；帳務群組含「收入認列」「支出審核」；點任一項目到對應頁 | 規格 §五；`navigation.test.ts`                             | 人工瀏覽器             |
| B-10 | 帳務 Hub           | 在 375 寬點底部「帳務」，逐一點擊清單項目                                                            | 共 8 項大按鈕；每項都進入對應 placeholder 頁，標題正確                                                                                   | §9.2；`finance/page.tsx`                                   | 人工瀏覽器             |
| B-11 | Placeholder 與 404 | 開啟 `/billings`、`/vendors`、`/reports`；再開啟 `/nope`                                             | 前三頁顯示標題與「預計於 Phase N 實作」；`/nope` 顯示「找不到頁面」與「回到首頁」CTA                                                     | `[...slug]/page.tsx`（`dynamicParams = false`）            | 人工瀏覽器             |
| B-12 | 鍵盤與焦點         | 只用 Tab / Shift+Tab / Enter / Esc 操作 sidebar 與 Quick Add                                         | 焦點外框清楚可見；dialog 開啟時焦點限制在 dialog 內；Esc 關閉後焦點回到觸發按鈕                                                          | Radix Dialog；`globals.css` focus-visible                  | 人工瀏覽器             |
| B-13 | 上一頁             | 經 Quick Add 進入某頁後按瀏覽器「上一頁」                                                            | 回到原頁，sheet 維持關閉                                                                                                                 | —                                                          | 人工瀏覽器             |
| B-14 | 橫向               | 手機橫向（812×375）開啟 `/` 與 Quick Add                                                             | 版面不破版；sheet 內容可捲動，最大高度不超出畫面                                                                                         | `sheet.tsx`（`max-h-[85dvh]`）                             | 人工瀏覽器（或實機）   |
| B-15 | 深色模式           | 系統切換為深色後重新整理                                                                             | 文字、邊框、active 狀態可辨識；沒有白底白字                                                                                              | `globals.css` dark tokens                                  | 人工瀏覽器（目視）     |
| B-16 | 頁面標題           | 檢查 `/`、`/finance`、`/vendors` 的瀏覽器分頁標題                                                    | 格式為「首頁｜工程帳務管理」等                                                                                                           | `layout.tsx` metadata template                             | 人工瀏覽器             |

執行後請在每列記錄：日期、瀏覽器與版本、裝置、結果（PASS / FAIL）、截圖位置。沒有實際執行的項目一律維持「未執行」。

---

## C. 目前 skeleton 無法驗證的普通項目

這些項目沒有對應功能，等相關 Phase 實作後才能驗收：

| 項目                                                  | 依據            | 預計 Phase |
| ----------------------------------------------------- | --------------- | ---------- |
| 金額輸入使用數字鍵盤（`inputMode`）、16px 防 iOS 縮放 | 規格 §三、§9.4  | 5          |
| 重要操作 3 次點擊內完成、快速支出 20–30 秒            | 規格 §三、§十八 | 5          |
| Desktop Table 在 Mobile 轉為 Card（`ResponsiveList`） | 規格 §三        | 4–5        |
| 依權限顯示 Quick Add / 選單項目（`<Can>`）            | §8.3、§9.1      | 3          |
| 表單錯誤訊息與送出失敗不清空                          | 規格 §二十      | 5          |
| Dashboard KPI 實際數值（目前顯示「—」）               | §3.4            | 8          |
| PWA 安裝、Offline Draft、相機                         | 規格 §二十      | 5、9       |

---

## D. Financial runtime、tenant、安全與 DB — 待驗證（本文件不實作、不宣稱通過）

| 項目                                                                                  | 需求                           |
| ------------------------------------------------------------------------------------- | ------------------------------ |
| Metric runtime query、golden value、多筆 RetentionRelease 選取順序                    | DB、經批准的 golden fixtures   |
| Tenant / project scope 隔離與 tenant-leak tests（ADR-06、ADR-19、ADR-24）             | DB、隔離環境                   |
| State machine guard 的 runtime 執行（例如 allocation 為 0 才可作廢）                  | DB、use case 實作              |
| Auth、CSRF、cookie 屬性、權限矩陣（§2.5、§8.3）                                       | Phase 3、人工監督              |
| 敏感欄位加密、redaction 的實際資料流（§2.8）                                          | Phase 3–4                      |
| DB constraints、composite FK、Prisma manual constraint PoC（ADR-34、§11.2 Gate 0）    | 拋棄式本機 DB、人工監督        |
| Docker runtime（PostgreSQL / MinIO / Mailpit / api / web 實際啟動）在 `main` 上的狀態 | Docker 環境；見 P1-12 分支差異 |
| iOS Safari 實機行為                                                                   | 實機                           |

---

## E. 本次執行紀錄

- **建立方式**：唯讀檢視 `main` @ `132ca23` 的檔案、測試名稱、git 差異與 GitHub CI 結果，再新增本文件。
- **執行的檢查**：只對文件變更執行既有格式檢查，結果記錄於 PR／回報。
- **未執行**：lint、typecheck、test、build 都沒有在本機重新執行；B 節手動驗收全部未執行；未建立或操作任何 DB；未讀取 secrets；未執行 Docker。
- **分支處理**：`claude/phase-1-review-fixes`（`8392fe9`）維持原樣，未合併、未 reset、未 force-push。它包含 P1-06 與 P1-12 的修正，是否合併或重新提出由人決定。

---

READY FOR REVIEW
