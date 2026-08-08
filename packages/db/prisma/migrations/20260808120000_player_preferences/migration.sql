-- Предпочтения в игре: как, где и когда игроку интересно играть.
--
-- Все поля необязательные. Пустое значение означает «не указано», а не «всё
-- равно»: по «не указано» подбор не фильтрует, а «любая рука» — осознанный
-- ответ, и смешивать их нельзя.

CREATE TYPE "app"."Hand" AS ENUM ('RIGHT', 'LEFT', 'BOTH');
CREATE TYPE "app"."CourtSide" AS ENUM ('LEFT', 'RIGHT', 'ANY');
CREATE TYPE "app"."MatchPreference" AS ENUM ('RATED', 'CASUAL', 'ANY');
CREATE TYPE "app"."DayTime" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

ALTER TABLE "app"."users"
  ADD COLUMN "dominantHand"    "app"."Hand",
  ADD COLUMN "courtSide"       "app"."CourtSide",
  ADD COLUMN "matchPreference" "app"."MatchPreference",
  ADD COLUMN "preferredTimes"  "app"."DayTime"[] DEFAULT ARRAY[]::"app"."DayTime"[],
  -- Дни числами (1 — понедельник, 7 — воскресенье): с ними тривиально считать
  -- пересечения при подборе, в отличие от перечисления.
  ADD COLUMN "preferredDays"   INTEGER[] DEFAULT ARRAY[]::INTEGER[];
