\version "2.24.0"
\header {
  title = "ONE GOAL"
  subtitle = "オギカワールドカップ 主題歌"
  composer = "作詞・作曲：Claude"
  tagline = ##f
}
\paper {
  #(set-paper-size "a4")
  property-defaults.fonts.serif = "WenQuanYi Zen Hei"
  property-defaults.fonts.sans = "WenQuanYi Zen Hei"
  top-margin = 12 bottom-margin = 12 left-margin = 15 right-margin = 15
  system-system-spacing.basic-distance = #14
}
\score {
  <<
    \new ChordNames \chordmode { b1:m g1 d1 a1 b1:m g1 d1 a1 b1:m g1 a1 a1 g1 a1 g1 a1 d1 a1 b1:m g1 d1 a1 g1 a2 d2 d1 a1 b1:m g1 g1 a1 g2 a2 d1 }
    \new Staff \with { instrumentName = "歌" } { \new Voice = "mel" { \absolute { \clef treble \key d \major \time 4/4 \tempo "熱く！" 4 = 140 \mark \markup \box "Intro" fis'4. fis'8 a'4 b'4 | a'4. fis'8 e'2 | fis'4. fis'8 a'4 b'4 | r4 a'8 a'8 b'8 d''4. | \mark \markup \box "Aメロ" \bar "||" b'8 b'8 a'8 b'8 d''4 fis'8 fis'8 | g'8 g'8 a'8 b'8 a'8 g'8 fis'8 r8 | r8 fis'8 a'8 a'8 b'8 d''4 r8 | cis''8 cis''8 b'8 a'8 a'4. r8 | r8 b'4 a'8 b'8 d''8 d''8 d''8 | b'8 b'8 a'8 g'8 a'8 b'4. | a'8 a'8 a'8 b'8 cis''8 cis''8 b'8 r8 | a'8 a'8 b'8 cis''8 cis''8 e''4. | \mark \markup \box "Bメロ" \bar "||" d''8 d''8 d''8 d''8 e''8 d''4 r8 | cis''8 cis''8 cis''8 d''4 e''4 r8 | d''8 d''8 d''8 e''8 e''8 d''8 b'4 | a'4 cis''4 e''2 | \mark \markup \box "サビ" \bar "||" d''8 d''8 d''4 e''4 d''8 cis''8 | cis''8 a'8 a'8 b'8 cis''8 e''4. | d''8 d''8 d''8 fis''4 e''4. | d''4 b'8 b'8 a'8 b'8 b'4 | a'8 d''4 a'8 e''4. r8 | cis''8 cis''8 d''8 e''8 d''8 cis''4 r8 | d''4 d''8 d''8 e''8 d''8 b'4 | a'8 cis''8 e''4 d''2 | \mark \markup \box "Outro" \bar "||" fis'4. fis'8 a'4 b'4 | a'4. fis'8 e'2 | fis'4. fis'8 a'4 b'4 | r4 a'8 a'8 b'8 d''4. | d''8 d''4 r8 d''8 d''4 r8 | e''8 e''4 r8 e''8 e''4 r8 | d''4 d''8 e''8 fis''2~ | fis''1 | \bar "|." } } }
    \new Lyrics \lyricsto "mel" { \override LyricText.font-size = #-0.5 "Oh" "oh" "oh" "oh" "Oh" "oh" "oh" "Oh" "oh" "oh" "oh" "Let's" "go" "に" "ちゅう" "ふ" "え" "が" "な" "る" "グ" "ラ" "ウ" "ン" "ド" "が" "ゆ" "れ" "る" "は" "し" "り" "だ" "せ" "か" "ぜ" "を" "きっ" "て" "ボー" "ル" "に" "こ" "め" "ろ" "あ" "つ" "い" "お" "も" "い" "な" "か" "ま" "の" "こ" "え" "が" "せ" "な" "か" "を" "お" "す" "ま" "け" "ら" "れ" "な" "い" "こ" "の" "いっ" "しゅん" "に" "す" "べ" "て" "を" "か" "け" "て" "Here" "we" "go!" "オ" "ギ" "カ" "ワー" "ル" "ド" "カッ" "プ" "Go" "for" "the" "goal!" "も" "え" "ろ" "に" "ちゅう" "ゴー" "ル" "を" "う" "ば" "え" "One" "team," "one" "dream" "つ" "な" "げ" "パ" "ス" "を" "しょう" "り" "を" "つ" "か" "め" "We" "are" "に" "ちゅう!" "Oh" "oh" "oh" "oh" "Oh" "oh" "oh" "Oh" "oh" "oh" "oh" "Let's" "go" "に" "ちゅう" "に" "ちゅう!" "に" "ちゅう!" "に" "ちゅう!" "に" "ちゅう!" "Go" "for" "the" "goal!" }
  >>
  \layout { indent = 8\mm \context { \Score \override BarNumber.break-visibility = ##(#f #t #t) } }
}
