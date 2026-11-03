# ねこ (dot-cat)

ドット絵の猫を愛でるだけのスマホ向けWebゲーム。ビルド不要・依存なし。

## 開発

```bash
python3 -m http.server 8123
```

`http://127.0.0.1:8123/index.html` を開く。

- `index.html` 画面とUI
- `main.js` ゲーム本体
- `sprites.js` 猫・アイテムのドット絵
- `manifest.webmanifest` ホーム画面追加用の設定

データはブラウザの `localStorage`(キー `dotcat.v1`)に保存される。
