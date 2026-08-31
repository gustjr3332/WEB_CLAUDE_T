from django.contrib import admin

from .models import Post


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ['slug', 'title', 'category', 'published_at', 'like_count']
    search_fields = ['title', 'body']
