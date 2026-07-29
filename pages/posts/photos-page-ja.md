---
title: 写真ページについて
date: 2026-07-29T12:00:00Z
lang: ja
art: random
duration: 3min
---

> [English Version](/posts/photos-page) · [Version Française](/posts/photos-page-fr)

気づいた人もいるかもしれないけど、このサイトに[写真ページ](/photos)を追加した。前からやりたいと思っていたのに、なかなか手を付けられずにいたことのひとつ。

もともと別のドメインで自作の小さなギャラリーを運用していたんだけど、そのせいで写真がInstagram、そのギャラリー、そして自分のサイトの3箇所にバラバラになっていた。ここに全部まとめるのは理にかなっている。管理する場所もデザインも一つで済む。

でも一番のきっかけはInstagramだった。もともとは写真を共有するためのシンプルで気に入ったアプリだったのに、Metaによる<ruby>買収<rt>ばいしゅう</rt></ruby>で少しずつ変わっていった。アルゴリズム、広告、どこにでも出てくるショート動画、そこまでは我慢していた。でも[プロフィールグリッドの<ruby>縦横比<rt>じゅうおうひ</rt></ruby>が正方形から4:5に変更された](https://www.standard.co.uk/news/tech/instagram-update-how-adjust-profile-grid-what-changes-coming-b1205890.html)のが最後の一押しになった。まともな代替案も示さずに、みんなのコンテンツの見え方を勝手に変えてしまう決定だった。

幸い自分は開発者だから、我慢する代わりに自分のプラットフォームを作ることができる。[Instagramの全データのエクスポートを申請](https://accountscenter.instagram.com/info_and_permissions/dyi/)して、昔の自作ギャラリーも引っ張り出してきて、サイトに全部取り込んだ。画像処理には[`sharp`](https://github.com/lovell/sharp)を使い、メタデータも扱ってくれる[圧縮スクリプト](https://github.com/Alexvolkihar/alexvolkihar.me/blob/main/scripts/photos-manage.ts)を組み合わせているので、ホスティングのファイルサイズを気にしなくていい。

[最近の写真](/photos)をいくつか置いておく。

<div mb-8>
  <PhotoGalleryAll :limit="12" class="gap-1!" />
</div>

一部の画像は画質がいまいちで、当時のInstagramはかなり強めに<ruby>圧縮<rt>あっしゅく</rt></ruby>していた。時間をかけて何枚かは高画質のオリジナルに<ruby>差<rt>さ</rt></ruby>し替えるつもりだけど、今はこれで十分なスタート地点だと思っている。

自分のプラットフォームがようやく手に入ったので、これからはもっとこまめに写真を共有する習慣をつけたい。

読んでくれてありがとう。[僕の写真](/photos)を楽しんでもらえたら嬉しい。
