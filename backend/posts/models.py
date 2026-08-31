from django.db import models


class Post(models.Model):
    slug = models.SlugField(primary_key=True, max_length=80)
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=50, blank=True)
    body = models.TextField()
    published_at = models.DateField()
    like_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-published_at']

    def __str__(self):
        return self.title
