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
        contest = self.get_object()
        entries = []
        for team in contest.teams.select_related('submission').all():
            submission = getattr(team, 'submission', None)
            for round_value, _ in Score.Round.choices:
                agg = Score.objects.filter(
                    submission=submission, round=round_value
                ).aggregate(average=Avg('value'), count=Count('id')) if submission else {
                    'average': None, 'count': 0
                }
                entries.append({
                    'team_id': team.id,
                    'team_name': team.name,
                    'submission_title': submission.title if submission else None,
                    'round': round_value,
                    'average_score': agg['average'],
                    'vote_count': agg['count'],
                })
        entries.sort(key=lambda e: (e['average_score'] is None, -(e['average_score'] or 0)))
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
        team = serializer.save()
        Participant.objects.create(team=team, user=self.request.user)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def join(self, request, pk=None):
        team = self.get_object()
        _, created = Participant.objects.get_or_create(team=team, user=request.user)
        if not created:
            return Response({'detail': '이미 참가 중인 팀입니다.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ParticipantSerializer(
            Participant.objects.get(team=team, user=request.user)
        ).data, status=status.HTTP_201_CREATED)


class SubmissionViewSet(viewsets.ModelViewSet):
    serializer_class = SubmissionSerializer
    permission_classes = [IsTeamMemberOrReadOnly]

    def get_queryset(self):
        queryset = Submission.objects.select_related('team', 'team__contest')
        contest_slug = self.request.query_params.get('contest')
        if contest_slug:
            queryset = queryset.filter(team__contest__slug=contest_slug)
        return queryset


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
        serializer.save(judge=judge)
