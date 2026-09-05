from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Contest(models.Model):
    class Status(models.TextChoices):
        RECRUITING = 'recruiting', '모집중'
        ONGOING = 'ongoing', '진행중'
        JUDGING = 'judging', '심사중'
        CLOSED = 'closed', '종료'

    slug = models.SlugField(primary_key=True, max_length=80)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECRUITING)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    # 발표 일정: assign_presentation_order 가 채운다. 팀 발표 시작 시각은
    # presentation_start_at + presentation_minutes * (team.presentation_order - 1) 로 계산한다.
    presentation_start_at = models.DateTimeField(null=True, blank=True)
    presentation_minutes = models.PositiveIntegerField(default=10, validators=[MinValueValidator(1)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_at']

    def __str__(self):
        return self.name


class Team(models.Model):
    contest = models.ForeignKey(Contest, related_name='teams', on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    # 발표 순서(1부터). ContestViewSet.assign_presentation_order 가 한 번에 채운다.
    presentation_order = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['name']
        unique_together = ('contest', 'name')

    def __str__(self):
        return f'{self.contest_id}/{self.name}'


class Participant(models.Model):
    team = models.ForeignKey(Team, related_name='participants', on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='participations', on_delete=models.CASCADE
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('team', 'user')

    def __str__(self):
        return f'{self.user} in {self.team}'


class Submission(models.Model):
    team = models.OneToOneField(Team, related_name='submission', on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    link_url = models.URLField(blank=True)
    repo_url = models.URLField(blank=True)
    submitted_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class Judge(models.Model):
    contest = models.ForeignKey(Contest, related_name='judges', on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='judging_contests', on_delete=models.CASCADE
    )

    class Meta:
        unique_together = ('contest', 'user')

    def __str__(self):
        return f'{self.user} judging {self.contest}'


class Score(models.Model):
    class Round(models.TextChoices):
        PRELIMINARY = 'preliminary', '예선'
        FINAL = 'final', '결선'

    submission = models.ForeignKey(Submission, related_name='scores', on_delete=models.CASCADE)
    judge = models.ForeignKey(Judge, related_name='scores', on_delete=models.CASCADE)
    round = models.CharField(max_length=20, choices=Round.choices, default=Round.PRELIMINARY)
    value = models.DecimalField(
        max_digits=5, decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('submission', 'judge', 'round')

    def __str__(self):
        return f'{self.judge} -> {self.submission} ({self.round}): {self.value}'


class Award(models.Model):
    """시상식에서 rank 등수에 붙일 상 이름(대상/최우수상/창의상 등). rank 1이 최상위."""

    contest = models.ForeignKey(Contest, related_name='awards', on_delete=models.CASCADE)
    rank = models.PositiveIntegerField()
    title = models.CharField(max_length=50)

    class Meta:
        ordering = ['rank']
        unique_together = ('contest', 'rank')

    def __str__(self):
        return f'{self.contest_id} #{self.rank} {self.title}'
