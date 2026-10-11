---
title: "mochikao：どんな名前にも、ひとつの顔を"
date: 2026-10-11T00:00:00Z
lang: ja
art: random
image: /images/mochikao-home.png
duration: 6min
description: mochikaoは、どんな文字列も小さなSVGキャラクターに変える。同じ文字列からは、いつも同じ顔ができる。仕組み、小さく保つ理由、制限をまとめた。
---

> [English Version](/posts/mochikao) | [Version Française](/posts/mochikao-fr)

[mochikao](https://github.com/Alexvolkihar/mochikao)は、任意の文字列（ユーザー名、メールアドレス、ID）を小さなSVGキャラクターに変える。同じ文字列からは、サーバーでもブラウザでもスクリプトでも、いつも同じキャラクターができる。ネットワーク通信も、保存も、状態も要らない。

用途は、個性があって運用コストのかからないデフォルトアバターだ。[blobatar](https://blobatar.dev)から着想を得ている。名前は「mochi」と「kao」（顔）から来ている。以前は`bulle`、その後`bouille`という名前だった。

![mochikaoのトップページ：入力した名前、生成されたアバター、表情の選択](/images/mochikao-home.png)

## 試してみる

- サイトとエディタ：[mochikao.alexvolkihar.ovh](https://mochikao.alexvolkihar.ovh)
- npm：[npmjs.com/package/mochikao](https://www.npmjs.com/package/mochikao)
- ソースコード：[GitHub](https://github.com/Alexvolkihar/mochikao)

インストール：

```bash
npm i mochikao
```

JavaScriptから使う：

```ts
import { mochikao, resolve } from 'mochikao';

const svg = mochikao({ name: 'alex@mail.com', size: 64, background: 'squircle' });
resolve('alex'); // { shape: 'boxy', eyes: 'dot', mouth: 'cat', extra: 'blush', hue: 348, ... }
```

Reactから使う（Vue、Svelte、Solidにも同じpropsがある）：

```tsx
import { Mochikao } from 'mochikao/react';

<Mochikao name="alex" size={48} animate="hover" />
```

インストールせずにコマンドラインから使う：

```bash
npx mochikao alex --bg circle --expression happy -o alex.svg
```

画像のURLとしてそのまま使う：

```html
<img src="https://mochikao.alexvolkihar.ovh/api/alex.svg?bg=circle" width="64" height="64" alt="alex">
```

## 同じ名前、同じ顔

名前は`cyrb53`でハッシュ化され、そのハッシュが`mulberry32`の乱数生成器の種になる。体の形、目、口、アクセサリー、色相といった特徴はどれも、この生成器から引いた値だ。ほかに何も関わらないので、保存しておくものはない。

落とし穴は、引く順番に結果が左右されることだ。リストに口をひとつ足したり、目より前に乱数をひとつ余分に引いたりすると、既存のアバターがすべて変わってしまう。そこで種には世代番号の接頭辞（`src/traits.ts`の`GENERATION`）を持たせ、`alex`の特徴を固定するテストを置いた。うっかり変えればビルドが落ちる。

最初の公開前は、見た目が変わっても構わなかった。公開後にリストの順序を変えるなら、世代番号を意図的に上げ、顔が変わることを受け入れる必要がある。

## 中身

- 10種類のブロブ型の形と、任意の2つのファミリー：動物6種、果物と野菜6種。
- 目5種、口6種、アクセサリー11種、表情8種（`idle`、`happy`、`sad`、`mad`、`love`、`shy`、`sick`、`thinking`）。
- 固定できる10個の連続軸（体の大きさ、角ばり、目の間隔、視線、口の大きさなど）と、6つの色プリセット。
- 顔と体のコントラスト比は、すべての色相と明度で4.5:1以上。テストが全範囲で確かめるので、顔はいつも体と区別できる。

![ダークモードのmochikaoエディタ：うさぎ、同じ設定の別の名前、固定できる設定のパネル](/images/mochikao-editor.png)

ひとつの軸を固定しても、ほかの軸は変わらない。形だけを指定して、名前から決まる色や顔はそのまま残せる。

## あえて小さく

ライブラリは依存ゼロで、min+gzipで約7KB。任意のファミリーは別モジュールで、インポートしてオプションに渡す。

```ts
import { mochikao } from 'mochikao';
import { animals } from 'mochikao/animals';

mochikao({ name: 'alex', family: animals });
```

ファミリーは文字列でも副作用による登録でもなく、ただのオブジェクトだ。そのためコアは小さく保たれ、バンドラーは使っていないものを取り除ける（`sideEffects: false`）。動物は+1.1KB、果物と野菜は+1.5KBで、インポートしたときだけ増える。

フレームワーク用のコンポーネントも同じ考え方だ。アニメーションがなければ、`<Mochikao>`はdata URIの素の`<img>`を描画する。DOMノードは約20個ではなく1個で、長いリストで効いてくる。`animate`を指定するとインラインSVGに切り替わる。アニメーションに必要だからだ。

Vue、Svelte、Solid、Webコンポーネント、HTTPエンドポイント（`/api/<name>.svg`）、CLIにも同じAPIがある。

## 制限

- `<img>`はアニメーションできない。`animate`か`inline`がなければ、アニメーションも表情の遷移もない。
- 異なる名前が似た顔になることはありうる。mochikaoは代役であり、本人確認ではない。
- ポインターを追う目（`gaze`）は、アバターごとにリスナーを追加する。数十個なら問題ないが、数百個には向かない。
- 安定したキーを選ぶこと。ユーザーが名前を変えられるなら、ニックネームではなくIDをハッシュする。

コードは[GitHub](https://github.com/Alexvolkihar/mochikao)、パッケージは[npm](https://www.npmjs.com/package/mochikao)にある。ライセンスはMIT。
