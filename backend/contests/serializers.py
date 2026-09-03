from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Contest, Judge, Participant, Score, Submission, Team

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
        fields = ['id', 'team', 'title', 'description', 'link_url', 'submitted_at']
        read_only_fields = ['submitted_at']


class TeamSerializer(serializers.ModelSerializer):
    participants = ParticipantSerializer(many=True, read_only=True)
    submission = SubmissionSerializer(read_only=True)

    class Meta:
        model = Team
        fields = ['id', 'contest', 'name', 'created_at', 'participants', 'submission']
        read_only_fields = ['created_at']


class ContestSerializer(serializers.ModelSerializer):
    team_count = serializers.IntegerField(source='teams.count', read_only=True)

    class Meta:
        model = Contest
        fields = [
            'slug', 'name', 'description', 'status',
            'start_at', 'end_at', 'created_at', 'updated_at', 'team_count',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        start_at = attrs.get('start_at', getattr(self.instance, 'start_at', None))
        end_at = attrs.get('end_at', getattr(self.instance, 'end_at', None))
        if start_at and end_at and end_at < start_at:
            raise serializers.ValidationError({'end_at': '종료 일시는 시작 일시보다 빨라서는 안 됩니다.'})
        return attrs


class JudgeSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    user_username = serializers.CharField(write_only=True, source='user')

    class Meta:
        model = Judge
        fields = ['id', 'contest', 'username', 'user_username']

    def validate_user_username(self, value):
        try:
            return User.objects.get(username=value)
        except User.DoesNotExist:
            raise serializers.ValidationError('존재하지 않는 사용자입니다.')


class MeSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['username', 'is_staff']


class ScoreSerializer(serializers.ModelSerializer):
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
