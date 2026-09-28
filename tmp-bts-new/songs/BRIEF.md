# New BTS 단원 노래 작성 지침 / Unit song brief

## Goal
Write ONE original song (or chant) for each unit listed in your assignment. It will be sung by Korean
elementary students (with Filipino teachers, online 1:2 video class) as the warm-up right after the Hello Song,
in every lesson of that unit.

## Input
`scope/bts-NN.json` → `units[]` with `unit, lessons, titles, goals, words [[en, ko]], sentences, songs`.
Only write for units whose `songs` is empty AND that are in your assignment.

## Rules (must)
1. **Original lyrics only.** Never reuse or paraphrase lyrics of an existing song.
2. **Melody = public-domain tune only**, from this list (write the exact name in `tune`):
   Twinkle Twinkle Little Star · Row, Row, Row Your Boat · London Bridge Is Falling Down · Mary Had a Little Lamb ·
   The Farmer in the Dell · Here We Go Round the Mulberry Bush · Frère Jacques (Are You Sleeping?) ·
   Old MacDonald Had a Farm · This Old Man · Skip to My Lou · Oh My Darling, Clementine · Yankee Doodle ·
   Pop Goes the Weasel · The Muffin Man · Baa, Baa, Black Sheep · Oh! Susanna · Bingo
   — OR `Clap chant (4 beats)` / `Rap chant (4 beats)` for older books (roughly BTS 18+) where a nursery tune feels babyish.
   Use a variety of tunes within one book (don't give every unit the same one).
3. The syllables of each line must actually fit the chosen tune (sing it in your head, line by line).
   For chants, keep 4 strong beats per line.
4. **Use only this unit's words and sentence patterns** (from `words`, `goals`, `sentences`). The target pattern
   must appear at least twice. Level must match the book (BTS 2 ≈ very first year; BTS 34 ≈ upper elementary).
   Grammar must be correct natural English. No `___` blanks.
5. Length: 6–8 lines, each line ≤ 48 characters (it's shown big on one slide). Kid-safe, positive, no brand names,
   no real people, no body-shaming, no religion/politics.
6. `title`: short English title, may end with one emoji. Must not duplicate an existing song title in the book.
7. `nt` (Korean, ≤ 20자): 짧은 슬라이드 설명, e.g. "직업 노래(새로 지음)".
8. `n` (Korean, 2 items): ① 곡조 안내 — "곡조: <tune> (저작권 만료 곡) — 가사는 이 단원 낱말로 새로 지었습니다"
   ② 교실 동작 — one concrete gesture/action idea for online video class.
9. `imgPrompt` (English, 1 sentence): a picture for the song slide. Scene only, describing kids/animals doing the song's
   content. Do NOT mention text/letters/words in the image. Style will be appended automatically.
10. `key`: `bts-NN-song-<slug>` (lowercase, a–z0–9 and -), unique.

## Output
Write `lyrics/bts-NN.json` for each book in your assignment:
```json
{ "book": 9, "songs": [ { "unit": "Unit 1", "key": "bts-09-song-zoo", "title": "...", "tune": "...",
  "lines": ["...", "..."], "nt": "...", "n": ["...", "..."], "imgPrompt": "..." } ] }
```
`unit` must equal the unit string in the scope file exactly. Validate the JSON parses (`node -e` or python).
Finally, reply with a compact table: book · unit · title · tune — nothing else.
