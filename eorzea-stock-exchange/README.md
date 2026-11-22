# 艾奧傑亞證券交易所

把 FF14 繁中服「陸行鳥」資料中心的市場板，做成股票看盤 App 的樣子：大盤與類股指數、漲跌與成交排行、K 線、五檔報價、看盤牆、各伺服器比較，以及個人交易紀錄本。

- 網站：https://seiran-ilai.github.io/eorzea-stock-exchange/
- 市場資料：[Universalis](https://universalis.app/)（瀏覽器端即時讀取）
- 繁中物品名稱：[thewakingsands/ffxiv-datamining-tc](https://github.com/thewakingsands/ffxiv-datamining-tc)
- 自選股、交易紀錄等資料只存在使用者自己的瀏覽器，不會上傳。

## 資料更新方式
- GitHub Actions（`.github/workflows/aex-snapshot.yml`）每 30 分鐘執行 `build_snapshot.py`，把成分股行情整理成 `snapshot.json`，強制推送到 `aex-data` 分支（只保留最新一份）。
- 網頁開啟時只讀這一份資料，所以幾乎瞬間載入；個股頁、自選股與交易紀錄的非成分股仍會即時讀取 Universalis。
- 雲端資料超過 3 小時沒更新時，網頁會自動改回瀏覽器直接抓取。

本站為非官方粉絲作品。FINAL FANTASY XIV © SQUARE ENIX CO., LTD. All Rights Reserved.
