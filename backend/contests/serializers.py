from datetime import timedelta

from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from .models import Award, Contest, Judge, Participant, Score, Submission, Team

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password']

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
        )


class ParticipantSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Participant
        fields = ['id', 'team', 'user', 'username', 'joined_at']
        read_only_fields = ['joined_at']
        extra_kwargs = {'user': {'write_only': True}}


class SubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = ['id', 'team', 'title', 'description', 'link_url', 'repo_url', 'submitted_at']
        read_only_fields = ['submitted_at']


class TeamSerializer(serializers.ModelSerializer):
    participants = ParticipantSerializer(many=True, read_only=True)
    submission = SubmissionSerializer(read_only=True)
    # 발표 시작/종료 시각은 저장된 값이 아니라 contest.presentation_start_at 과
    # presentation_minutes 로부터 매번 계산한다 — 발표 시간을 조정해도 재배정 없이 즉시 반영된다.
    presentation_starts_at = serializers.SerializerMethodField()
    presentation_ends_at = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = [
            'id', 'contest', 'name', 'created_at', 'participants', 'submission',
            'presentation_order', 'presentation_starts_at', 'presentation_ends_at',
        ]
        read_only_fields = ['created_at', 'presentation_order']
        validators = [
            UniqueTogetherValidator(
                queryset=Team.objects.all(),
                fields=['contest', 'name'],
                message='이미 이 대회에 같은 이름의 팀이 있습니다.',
            ),
        ]

    def _slot_bounds(self, obj):
        contest = obj.contest
        if obj.presentation_order is None or contest.presentation_start_at is None:
            return None, None
        offset = timedelta(minutes=contest.presentation_minutes * (obj.presentation_order - 1))
        start = contest.presentation_start_at + offset
        end = start + timedelta(minutes=contest.presentation_minutes)
        return start, end

    def get_presentation_starts_at(self, obj):
        start, _ = self._slot_bounds(obj)
        return serializers.DateTimeField().to_representation(start) if start else None

    def get_presentation_ends_at(self, obj):
        _, end = self._slot_bounds(obj)
        end = serializers.DateTimeField().to_representation(end) if end else None
        return end


class ContestSerializer(serializers.ModelSerializer):
    # 목록/상세 조회는 ContestViewSet.get_queryset 의 annotate 값을 그대로 쓰므로 대회 수와
    # 무관하게 쿼리 수가 일정하다. annotate 가 없는 인스턴스(생성/수정 직후)만 직접 계산한다.
    team_count = serializers.SerializerMethodField()
    # 요청한 사용자가 이 대회의 심사위원인지. 프론트가 심사위원 목록을 받아 아이디를
    # 비교하는 대신 서버 판단을 그대로 쓰고, 폴링으로 배정 변경이 자동 반영된다.
    is_judge = serializers.SerializerMethodField()

    # 상태 전이 순서: recruiting → ongoing → judging → closed 만 허용(제자리도 허용, 역행·건너뛰기
    # 금지). 이 표는 "누가" 바꿀 수 있는지가 아니라 "무엇으로" 바꿀 수 있는지만 정한다 — 누가
    # 바꿀 수 있는지는 ContestViewSet.permission_classes = [IsOrganizerOrReadOnly] (운영자만)가
    # 이미 지키고 있으므로 여기서는 건드리지 않는다.
    ALLOWED_NEXT_STATUS = {
        Contest.Status.RECRUITING: {Contest.Status.RECRUITING, Contest.Status.ONGOING},
        Contest.Status.ONGOING: {Contest.Status.ONGOING, Contest.Status.JUDGING},
        Contest.Status.JUDGING: {Contest.Status.JUDGING, Contest.Status.CLOSED},
        Contest.Status.CLOSED: {Contest.Status.CLOSED},
    }

    class Meta:
        model = Contest
        fields = [
            'slug', 'name', 'description', 'status',
            'start_at', 'end_at', 'created_at', 'updated_at', 'team_count', 'is_judge',
            'presentation_start_at', 'presentation_minutes',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        start_at = attrs.get('start_at', getattr(self.instance, 'start_at', None))
        end_at = attrs.get('end_at', getattr(self.instance, 'end_at', None))
        if start_at and end_at and end_at < start_at:
            raise serializers.ValidationError({'end_at': '종료 일시는 시작 일시보다 빨라서는 안 됩니다.'})

        new_status = attrs.get('status')
        if self.instance is not None and new_status is not None:
            allowed = self.ALLOWED_NEXT_STATUS.get(self.instance.status, set())
            if new_status not in allowed:
                current_label = self.instance.get_status_display()
                raise serializers.ValidationError(
                    {'status': f'{current_label} 상태에서는 이 단계로 바꿀 수 없습니다 (현재 상태: {current_label}).'}
                )
        return attrs

    def get_team_count(self, obj):
        count = getattr(obj, 'team_count', None)
        return count if count is not None else obj.teams.count()

    def get_is_judge(self, obj):
        value = getattr(obj, 'is_judge', None)
        if value is not None:
            return value
        user = getattr(self.context.get('request'), 'user', None)
        if user is None or not user.is_authenticated:
            return False
        return obj.judges.filter(user=user).exists()


class JudgeSerializer(serializers.ModelSerializer):
    # 읽기와 쓰기 모두 아이디 문자열 하나(`username`)로 통일한다.
    username = serializers.SlugRelatedField(
        source='user',
        slug_field='username',
        queryset=User.objects.all(),
        error_messages={'does_not_exist': '존재하지 않는 사용자입니다.'},
    )
    # 이 심사위원이 입력한 점수 수. 0 이 아니면 해제할 수 없다 (JudgeViewSet.perform_destroy).
    score_count = serializers.SerializerMethodField()

    class Meta:
        model = Judge
        fields = ['id', 'contest', 'username', 'score_count']
        validators = [
            UniqueTogetherValidator(
                queryset=Judge.objects.all(),
                fields=['contest', 'username'],
                message='이미 이 대회의 심사위원으로 배정된 사용자입니다.',
            ),
        ]

    def get_score_count(self, obj):
        count = getattr(obj, 'score_count', None)
        return count if count is not None else obj.scores.count()


class MeSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['username', 'is_staff']


class ScoreSerializer(serializers.ModelSerializer):
    # perform_create 가 submission.team.contest 까지 타고 올라가므로 한 번에 조인해 둔다.
    submission = serializers.PrimaryKeyRelatedField(
        queryset=Submission.objects.select_related('team__contest')
    )
    judge_username = serializers.CharField(source='judge.user.username', read_only=True)

    class Meta:
        model = Score
        fields = [
            'id', 'submission', 'judge', 'judge_username',
            'round', 'value', 'comment', 'created_at', 'updated_at',
        ]
        read_only_fields = ['judge', 'judge_username', 'created_at', 'updated_at']


class ScoreboardEntrySerializer(serializers.Serializer):
    team_id = serializers.IntegerField()
    team_name = serializers.CharField()
    submission_title = serializers.CharField(allow_null=True)
    round = serializers.CharField()
    average_score = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    vote_count = serializers.IntegerField()
    rank = serializers.IntegerField(allow_null=True)


class AwardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Award
        fields = ['id', 'contest', 'rank', 'title']
        validators = [
            UniqueTogetherValidator(
                queryset=Award.objects.all(),
                fields=['contest', 'rank'],
                message='이미 이 등수에 배정된 상이 있습니다.',
            ),
        ]
