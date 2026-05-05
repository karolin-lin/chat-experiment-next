# 亞洲家長對話實驗

Next.js + Vercel 版本。

## 本地開發

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數
cp .env.example .env.local
# 編輯 .env.local，填入你的 GEMINI_API_KEY

# 3. 啟動開發伺服器
npm run dev
# 開啟 http://localhost:3000
```

## 部署到 Vercel

1. 把這個資料夾推到 GitHub（新建一個 repo）
2. 到 [vercel.com](https://vercel.com) → New Project → Import 你的 repo
3. 在 Vercel 的 **Environment Variables** 設定：
   - `GEMINI_API_KEY` = 你的 Gemini API Key
4. Deploy

## 環境變數

| 變數 | 說明 |
|------|------|
| `GEMINI_API_KEY` | 必填，從 [Google AI Studio](https://aistudio.google.com/) 取得 |
| `GEMINI_MODEL` | 選填，預設 `gemini-2.5-flash-lite` |
