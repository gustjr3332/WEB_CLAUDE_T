from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Contest, Judge, Score, Submission, Team

User = get_user_model()


def make_contest(slug='hack-2026', **kwargs):
    now = timezone.now()
    defaults = {
        'slug': slug,
        'name': '2026 교내 해커톤',
        'start_at': now,
        'end_at': now + timezone.timedelta(days=1),
    }
    defaults.update(kwargs)
    return Contest.objects.create(**defaults)


class AuthFlowTests(APITestCase):
    def test_register_and_login(self):
        res = self.client.post('/api/auth/register/', {
            'username': 'alice', 'email': 'alice@example.com', 'password': 'strongpass123',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.post('/api/auth/token/', {
            'username': 'alice', 'password': 'strongpass123',
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)


class ContestApiTests(APITestCase):
    def setUp(self):
        self.organizer = User.objects.create_user('organizer', password='pw12345678', is_staff=True)
        self.participant = User.objects.create_user('participant', password='pw12345678')
        self.contest = make_contest()

    def test_anonymous_can_list_contests(self):
        res = self.client.get('/api/contests/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)

    def test_anonymous_cannot_create_contest(self):
        res = self.client.post('/api/contests/', {
            'slug': 'x', 'name': 'X', 'start_at': timezone.now(), 'end_at': timezone.now(),
        })
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_organizer_can_create_contest(self):
        self.client.force_authenticate(self.organizer)
        res = self.client.post('/api/contests/', {
            'slug': 'hack-2027', 'name': '2027 해커톤',
            'start_at': timezone.now(), 'end_at': timezone.now(),
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_authenticated_user_can_create_team_and_is_auto_joined(self):
        self.client.force_authenticate(self.participant)
        res = self.client.post('/api/teams/', {'contest': self.contest.slug, 'name': '팀 A'})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        team = Team.objects.get(pk=res.data['id'])
        self.assertTrue(team.participants.filter(user=self.participant).exists())

    def test_only_team_member_can_submit(self):
        self.client.force_authenticate(self.participant)
        team = Team.objects.create(contest=self.contest, name='팀 B')
        team.participants.create(user=self.participant)

        other = User.objects.create_user('outsider', password='pw12345678')

        res = self.client.post('/api/submissions/', {
            'team': team.id, 'title': '제출물', 'description': '', 'link_url': '',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(other)
        res = self.client.patch(f'/api/submissions/{res.data["id"]}/', {'title': '변경'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class MeAndJudgeAssignmentTests(APITestCase):
    def setUp(self):
        self.organizer = User.objects.create_user('organizer', password='pw12345678', is_staff=True)
        self.participant = User.objects.create_user('participant', password='pw12345678')
        self.contest = make_contest()

    def test_me_reflects_organizer_status(self):
        self.client.force_authenticate(self.organizer)
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, {'username': 'organizer', 'is_staff': True})

    def test_me_requires_authentication(self):
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_organizer_can_assign_judge_by_username(self):
        self.client.force_authenticate(self.organizer)
        res = self.client.post('/api/judges/', {
            'contest': self.contest.slug, 'user_username': 'participant',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Judge.objects.filter(contest=self.contest, user=self.participant).exists())

    def test_assigning_unknown_username_fails(self):
        self.client.force_authenticate(self.organizer)
        res = self.client.post('/api/judges/', {
            'contest': self.contest.slug, 'user_username': 'nobody',
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_organizer_cannot_assign_judge(self):
        self.client.force_authenticate(self.participant)
        res = self.client.post('/api/judges/', {
            'contest': self.contest.slug, 'user_username': 'participant',
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class ScoreboardTests(APITestCase):
    def setUp(self):
        self.contest = make_contest()
        self.team = Team.objects.create(contest=self.contest, name='팀 A')
        self.submission = Submission.objects.create(team=self.team, title='제출물 A')
        self.judge_user = User.objects.create_user('judge1', password='pw12345678')
        self.judge = Judge.objects.create(contest=self.contest, user=self.judge_user)

    def test_non_judge_cannot_score(self):
        outsider = User.objects.create_user('outsider', password='pw12345678')
        self.client.force_authenticate(outsider)
        res = self.client.post('/api/scores/', {
            'submission': self.submission.id, 'round': 'preliminary', 'value': '9.5',
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_assigned_judge_can_score_and_scoreboard_aggregates(self):
        self.client.force_authenticate(self.judge_user)
        res = self.client.post('/api/scores/', {
            'submission': self.submission.id, 'round': 'preliminary', 'value': '9.5',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get(f'/api/contests/{self.contest.slug}/scoreboard/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        prelim = next(e for e in res.data if e['round'] == 'preliminary')
        self.assertEqual(prelim['team_name'], '팀 A')
        self.assertEqual(str(prelim['average_score']), '9.50')
        self.assertEqual(prelim['vote_count'], 1)

    def test_score_create_ignores_client_supplied_judge(self):
        another_judge_user = User.objects.create_user('judge2', password='pw12345678')
        Judge.objects.create(contest=self.contest, user=another_judge_user)

        self.client.force_authenticate(self.judge_user)
        res = self.client.post('/api/scores/', {
            'submission': self.submission.id, 'round': 'final', 'value': '8',
            'judge': Judge.objects.get(user=another_judge_user).id,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        score = Score.objects.get(pk=res.data['id'])
        self.assertEqual(score.judge.user, self.judge_user)
