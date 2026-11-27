# 艾奧傑亞證券交易所

把 FF14 繁中服「陸行鳥」資料中心的市場板，做成股票看盤 App 的樣子：大盤與類股指數、漲跌與成交排行、K 線、五檔報價、看盤牆、各伺服器比較，以及個人交易紀錄本。

- 網站：https://seiran-ilai.github.io/eorzea-stock-exchange/
- 市場資料：[Universalis](https://universalis.app/)（瀏覽器端即時讀取）
- 繁中物品名稱：[thewakingsands/ffxiv-datamining-tc](https://github.com/thewakingsands/ffxiv-datamining-tc)
- 自選股、交易紀錄等資料只存在使用者自己的瀏覽器，不會上傳。

## 檔案
| 檔案 | 內容 |
|---|---|
| `index.html` | 頁面骨架 |
| `css/style.css` | 樣式 |
| `js/items.js` | 物品資料（改版時整份替換；`build_snapshot.py` 也讀這個檔） |
| `js/core.js` | 常數、工具、請求節流與快取、狀態 |
| `js/data.js` | 資料載入、自動更新排程、指標計算 |
| `js/charts.js` | 圖表 |
| `js/ui.js` | 外框、選單、搜尋、跑馬燈 |
| `js/views.js` | 各頁面 |
| `js/journal.js` | 交易紀錄本 |
| `js/main.js` | 路由、事件、啟動 |

改完程式記得把 `index.html` 裡的 `?v=日期` 改掉，避免使用者拿到新舊混合的快取。

## 資料更新方式（每 00、30 分）
- `build_snapshot.py` 把成分股行情整理成 `snapshot.json`（約 340KB gzip）與 `meta.json`（只有時間），強制推送到 `aex-data` 分支（只保留最新一份）。同一個半小時時段已經跑過就跳過。
- 網頁：開站讀 `snapshot.json`；之後每個 00、30 分過 2 分鐘看一次 `meta.json`，有新的才下載完整行情。這些都走 GitHub CDN，不經過 Universalis。
- 雲端資料超過 75 分鐘沒更新時，每個時段由瀏覽器向 Universalis 補抓一次「上次之後」的新成交（約 3 個請求）。分頁在背景時不更新。
- 手動「重新整理」先看雲端有沒有新資料，沒有才向 Universalis 補抓；10 分鐘內只能按一次。
- 個股頁、自選股與交易紀錄的非成分股仍會即時讀取 Universalis。

### 準時觸發（重要）
GitHub 的 `schedule` 常延誤數小時（2026-11 實測一天只跑 2～3 次），所以用外部定時服務（例如 cron-job.org，免費）在每 00、30 分呼叫：

```
POST https://api.github.com/repos/seiran-ilai/seiran-ilai.github.io/actions/workflows/aex-snapshot.yml/dispatches
Authorization: Bearer <fine-grained token：只授權這個 repo 的 Actions: Read and write>
Accept: application/vnd.github+json
Body: {"ref":"main"}
```

本站為非官方粉絲作品。FINAL FANTASY XIV © SQUARE ENIX CO., LTD. All Rights Reserved.
