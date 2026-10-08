# Responsive Navigation Check

**Branch**：`claude/responsive-navigation`

**基礎**：疊在 `claude/quick-add-interactions`（`3516cd6`）之上，因為各尺寸的焦點恢復檢查需要那個修正。該修正在本文撰寫時尚未合併到 `main`（`132ca23`）。

**規格依據**：Architecture Approved v0.3 §9.1。

- < 768px：Bottom Navigation
- 768–1023px：icon rail
- ≥ 1024px：完整 Sidebar

## 發現並修正的問題

| 問題                                                                                                                                                                       | 修正                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 在 1024px 以上開啟 `/settings/employees` 時，完整 Sidebar 同時把「系統設定」（`/settings`）與「員工」（`/settings/employees`）標成目前頁面，出現兩個 `aria-current="page"` | 新增 `mostSpecificActiveHref()`，只標記路徑最長（最具體）的那一個連結 |

沒有發現其他斷點、橫向捲動或 Quick Add 問題。

---

## 1. 瀏覽器實測

**環境**：

- Google Chrome 155.0.8059.39（headless），以 DevTools Protocol 操作。
- 測試腳本只放在本機暫存目錄，不屬於 repo，也沒有新增套件。
- 對象為 `next build` + `next start` 的 production build。
- 寬度小於 768px 時啟用 mobile 與 touch 模擬。

**執行時間**：2026-10-07，修正後重新完整執行一次。

### 版面（6 種尺寸 × 5 條路徑，共 30 項）

測試路徑：`/`、`/projects`、`/finance/receipts/new`、`/settings/employees`、`/finance/expenses`。

| 尺寸     | Bottom Nav | Sidebar（寬度） | Icon rail | 完整 Sidebar | 橫向溢出              | 結果 |
| -------- | ---------- | --------------- | --------- | ------------ | --------------------- | ---- |
| 320×568  | 顯示       | 隱藏            | —         | —            | 無（scrollWidth 320） | PASS |
| 375×812  | 顯示       | 隱藏            | —         | —            | 無（scrollWidth 375） | PASS |
| 768×1024 | 隱藏       | 顯示（80px）    | 顯示      | 隱藏         | 無                    | PASS |
| 1023×768 | 隱藏       | 顯示（80px）    | 顯示      | 隱藏         | 無                    | PASS |
| 1024×768 | 隱藏       | 顯示（256px）   | 隱藏      | 顯示         | 無                    | PASS |
| 1440×900 | 隱藏       | 顯示（256px）   | 隱藏      | 顯示         | 無                    | PASS |

**橫向溢出的判定方式**：`documentElement` 與 `body` 的 scrollWidth 都不大於 viewport 寬度，且沒有任何可見元素超出左右邊界。

### Active 標示

每頁都恰好只有一個可見的 `aria-current="page"`：

| 路徑                    | 375（Bottom Nav） | 768（rail） | 1024 / 1440（Sidebar）                     |
| ----------------------- | ----------------- | ----------- | ------------------------------------------ |
| `/`                     | 首頁              | Dashboard   | Dashboard                                  |
| `/projects`             | 工程              | 工程管理    | 工程                                       |
| `/finance/receipts/new` | 帳務              | 帳務        | 收款                                       |
| `/finance/expenses`     | 帳務              | 帳務        | 支出                                       |
| `/settings/employees`   | 我的              | 系統設定    | 員工（修正前為「系統設定」與「員工」兩項） |

### Quick Add（6 種尺寸 × 4 種關閉方式，共 24 項）

**觸發按鈕**：

- < 768px：Bottom Nav 中央按鈕，56×56。
- 768–1023px：rail 的「新增」，63×56。
- ≥ 1024px：Sidebar 的「新增」，231×56。

**四種關閉方式**：

- 關閉鈕
- 點遮罩（點擊座標 5,5）
- 按 Esc
- 選「新增收款」

**每項都確認**：

- 開啟後焦點在 sheet 內。
- 開啟時 `aria-expanded="true"`。
- 關閉後 sheet 消失，焦點回到開啟它的按鈕，`aria-expanded="false"`。
- 選項會導向 `/finance/receipts/new`。

**Sheet 位置**：< 768px 從底部出現、與畫面同寬；≥ 768px 為置中的 448px 對話框。

**結果**：24 / 24 PASS。

### 未執行（需要人工或實機）

- iOS Safari 實機：safe-area 與 Home Indicator（驗收計畫 B-06）。
- 真實手指觸控與捲動手感。以上檢查只用 touch 模擬加滑鼠事件，不能代替實機操作。
- 實體鍵盤的 Tab 順序與焦點外框是否清楚（B-12）。
- Firefox、Safari 等其他瀏覽器。

---

## 2. 自動測試（jsdom，Vitest）

| 檔案                                            | 內容                                                                                                                                                                                                                                  | 結果 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `responsive-navigation.test.tsx`（新增，11 項） | 斷點 class 契約，因為 jsdom 不執行 CSS media query：`md:hidden`、`hidden md:flex`、`lg:hidden`、`hidden lg:block`、`md:pl-20 lg:pl-64`。另驗證 6 條路徑在 Bottom Nav、rail、完整 Sidebar 各只有一個 active，以及未登錄路徑沒有 active | PASS |
| `navigation.test.ts`（+1 項）                   | `mostSpecificActiveHref()`                                                                                                                                                                                                            | PASS |
| `quick-add-sheet.test.tsx`（既有，6 項）        | 開啟、關閉鈕、遮罩、Esc、選項導頁、焦點回到觸發按鈕                                                                                                                                                                                   | PASS |

`/settings/employees` 的 active 測試在修正前失敗、修正後通過。

完整檢查結果見本分支的提交回報。
