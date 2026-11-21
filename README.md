# 深海クラゲ観察

光る深海を、ただ眺める。クラゲが静かに、あなたの前を通り過ぎていく。

公開先: https://muse-motoko.github.io/deep-sea-jellyfish/

## 構成
- `index.html` / `style.css`: ページ本体・OGP メタ
- `js/main.js`: Three.js（r160、jsdelivr CDN を importmap で読み込み）のシーン
- `js/config.js`、`js/rng.js`: DOM・three に依存しない logic（設定・シード付き乱数）
- `test.js`: `node test.js` でテスト
- `ogp.png`: OGP 画像（1200×630、実画面のスクリーンショット）

単一ページ・ビルドなし。ローカルでは `python3 -m http.server` などで配信して開きます。

## 進捗
- S1: 土台・OGP・テスト基盤（このPR）
- S3: ブルーム（UnrealBloom）と3種（ミズクラゲ型・カラゲ型・巨大クラゲ型・複数個体（PC 12匹／スマホ 7匹）
  - `js/species.js`: 種類定義・ティア判定・配置ロジック（テスト対象）
- S4: 粒子（プランクトン・泡。PC 600／スマホ 250 合計）
  - `js/particles.js`: 粒子の更新ロジック（テスト対象）、`js/particle-view.js`: Points 描画
- S5: カメラ。ゆっくり漂う自動カメラ＋ドラッグ／スワイプ・ピンチ・ホイール（角度と距離に制限、離すと戻る）。縦持ちでは距離を引く
  - `js/camera.js`: カメラ制御ロジック（テスト対象）
- S8: スマホ最適化・自動減数
  - `js/perf.js`: FPS 監視と自動減数（4段階: 100/80/60/40%)。平均 FPS が 40 未満で減らし、56 以上が12秒続けば戻す（テスト対象）
  - ピクセル比 スマホ最大1.5、ブルーム解像度は半分、`touch-action: none`、`viewport` 設定、ボタンは下部・44px 以上
- S9: 仕上げ
  - フック文の折り返し修正（`text-wrap: balance`）、イントロ（タイトル・フック文）を約6秒後に3秒かけてフェードアウト
  - OGP 画像を実画面スクショに差し替え
