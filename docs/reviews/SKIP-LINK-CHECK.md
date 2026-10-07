# Skip Link Check — 跳到主要內容

**Branch**：`claude/responsive-navigation`（接續已核准的 `98e798b`）

**範圍**：在既有 AppShell 新增「跳到主要內容」連結。

- 用鍵盤 Tab 時顯示，按 Enter 後焦點移到主內容。
- 驗證手機、平板、桌面的鍵盤操作與焦點外框。

`KEYBOARD-FOCUS-CHECK.md` 的「觀察 1」記錄過缺少此連結，本段處理該項。

## 實作

| 檔案                                                  | 內容                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/shell/skip-link.tsx`（新增） | `<a href="#main-content">跳到主要內容</a>`，放在 AppShell 最前面，所以在每個尺寸都是第一個 Tab 停點 |
| `apps/web/src/components/shell/app-shell.tsx`         | 加入 `<SkipLink />`；`<main>` 加上 `id="main-content"`、`tabIndex={-1}`、`focus:outline-none`       |

**顯示方式**：

- 平時以 `-translate-y-[calc(100%+1rem)]` 移到畫面上方外側，看不見。
- 取得焦點時 `focus:translate-y-0`，出現在左上角（`fixed top-3 left-3`）。
- 高度 48px，外觀為主色按鈕。
- `z-[45]`：位於 Sidebar（z-30）與 Bottom Nav（z-40）之上、Quick Add sheet（z-50）之下。
- 焦點外框沿用全域的 2px `--ring` 規則，沒有另外定義。

**行為**：

- 按 Enter 或點擊時，程式把焦點移到 `<main>`，不在網址加上 `#main-content`。
- 沒有 JavaScript 時，原生的 `#main-content` 錨點仍可運作。

**`<main>` 不顯示外框的理由**：它只是焦點落點，不是可操作的元件。在整個內容區畫一圈外框容易被誤認為可點擊；下一次按 Tab 就會進入主內容的第一個可操作元素。

---

## 1. 瀏覽器實測

**環境**：

- Google Chrome 155.0.8059.39（headless），以 DevTools Protocol 送出真實鍵盤事件（Tab、Shift+Tab、Enter、Esc）。
- 腳本只放在本機暫存目錄，不屬於 repo，也沒有新增套件。
- 尺寸：375×812（手機）、768×1024（平板）、1440×900（桌面）。
- 路徑：`/finance/receipts/new`（placeholder，主內容沒有可聚焦元素）、`/finance`（主內容有 8 個連結）。
- 執行時間：2026-10-07。

**執行對象**：

1. `http://127.0.0.1:3001`（`next dev`）。
2. production build（`next build` + `next start`）複驗。

兩者結果相同。dev 模式多出的 Next.js dev 指示器停點不列入判定。

### 跳到主要內容

| 檢查                                                       | 375                             | 768              | 1440                       |
| ---------------------------------------------------------- | ------------------------------- | ---------------- | -------------------------- |
| 取得焦點前不可見（位於畫面上方外側，bottom = −4px）        | PASS                            | PASS             | PASS                       |
| 第一次 Tab 就聚焦到此連結（也是 DOM 中第一個連結或按鈕）   | PASS                            | PASS             | PASS                       |
| 聚焦後完整顯示於畫面內（12,12 起，128×48）                 | PASS                            | PASS             | PASS                       |
| `:focus-visible` 外框為 2px solid，沒有被裁切              | PASS                            | PASS             | PASS                       |
| 外框對比 6.62:1（≥ 3:1）                                   | PASS                            | PASS             | PASS                       |
| 按 Enter 後焦點移到 `main#main-content`，網址沒有加上 hash | PASS                            | PASS             | PASS                       |
| 焦點移走後連結再次隱藏                                     | PASS                            | PASS             | PASS                       |
| `/finance` 上下一次 Tab 進入主內容第一個連結「收入認列」   | PASS                            | PASS             | PASS                       |
| `/finance/receipts/new` 上下一次 Tab 不會回到 Sidebar      | PASS（進入 Bottom Nav「首頁」） | PASS（離開頁面） | PASS（離開頁面後回到起點） |

截圖已目視確認：三個尺寸下連結都清楚顯示在左上角、有完整外框。聚焦期間會暫時蓋住頁面標題或 Sidebar 標題，這是 skip link 的常見做法，焦點移開後即恢復。

### 迴歸（同一輪執行）

| 檢查                                                   | 結果                        |
| ------------------------------------------------------ | --------------------------- |
| Tab 順序：skip link → 原本的順序。Shift+Tab 為完全反序 | PASS（3 個尺寸 × 2 條路徑） |
| Quick Add：Tab、Shift+Tab 各 12 次都留在 sheet 內      | PASS（6 組，每組 24 次）    |
| Quick Add：Esc 關閉並回到開啟它的按鈕                  | PASS（6 組）                |
| 所有停點的外框沒有被裁切，對比 ≥ 3:1（最低 5.94:1）    | PASS                        |

### 未執行（需要人工或實機）

- 真人使用實體鍵盤的主觀判斷。
- 螢幕閱讀器（NVDA、VoiceOver）朗讀此連結與移動焦點的實際效果。
- Windows 高對比 / `forced-colors`。
- Firefox、Safari，以及 iOS／Android 外接鍵盤。
- 淺色主題下的外框對比（headless Chrome 以深色主題呈現）。

---

## 2. 自動測試（jsdom，Vitest）

`skip-link.test.tsx`（新增 4 項）：

| 測試                                                                                                          | 結果 |
| ------------------------------------------------------------------------------------------------------------- | ---- |
| 第一次 Tab 聚焦到「跳到主要內容」，`href="#main-content"`                                                     | PASS |
| 按 Enter 後焦點在 `<main id="main-content" tabIndex={-1}>`，下一次 Tab 直接到主內容第一個按鈕（跳過 Sidebar） | PASS |
| 點擊時同樣把焦點移到 `<main>`                                                                                 | PASS |
| 實作所用的 class：平時隱藏於畫面外、聚焦時顯示；`<main>` 不顯示外框                                           | PASS |

**jsdom 的限制**：不套用 CSS，所以實際位置、可見性與外框都以上面的瀏覽器實測為準。
