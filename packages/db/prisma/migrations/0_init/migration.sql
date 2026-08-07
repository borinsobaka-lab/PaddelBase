-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."Role" AS ENUM ('PLAYER', 'ORGANIZER', 'ADMIN');

-- CreateEnum
CREATE TYPE "app"."Visibility" AS ENUM ('PUBLIC', 'LINK');

-- CreateEnum
CREATE TYPE "app"."MatchStatus" AS ENUM ('DRAFT', 'OPEN', 'FILLED', 'CONFIRMED', 'PLAYED', 'COMPLETED', 'DISPUTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "app"."ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "app"."TournamentFormat" AS ENUM ('AMERICANO', 'MEXICANO', 'TEAM_AMERICANO', 'TEAM_MEXICANO');

-- CreateEnum
CREATE TYPE "app"."TournamentStatus" AS ENUM ('DRAFT', 'REGISTRATION', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "app"."RoundStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "app"."NotificationType" AS ENUM ('MATCH_APPLICATION', 'APPLICATION_ACCEPTED', 'APPLICATION_REJECTED', 'MATCH_FILLED', 'MATCH_REMINDER', 'RESULT_ENTER', 'RESULT_CONFIRM', 'RATING_CHANGED', 'TOURNAMENT_ROUND', 'POST_COMMENT');

-- CreateEnum
CREATE TYPE "app"."JobStatus" AS ENUM ('RUNNING', 'OK', 'FAILED');

-- CreateTable
CREATE TABLE "app"."users" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT,
    "phone" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "city" TEXT,
    "role" "app"."Role" NOT NULL DEFAULT 'PLAYER',
    "level" DECIMAL(4,3) NOT NULL,
    "startLevel" DECIMAL(4,3) NOT NULL,
    "selfAssessedLevel" DECIMAL(4,3) NOT NULL,
    "onboardingAnswers" JSONB,
    "reliabilityBase" DECIMAL(4,3) NOT NULL DEFAULT 0.050,
    "reliability" DECIMAL(4,3) NOT NULL DEFAULT 0.050,
    "ratedMatchesCount" INTEGER NOT NULL DEFAULT 0,
    "lastRatedMatchAt" TIMESTAMP(3),
    "activityScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."courts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "courtsQty" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."matches" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "isRated" BOOLEAN NOT NULL,
    "visibility" "app"."Visibility" NOT NULL DEFAULT 'PUBLIC',
    "slotsTotal" INTEGER NOT NULL DEFAULT 4,
    "slotsMissing" INTEGER NOT NULL,
    "courtBooked" BOOLEAN NOT NULL DEFAULT false,
    "levelMin" DECIMAL(4,3),
    "levelMax" DECIMAL(4,3),
    "comment" TEXT,
    "status" "app"."MatchStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."match_players" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "team" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."match_applications" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "app"."ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."match_results" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "sets" JSONB NOT NULL,
    "gamesA" INTEGER NOT NULL,
    "gamesB" INTEGER NOT NULL,
    "winnerTeam" INTEGER NOT NULL,
    "enteredById" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "isRatingApplied" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tournaments" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "format" "app"."TournamentFormat" NOT NULL,
    "isRated" BOOLEAN NOT NULL,
    "visibility" "app"."Visibility" NOT NULL DEFAULT 'PUBLIC',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "courtsCount" INTEGER NOT NULL,
    "maxParticipants" INTEGER NOT NULL,
    "pointsPerRound" INTEGER NOT NULL,
    "roundsCount" INTEGER NOT NULL,
    "restCompensation" DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    "feeAmount" INTEGER,
    "feeCurrency" TEXT DEFAULT 'GEL',
    "description" TEXT,
    "status" "app"."TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "seed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tournament_teams" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT,
    "captainId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "pointsAgainst" INTEGER NOT NULL DEFAULT 0,
    "restCount" INTEGER NOT NULL DEFAULT 0,
    "finalPlace" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tournament_participants" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "levelAtStart" DECIMAL(4,3) NOT NULL,
    "reliabilityAtStart" DECIMAL(4,3) NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "pointsAgainst" INTEGER NOT NULL DEFAULT 0,
    "restCount" INTEGER NOT NULL DEFAULT 0,
    "finalPlace" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tournament_rounds" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "app"."RoundStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "tournament_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tournament_matches" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "courtNumber" INTEGER NOT NULL,
    "scoreA" INTEGER,
    "scoreB" INTEGER,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "status" "app"."RoundStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tournament_match_players" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "team" INTEGER NOT NULL,

    CONSTRAINT "tournament_match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."rating_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT,
    "tournamentId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "levelBefore" DECIMAL(4,3) NOT NULL,
    "levelAfter" DECIMAL(4,3) NOT NULL,
    "delta" DECIMAL(5,4) NOT NULL,
    "reliabilityBefore" DECIMAL(4,3) NOT NULL,
    "reliabilityAfter" DECIMAL(4,3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "configVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."posts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "media" JSONB NOT NULL DEFAULT '[]',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."post_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."post_likes" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."post_reports" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "commentId" TEXT,
    "reason" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "app"."NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."job_runs" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" "app"."JobStatus" NOT NULL DEFAULT 'RUNNING',
    "details" JSONB,
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegramId_key" ON "app"."users"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "app"."users"("phone");

-- CreateIndex
CREATE INDEX "users_level_idx" ON "app"."users"("level");

-- CreateIndex
CREATE INDEX "courts_city_isActive_idx" ON "app"."courts"("city", "isActive");

-- CreateIndex
CREATE INDEX "matches_status_startsAt_idx" ON "app"."matches"("status", "startsAt");

-- CreateIndex
CREATE INDEX "matches_courtId_startsAt_idx" ON "app"."matches"("courtId", "startsAt");

-- CreateIndex
CREATE INDEX "matches_creatorId_idx" ON "app"."matches"("creatorId");

-- CreateIndex
CREATE INDEX "match_players_userId_idx" ON "app"."match_players"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "match_players_matchId_userId_key" ON "app"."match_players"("matchId", "userId");

-- CreateIndex
CREATE INDEX "match_applications_userId_status_idx" ON "app"."match_applications"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "match_applications_matchId_userId_key" ON "app"."match_applications"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_matchId_key" ON "app"."match_results"("matchId");

-- CreateIndex
CREATE INDEX "match_results_confirmedAt_idx" ON "app"."match_results"("confirmedAt");

-- CreateIndex
CREATE INDEX "match_results_confirmedAt_disputedAt_enteredAt_idx" ON "app"."match_results"("confirmedAt", "disputedAt", "enteredAt");

-- CreateIndex
CREATE INDEX "tournaments_status_startsAt_idx" ON "app"."tournaments"("status", "startsAt");

-- CreateIndex
CREATE INDEX "tournaments_organizerId_idx" ON "app"."tournaments"("organizerId");

-- CreateIndex
CREATE INDEX "tournament_teams_tournamentId_idx" ON "app"."tournament_teams"("tournamentId");

-- CreateIndex
CREATE INDEX "tournament_participants_userId_idx" ON "app"."tournament_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_participants_tournamentId_userId_key" ON "app"."tournament_participants"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_rounds_tournamentId_roundNumber_key" ON "app"."tournament_rounds"("tournamentId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_matches_roundId_courtNumber_key" ON "app"."tournament_matches"("roundId", "courtNumber");

-- CreateIndex
CREATE INDEX "tournament_match_players_userId_idx" ON "app"."tournament_match_players"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_match_players_matchId_userId_key" ON "app"."tournament_match_players"("matchId", "userId");

-- CreateIndex
CREATE INDEX "rating_events_userId_occurredAt_idx" ON "app"."rating_events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "rating_events_occurredAt_idx" ON "app"."rating_events"("occurredAt");

-- CreateIndex
CREATE INDEX "posts_createdAt_idx" ON "app"."posts"("createdAt");

-- CreateIndex
CREATE INDEX "posts_isPinned_createdAt_idx" ON "app"."posts"("isPinned", "createdAt");

-- CreateIndex
CREATE INDEX "post_comments_postId_createdAt_idx" ON "app"."post_comments"("postId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "post_likes_postId_userId_key" ON "app"."post_likes"("postId", "userId");

-- CreateIndex
CREATE INDEX "post_reports_isResolved_createdAt_idx" ON "app"."post_reports"("isResolved", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "app"."notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "app"."notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "job_runs_job_startedAt_idx" ON "app"."job_runs"("job", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_job_windowKey_key" ON "app"."job_runs"("job", "windowKey");

-- AddForeignKey
ALTER TABLE "app"."matches" ADD CONSTRAINT "matches_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."matches" ADD CONSTRAINT "matches_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "app"."courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."match_players" ADD CONSTRAINT "match_players_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "app"."matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."match_players" ADD CONSTRAINT "match_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."match_applications" ADD CONSTRAINT "match_applications_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "app"."matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."match_applications" ADD CONSTRAINT "match_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."match_results" ADD CONSTRAINT "match_results_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "app"."matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."match_results" ADD CONSTRAINT "match_results_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."match_results" ADD CONSTRAINT "match_results_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournaments" ADD CONSTRAINT "tournaments_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournaments" ADD CONSTRAINT "tournaments_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "app"."courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournament_teams" ADD CONSTRAINT "tournament_teams_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "app"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournament_teams" ADD CONSTRAINT "tournament_teams_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournament_participants" ADD CONSTRAINT "tournament_participants_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "app"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournament_participants" ADD CONSTRAINT "tournament_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournament_participants" ADD CONSTRAINT "tournament_participants_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "app"."tournament_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournament_rounds" ADD CONSTRAINT "tournament_rounds_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "app"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournament_matches" ADD CONSTRAINT "tournament_matches_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "app"."tournament_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournament_match_players" ADD CONSTRAINT "tournament_match_players_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "app"."tournament_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tournament_match_players" ADD CONSTRAINT "tournament_match_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."rating_events" ADD CONSTRAINT "rating_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."rating_events" ADD CONSTRAINT "rating_events_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "app"."matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."rating_events" ADD CONSTRAINT "rating_events_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "app"."tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "app"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."post_comments" ADD CONSTRAINT "post_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."post_likes" ADD CONSTRAINT "post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "app"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."post_likes" ADD CONSTRAINT "post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."post_reports" ADD CONSTRAINT "post_reports_postId_fkey" FOREIGN KEY ("postId") REFERENCES "app"."posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."post_reports" ADD CONSTRAINT "post_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

