from django.db.models import Avg, Count
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .models import Contest, Judge, Participant, Score, Submission, Team
from .permissions import IsAssignedJudge, IsOrganizerOrReadOnly, IsTeamMemberOrReadOnly
from .serializers import (
    ContestSerializer,
    JudgeSerializer,
    MeSerializer,
    ParticipantSerializer,
    RegisterSerializer,
    ScoreboardEntrySerializer,
    ScoreSerializer,
    SubmissionSerializer,
    TeamSerializer,
)

# 대회 상태별 허용 동작. 프론트엔드 `src/rules.ts`와 동일한 규칙을 유지한다.
TEAM_FORMATION_STATUSES = {Contest.Status.RECRUITING, Contest.Status.ONGOING}
SUBMISSION_STATUSES = {Contest.Status.RECRUITING, Contest.Status.ONGOING}
SCORING_STATUSES = {Contest.Status.JUDGING}


def ensure_contest_status(contest, allowed, message):
    """Raise 403 when the contest is not in one of the allowed statuses."""
    if contest.status not in allowed:
        label = contest.get_status_display()
        raise PermissionDenied(f'{message} (현재 상태: {label})')


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MeView(generics.RetrieveAPIView):
    serializer_class = MeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class ContestViewSet(viewsets.ModelViewSet):
    queryset = Contest.objects.all()
    serializer_class = ContestSerializer
    permission_classes = [IsOrganizerOrReadOnly]
    lookup_field = 'slug'

    @action(detail=True, methods=['get'], permission_classes=[permissions.AllowAny])
    def scoreboard(self, request, slug=None):
        """Per-round ranking of every team in the contest.

        Entries are grouped by round (preliminary first), ranked by average score
        using competition ranking (ties share a rank, the next rank is skipped).
        Teams without any score in a round come last with ``rank: null``.
        """
        contest = self.get_object()
        teams = list(contest.teams.select_related('submission'))
        aggregates = (
            Score.objects.filter(submission__team__contest=contest)
            .values('submission__team_id', 'round')
            .annotate(average=Avg('value'), count=Count('id'))
        )
        by_key = {(a['submission__team_id'], a['round']): a for a in aggregates}

        entries = []
        for round_value, _ in Score.Round.choices:
            round_entries = []
            for team in teams:
                submission = getattr(team, 'submission', None)
                agg = by_key.get((team.id, round_value), {'average': None, 'count': 0})
                round_entries.append({
                    'team_id': team.id,
                    'team_name': team.name,
                    'submission_title': submission.title if submission else None,
                    'round': round_value,
                    'average_score': agg['average'],
                    'vote_count': agg['count'],
                    'rank': None,
                })

            scored = sorted(
                (e for e in round_entries if e['average_score'] is not None),
                key=lambda e: (-e['average_score'], e['team_name']),
            )
            unscored = sorted(
                (e for e in round_entries if e['average_score'] is None),
                key=lambda e: e['team_name'],
            )
            previous_score, previous_rank = None, 0
            for position, entry in enumerate(scored, start=1):
                if entry['average_score'] != previous_score:
                    previous_rank = position
                    previous_score = entry['average_score']
                entry['rank'] = previous_rank
            entries.extend(scored)
            entries.extend(unscored)

        serializer = ScoreboardEntrySerializer(entries, many=True)
        return Response(serializer.data)


class TeamViewSet(viewsets.ModelViewSet):
    serializer_class = TeamSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = Team.objects.select_related('contest').prefetch_related('participants', 'submission')
        contest_slug = self.request.query_params.get('contest')
        if contest_slug:
            queryset = queryset.filter(contest__slug=contest_slug)
        return queryset

    def perform_create(self, serializer):
        ensure_contest_status(
            serializer.validated_data['contest'], TEAM_FORMATION_STATUSES,
            '모집중 또는 진행중 상태에서만 팀을 만들 수 있습니다.',
        )
        team = serializer.save()
        Participant.objects.create(team=team, user=self.request.user)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def join(self, request, pk=None):
        team = self.get_object()
        ensure_contest_status(
            team.contest, TEAM_FORMATION_STATUSES,
            '모집중 또는 진행중 상태에서만 팀에 참가할 수 있습니다.',
        )
        _, created = Participant.objects.get_or_create(team=team, user=request.user)
        if not created:
            return Response({'detail': '이미 참가 중인 팀입니다.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ParticipantSerializer(
            Participant.objects.get(team=team, user=request.user)
        ).data, status=status.HTTP_201_CREATED)


class SubmissionViewSet(viewsets.ModelViewSet):
    serializer_class = SubmissionSerializer
    permission_classes = [IsTeamMemberOrReadOnly]

    SUBMISSION_LOCKED_MESSAGE = '심사가 시작된 뒤에는 제출물을 등록하거나 수정할 수 없습니다.'

    def get_queryset(self):
        queryset = Submission.objects.select_related('team', 'team__contest')
        contest_slug = self.request.query_params.get('contest')
        if contest_slug:
            queryset = queryset.filter(team__contest__slug=contest_slug)
        return queryset

    def perform_create(self, serializer):
        team = serializer.validated_data['team']
        if not self.request.user.is_staff and not Participant.objects.filter(
            team=team, user=self.request.user
        ).exists():
            raise PermissionDenied('해당 팀의 참가자만 제출할 수 있습니다.')
        ensure_contest_status(team.contest, SUBMISSION_STATUSES, self.SUBMISSION_LOCKED_MESSAGE)
        serializer.save()

    def perform_update(self, serializer):
        ensure_contest_status(
            serializer.instance.team.contest, SUBMISSION_STATUSES, self.SUBMISSION_LOCKED_MESSAGE
        )
        serializer.save()

    def perform_destroy(self, instance):
        ensure_contest_status(instance.team.contest, SUBMISSION_STATUSES, self.SUBMISSION_LOCKED_MESSAGE)
        instance.delete()


class JudgeViewSet(viewsets.ModelViewSet):
    serializer_class = JudgeSerializer
    permission_classes = [IsOrganizerOrReadOnly]

    def get_queryset(self):
        queryset = Judge.objects.select_related('user', 'contest')
        contest_slug = self.request.query_params.get('contest')
        if contest_slug:
            queryset = queryset.filter(contest__slug=contest_slug)
        return queryset


class ScoreViewSet(viewsets.ModelViewSet):
    serializer_class = ScoreSerializer
    permission_classes = [IsAssignedJudge]

    SCORING_LOCKED_MESSAGE = '심사중 상태에서만 채점할 수 있습니다.'

    def get_queryset(self):
        queryset = Score.objects.select_related('submission', 'judge__user')
        if self.request.user.is_staff:
            return queryset
        return queryset.filter(judge__user=self.request.user)

    def perform_create(self, serializer):
        submission = serializer.validated_data['submission']
        contest = submission.team.contest
        judge = Judge.objects.filter(contest=contest, user=self.request.user).first()
        if judge is None:
            raise PermissionDenied('이 대회의 심사위원으로 등록되어 있지 않습니다.')
        ensure_contest_status(contest, SCORING_STATUSES, self.SCORING_LOCKED_MESSAGE)
        # 같은 심사위원이 같은 라운드에 다시 POST 하면 기존 점수를 덮어쓴다 (upsert).
        # unique_together 위반으로 500 이 나는 대신, 탭이 여러 개여도 안전하게 저장된다.
        existing = Score.objects.filter(
            submission=submission,
            judge=judge,
            round=serializer.validated_data.get('round', Score.Round.PRELIMINARY),
        ).first()
        if existing is not None:
            serializer.instance = existing
        serializer.save(judge=judge)

    def perform_update(self, serializer):
        ensure_contest_status(
            serializer.instance.submission.team.contest, SCORING_STATUSES, self.SCORING_LOCKED_MESSAGE
        )
        serializer.save()
