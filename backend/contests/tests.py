from decimal import Decimal

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

    def test_login_with_wrong_password_is_rejected(self):
        User.objects.create_user('bob', password='strongpass123')
        res = self.client.post('/api/auth/token/', {'username': 'bob', 'password': 'wrong-password'})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token_issues_new_access_token(self):
        User.objects.create_user('carol', password='strongpass123')
        tokens = self.client.post('/api/auth/token/', {
            'username': 'carol', 'password': 'strongpass123',
        }).data

        res = self.client.post('/api/auth/token/refresh/', {'refresh': tokens['refresh']})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {res.data["access"]}')
        me = self.client.get('/api/auth/me/')
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data['username'], 'carol')

    def test_expired_or_garbage_access_token_returns_401(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


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
        self.assertEqual(res.data['status'], 'recruiting')

    def test_contest_end_before_start_is_rejected(self):
        self.client.force_authenticate(self.organizer)
        now = timezone.now()
        res = self.client.post('/api/contests/', {
            'slug': 'hack-bad', 'name': '거꾸로 대회',
            'start_at': now, 'end_at': now - timezone.timedelta(hours=1),
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('end_at', res.data)

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

    def test_outsider_cannot_create_submission_for_another_team(self):
        team = Team.objects.create(contest=self.contest, name='팀 C')
        team.participants.create(user=self.participant)
        outsider = User.objects.create_user('outsider', password='pw12345678')

        self.client.force_authenticate(outsider)
        res = self.client.post('/api/submissions/', {
            'team': team.id, 'title': '남의 팀에 제출', 'description': '', 'link_url': '',
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Submission.objects.filter(team=team).exists())


class ContestStatusTransitionTests(APITestCase):
    def setUp(self):
        self.organizer = User.objects.create_user('organizer', password='pw12345678', is_staff=True)
        self.participant = User.objects.create_user('participant', password='pw12345678')
        self.contest = make_contest()

    def test_organizer_can_advance_status(self):
        self.client.force_authenticate(self.organizer)
        for next_status in ['ongoing', 'judging', 'closed']:
            res = self.client.patch(f'/api/contests/{self.contest.slug}/', {'status': next_status})
            self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
            self.contest.refresh_from_db()
            self.assertEqual(self.contest.status, next_status)

    def test_non_organizer_cannot_change_status(self):
        self.client.force_authenticate(self.participant)
        res = self.client.patch(f'/api/contests/{self.contest.slug}/', {'status': 'closed'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.contest.refresh_from_db()
        self.assertEqual(self.contest.status, 'recruiting')

    def test_unknown_status_value_is_rejected(self):
        self.client.force_authenticate(self.organizer)
        res = self.client.patch(f'/api/contests/{self.contest.slug}/', {'status': 'paused'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class StatusGatingTests(APITestCase):
    """대회 상태(모집중 → 진행중 → 심사중 → 종료)에 따라 허용되는 동작이 달라진다."""

    def setUp(self):
        self.participant = User.objects.create_user('participant', password='pw12345678')
        self.judge_user = User.objects.create_user('judge1', password='pw12345678')
        self.contest = make_contest()
        self.team = Team.objects.create(contest=self.contest, name='팀 A')
        self.team.participants.create(user=self.participant)
        self.judge = Judge.objects.create(contest=self.contest, user=self.judge_user)

    def set_status(self, value):
        self.contest.status = value
        self.contest.save(update_fields=['status'])

    def test_team_can_be_created_while_ongoing(self):
        self.set_status(Contest.Status.ONGOING)
        self.client.force_authenticate(self.participant)
        res = self.client.post('/api/teams/', {'contest': self.contest.slug, 'name': '팀 B'})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_team_cannot_be_created_while_judging(self):
        self.set_status(Contest.Status.JUDGING)
        self.client.force_authenticate(self.participant)
        res = self.client.post('/api/teams/', {'contest': self.contest.slug, 'name': '팀 B'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('심사중', res.data['detail'])

    def test_cannot_join_team_after_close(self):
        self.set_status(Contest.Status.CLOSED)
        latecomer = User.objects.create_user('latecomer', password='pw12345678')
        self.client.force_authenticate(latecomer)
        res = self.client.post(f'/api/teams/{self.team.id}/join/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(self.team.participants.filter(user=latecomer).exists())

    def test_submission_is_locked_once_judging_starts(self):
        submission = Submission.objects.create(team=self.team, title='초안')
        self.set_status(Contest.Status.JUDGING)
        self.client.force_authenticate(self.participant)
        res = self.client.patch(f'/api/submissions/{submission.id}/', {'title': '심사 중 수정'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        submission.refresh_from_db()
        self.assertEqual(submission.title, '초안')

    def test_submission_cannot_be_created_after_close(self):
        self.set_status(Contest.Status.CLOSED)
        self.client.force_authenticate(self.participant)
        res = self.client.post('/api/submissions/', {
            'team': self.team.id, 'title': '늦은 제출', 'description': '', 'link_url': '',
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_judge_cannot_score_before_judging_phase(self):
        Submission.objects.create(team=self.team, title='제출물 A')
        self.set_status(Contest.Status.ONGOING)
        self.client.force_authenticate(self.judge_user)
        res = self.client.post('/api/scores/', {
            'submission': self.team.submission.id, 'round': 'preliminary', 'value': '9',
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Score.objects.count(), 0)

    def test_judge_can_score_during_judging_phase(self):
        Submission.objects.create(team=self.team, title='제출물 A')
        self.set_status(Contest.Status.JUDGING)
        self.client.force_authenticate(self.judge_user)
        res = self.client.post('/api/scores/', {
            'submission': self.team.submission.id, 'round': 'preliminary', 'value': '9',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_score_cannot_be_changed_after_close(self):
        submission = Submission.objects.create(team=self.team, title='제출물 A')
        score = Score.objects.create(submission=submission, judge=self.judge, round='final', value='7')
        self.set_status(Contest.Status.CLOSED)
        self.client.force_authenticate(self.judge_user)
        res = self.client.patch(f'/api/scores/{score.id}/', {'value': '10'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        score.refresh_from_db()
        self.assertEqual(score.value, Decimal('7'))


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

    def test_organizer_can_remove_judge(self):
        judge = Judge.objects.create(contest=self.contest, user=self.participant)
        self.client.force_authenticate(self.organizer)
        res = self.client.delete(f'/api/judges/{judge.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Judge.objects.filter(pk=judge.id).exists())


class ScoreboardTests(APITestCase):
    def setUp(self):
        self.contest = make_contest(status=Contest.Status.JUDGING)
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
        self.assertEqual(prelim['rank'], 1)

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

    def test_posting_same_round_again_updates_existing_score(self):
        self.client.force_authenticate(self.judge_user)
        first = self.client.post('/api/scores/', {
            'submission': self.submission.id, 'round': 'preliminary', 'value': '9', 'comment': '초안',
        })
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post('/api/scores/', {
            'submission': self.submission.id, 'round': 'preliminary', 'value': '7.5', 'comment': '수정',
        })
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.data['id'], first.data['id'])
        self.assertEqual(Score.objects.count(), 1)
        score = Score.objects.get()
        self.assertEqual(score.value, Decimal('7.5'))
        self.assertEqual(score.comment, '수정')


class ScoreboardRankingTests(APITestCase):
    """스코어보드는 라운드별로 평균 점수 순위를 매기고, 동점은 같은 순위를 공유한다."""

    def setUp(self):
        self.contest = make_contest(status=Contest.Status.JUDGING)
        self.judges = []
        for i in range(2):
            user = User.objects.create_user(f'judge{i}', password='pw12345678')
            self.judges.append(Judge.objects.create(contest=self.contest, user=user))

    def make_scored_team(self, name, prelim_values, final_values=()):
        team = Team.objects.create(contest=self.contest, name=name)
        submission = Submission.objects.create(team=team, title=f'{name} 제출물')
        for judge, value in zip(self.judges, prelim_values):
            Score.objects.create(submission=submission, judge=judge, round='preliminary', value=value)
        for judge, value in zip(self.judges, final_values):
            Score.objects.create(submission=submission, judge=judge, round='final', value=value)
        return team

    def board(self, round_value):
        res = self.client.get(f'/api/contests/{self.contest.slug}/scoreboard/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return [e for e in res.data if e['round'] == round_value]

    def test_teams_are_ranked_by_average_descending(self):
        self.make_scored_team('팀 낮음', ['7', '8'])       # avg 7.50
        self.make_scored_team('팀 높음', ['9', '10'])      # avg 9.50
        self.make_scored_team('팀 중간', ['8', '9'])       # avg 8.50

        prelim = self.board('preliminary')
        self.assertEqual([e['team_name'] for e in prelim], ['팀 높음', '팀 중간', '팀 낮음'])
        self.assertEqual([e['rank'] for e in prelim], [1, 2, 3])
        self.assertEqual([str(e['average_score']) for e in prelim], ['9.50', '8.50', '7.50'])
        self.assertTrue(all(e['vote_count'] == 2 for e in prelim))

    def test_tied_averages_share_rank_and_skip_next(self):
        self.make_scored_team('팀 A', ['9', '9'])   # 9.00
        self.make_scored_team('팀 B', ['8', '10'])  # 9.00
        self.make_scored_team('팀 C', ['5', '6'])   # 5.50

        prelim = self.board('preliminary')
        ranks = {e['team_name']: e['rank'] for e in prelim}
        self.assertEqual(ranks['팀 A'], 1)
        self.assertEqual(ranks['팀 B'], 1)
        self.assertEqual(ranks['팀 C'], 3)

    def test_unscored_teams_come_last_with_null_rank(self):
        self.make_scored_team('팀 점수있음', ['8', '8'])
        Team.objects.create(contest=self.contest, name='팀 미제출')
        no_score_team = Team.objects.create(contest=self.contest, name='팀 제출만')
        Submission.objects.create(team=no_score_team, title='아직 미채점')

        prelim = self.board('preliminary')
        self.assertEqual(prelim[0]['team_name'], '팀 점수있음')
        self.assertEqual(prelim[0]['rank'], 1)
        tail = prelim[1:]
        self.assertEqual({e['team_name'] for e in tail}, {'팀 미제출', '팀 제출만'})
        self.assertTrue(all(e['rank'] is None for e in tail))
        self.assertTrue(all(e['average_score'] is None for e in tail))
        self.assertTrue(all(e['vote_count'] == 0 for e in tail))

    def test_rounds_are_ranked_independently(self):
        self.make_scored_team('팀 예선강자', ['10', '10'], final_values=['6', '6'])
        self.make_scored_team('팀 결선강자', ['7', '7'], final_values=['9', '9'])

        prelim = self.board('preliminary')
        final = self.board('final')
        self.assertEqual(prelim[0]['team_name'], '팀 예선강자')
        self.assertEqual(final[0]['team_name'], '팀 결선강자')
        self.assertEqual(final[0]['rank'], 1)
        self.assertEqual(final[1]['rank'], 2)

    def test_scoreboard_lists_every_team_in_every_round(self):
        self.make_scored_team('팀 A', ['9'])
        Team.objects.create(contest=self.contest, name='팀 B')

        res = self.client.get(f'/api/contests/{self.contest.slug}/scoreboard/')
        self.assertEqual(len(res.data), 4)  # 2 teams x 2 rounds
        rounds = [e['round'] for e in res.data]
        self.assertEqual(rounds, ['preliminary', 'preliminary', 'final', 'final'])
