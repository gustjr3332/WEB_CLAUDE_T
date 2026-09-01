from rest_framework.routers import DefaultRouter

from .views import ContestViewSet, JudgeViewSet, ScoreViewSet, SubmissionViewSet, TeamViewSet

router = DefaultRouter()
router.register('contests', ContestViewSet)
router.register('teams', TeamViewSet, basename='team')
router.register('submissions', SubmissionViewSet, basename='submission')
router.register('judges', JudgeViewSet, basename='judge')
router.register('scores', ScoreViewSet, basename='score')

urlpatterns = router.urls
