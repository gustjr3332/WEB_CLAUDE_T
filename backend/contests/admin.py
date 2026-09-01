from django.contrib import admin

from .models import Contest, Judge, Participant, Score, Submission, Team


@admin.register(Contest)
class ContestAdmin(admin.ModelAdmin):
    list_display = ['slug', 'name', 'status', 'start_at', 'end_at']
    list_filter = ['status']


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ['name', 'contest', 'created_at']
    list_filter = ['contest']


admin.site.register(Participant)
admin.site.register(Submission)
admin.site.register(Judge)
admin.site.register(Score)
