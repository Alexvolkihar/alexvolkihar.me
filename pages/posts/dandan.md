---
title: "Dandan: furigana that fade as you learn"
date: 2026-11-05T00:00:00Z
lang: en
art: random
image: /images/dandan-hero.png
duration: 7min
description: Dandan is a Japanese font that draws furigana over kanji words by itself, and drops them for the JLPT levels you already know. How the ligatures work, what browsers get in the way of, and where it guesses wrong.
---

> **English Version** | [Version Française](/posts/dandan-fr) | [日本語版](/posts/dandan-ja)

[Dandan](https://dandan.alexvolkihar.ovh) is a Japanese font that draws furigana above kanji words. You give it plain text and it shows the readings, with no `<ruby>` markup and no JavaScript. It also knows the JLPT lists: tell it which level you have reached, and the words of that level and the easier ones lose their readings. The harder words keep them.

The name is 段々 (*dandan*), "step by step". The font is free under the SIL Open Font License, and it is built on Noto Sans JP.

![The Dandan landing page: the title, the download button and a specimen with every reading shown](/images/dandan-hero.png)

## Where the idea comes from

Anthony Fu made [Furifont](https://furifont.antfu.me) ([source](https://github.com/antfu/furifont)), a font that sets furigana on its own. It showed that the idea works in a browser, and it is where I learned that browsers shape kanji and kana in separate runs. Dandan is a separate implementation, written in Python with fontTools, and it shares no code with Furifont.

What I wanted on top was a way to say what I already know. Furigana on every word helps for a week. After that, the readings of 学校 and 勉強 sit above words you read without them, and they make the line noisy. A reader at N3 needs readings for 状況 and 対策, not for 日曜日.

## Try it

- Website, playground and downloads: [dandan.alexvolkihar.ovh](https://dandan.alexvolkihar.ovh)
- Source code (build scripts, data pipeline, tests): [github.com/Alexvolkihar/dandan](https://github.com/Alexvolkihar/dandan)

Load it like any web font, and set a tall enough line height, because the furigana live in the space above the line:

```css
@font-face {
  font-family: "Dandan";
  src: url("Dandan.woff2") format("woff2");
}

.jp {
  font-family: "Dandan";
  line-height: 1.7;
}

/* hide N5 and N4 readings */
.knows-n4 { font-feature-settings: "ss04" 1; }

/* hide every reading */
.no-furigana { font-feature-settings: "calt" 0; }
```

The levels are stylistic sets. `ss05` hides N5 words, `ss04` hides N5 and N4, and so on down to `ss01`, which hides every word on a JLPT list. Only words that are on no list keep their readings then. Turning `calt` off removes all furigana. Everything is in one file, so a reader can change level without loading another font.

![The same three sentences with no level known, with N4 known and with N2 known](/images/dandan-levels.png)

Apps that don't expose stylistic sets can use a font with the level baked in: the builder's `--level N4` produces a font whose default already hides N5 and N4.

![The specimen at N3: the stairs, the five words that just lost their reading and the CSS line to copy](/images/dandan-specimen-n3.png)

## One glyph per word

The font has no idea what a sentence means. What it can do is substitute glyphs, so each word with its reading is drawn in advance as a glyph of its own: the kanji side by side, with the kana at half size above them. An OpenType ligature replaces the plain kanji with that glyph when the word appears.

Where a reading fits over each kanji, it sits there (日[に]本[ほん]語[ご]). Otherwise the whole reading is centered over the word and condensed to its width, so it never spills into the next word. The kana come from a heavier instance of the variable font (600 against 400 for the text), because at half size the regular weight looks washed out.

The rules run in this order:

1. `words`: ligatures of two or more kanji. The longest sequence is tried first, so 日本語 wins over 日本.
2. `okurigana`: a lone kanji followed by a given kana takes that word's reading (食 + べ gives た over 食).
3. `kanji`: a lone kanji takes its one unambiguous reading (見 in 見る gives み).
4. `hide N5` to `hide N1`: multiple substitutions that turn the annotated glyph of a listed word back into its plain kanji.

The hide rules run after the ligatures on purpose. A word you know still has to win the longest match, otherwise 勉強 would lose its ligature and its two kanji could pick up readings one by one. So it becomes the annotated glyph first, and then goes back to plain kanji.

![How it works on the site: plain text, the longest match, then ss05 putting the known word back](/images/dandan-how.png)

## Picking one reading

The data comes from three places. JMdict gives the written forms, readings and priority tags. JmdictFurigana says which kana go over which kanji. The JLPT lists from yomitan-jlpt-vocab give a level per word.

A run of kanji can have several readings. The builder keeps one only when it clearly wins. Inside one JMdict entry the first reading listed wins, so 今日 is きょう and not こんにち. Across entries, a reading is kept only if it is at least three times as frequent as the next one. Lone 食 can be た, く or しょく, so it stays bare. 2,166 runs end up bare this way. I prefer a bare kanji to a wrong reading.

Some kanji change reading inside compounds. 都 is みやこ alone and と in 東京都, so a lone kanji also stays bare when a common suffix or prefix reads it another way. A few counters after digits (日, 月, 年, 時, 本, 分, 人) stay bare too.

## The glyph budget

An OpenType font can hold 65,535 glyphs. The base font, cut down to JIS X 0208 (its 6,355 kanji, plus kana, Latin and punctuation) and the furigana kana, takes 7,860. I keep 64 in reserve, which leaves 57,611 for words.

The dictionary offers 136,639 candidates, so more than half are cut. JLPT words go first, then the common JMdict words by frequency, then the other JMdict words, those written only with JIS level 1 kanji and shorter ones first. The final font has 65,471 glyphs, and the WOFF2 is about 1.8 MB. A build with only the common words (`--dictionary common`) comes out at about 1.3 MB.

Every level has the same glyphs, since a known word still needs its ligature. Only the rules differ, so the six builds are within a few hundred bytes of each other.

## What browsers get in the way of

Before shaping, a browser cuts the text into runs by script. In 食べる the font sees 食 in one run and べる in another, and the okurigana rule never sees the two together. HarfBuzz applies it when it gets the whole string, and the tests check that. In a browser, only the lone kanji rule fires, so kanji with several readings such as 食, 行 and 話 stay bare there.

The same thing happens at line breaks. If a line wraps inside 提案, each half is shaped alone and can get a reading of its own. `word-break: auto-phrase` in Chromium, with `lang="ja"`, breaks between phrases instead.

## Building and testing

The builder is about 1,300 lines of Python. It downloads Noto Sans JP and the dictionaries, records their checksums, compiles the readings, draws the composite glyphs and appends the lookups to the base font's GSUB table. The first build prepares the subset font and the dictionary cache, and later builds take about a minute.

There are 20 tests. The shaping tests run HarfBuzz on the built fonts: 今日 is one annotated ligature, 日本語 beats 日本, an N5 word is bare in the N5 build and annotated in the full one, the stylistic sets hide levels at run time, `calt` off leaves text bare, and the glyph count stays under 65,535.

![The playground: a sample text, the level stairs, size and line height, and the CSS for the current settings](/images/dandan-playground.png)

## Limits

- Readings can be wrong. The font sees a run of kanji, not the sentence. The longest match can cut a run in the wrong place, and a word with two readings (人気: にんき or ひとけ) always gets its most frequent one.
- Okurigana rules don't fire in browsers, for the reason above.
- The JLPT levels are an estimate. There has been no official list since 2010, and Jonathan Waller's lists put 日本 at N3 and leave 日本語 out, which is why 日本語 keeps its reading even at N2 in the picture above.
- 1.8 MB is a lot for a web font.
- Horizontal text only: shapers skip `calt` in vertical writing. Readings are hiragana only, and words with kanji outside JIS X 0208 get none.

Check the readings that matter. Dandan is a reading aid, and it guesses from a dictionary.

## Credits

- [Furifont](https://furifont.antfu.me) by Anthony Fu, for the idea of furigana drawn by the font and the finding about script runs.
- [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) by Adobe and Google, under the SIL OFL 1.1.
- [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) by the EDRDG, [JmdictFurigana](https://github.com/Doublevil/JmdictFurigana) by Doublevil, and [yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab), built on Jonathan Waller's [JLPT lists](http://www.tanos.co.uk/jlpt/). The reading data inside the font stays under CC BY-SA 4.0.
- [fontTools](https://github.com/fonttools/fonttools) and [HarfBuzz](https://harfbuzz.github.io/).

The font, the playground and the downloads are on [dandan.alexvolkihar.ovh](https://dandan.alexvolkihar.ovh). The source is public on [GitHub](https://github.com/Alexvolkihar/dandan).
