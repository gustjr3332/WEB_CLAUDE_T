from rest_framework import permissions

from .models import Participant


class IsOrganizerOrReadOnly(permissions.BasePermission):
    """Only staff (contest organizers) may create/update/delete; anyone may read."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsTeamMemberOrReadOnly(permissions.BasePermission):
    """Only members of the team that owns a submission may write to it."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.is_staff:
            return True
        team = obj.team if hasattr(obj, 'team') else obj
        return Participant.objects.filter(team=team, user=request.user).exists()


class IsAssignedJudge(permissions.BasePermission):
    """Only a judge assigned to the submission's contest may create/update a score."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_staff:
            return True
        return obj.judge.user_id == request.user.id

